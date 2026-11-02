r"""
enroll_voice.py - teach Jarvis YOUR voice, so that a TV, music or other people are ignored.

Run it from the project folder with Jarvis STOPPED (about 3 minutes, in a quiet room):
    python voice-service\enroll_voice.py

 1. It downloads a small voice-recognition model the first time (~26 MB).
 2. You read 6 short sentences in your normal voice, at your normal distance from the laptop.
 3. You play a video / TV for 20 s so it can measure how OTHER voices score against yours.
 4. It saves your voice print and the bar to voice-service\owner_voice.json.
 5. Optional test: let someone else speak, or play a video, and see that the score is below the bar.

To switch the lock off, delete voice-service\owner_voice.json. Everything stays on this computer.
"""
import argparse
import importlib.util
import sys

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import numpy as np

import speaker

SENTENCES = [
    "Jarvis, what is the weather like in Bengaluru today?",
    "Please read my unread emails and tell me which one is important.",
    "Remind me to call my friend this evening after my classes.",
    "Open the browser and search for the latest technology news.",
    "I am building a personal assistant that talks like a real friend.",
    "Send a message on WhatsApp and tell them that I will be a little late.",
]


def trim_to_speech(audio, vad, min_seconds=2.0):
    """Keep only the part with speech (drops the silence before / after the sentence)."""
    frames = [audio[i:i + 480] for i in range(0, len(audio) - 479, 480)]
    voiced = [i for i, f in enumerate(frames) if float(vad.predict(f)) > 0.5]
    if not voiced:
        return None
    start, end = max(0, voiced[0] - 6), min(len(frames), voiced[-1] + 7)
    out = audio[start * 480:end * 480]
    return out if len(out) >= min_seconds * 16000 else None


def speech_segments(audio, vad, min_seconds=1.0, max_seconds=6.0, gap_seconds=0.45):
    """Cut a recording into separate spoken sentences (split where there is a pause)."""
    frames = [audio[i:i + 480] for i in range(0, len(audio) - 479, 480)]
    voiced = [float(vad.predict(f)) > 0.5 for f in frames]
    segments, start, silent = [], None, 0
    gap = int(gap_seconds * 16000 / 480)
    for i, v in enumerate(voiced + [False] * (gap + 1)):
        if v:
            start = i if start is None else start
            silent = 0
        elif start is not None:
            silent += 1
            if silent >= gap:
                seg = audio[start * 480:(i - silent + 1) * 480]
                if len(seg) >= min_seconds * 16000:
                    segments.append(seg[: int(max_seconds * 16000)])
                start, silent = None, 0
    return segments


def record(sd, seconds, device):
    data = sd.rec(int(seconds * 16000), samplerate=16000, channels=1, dtype="int16", device=device)
    sd.wait()
    return data[:, 0].copy()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default=None)
    args = ap.parse_args()
    device = int(args.device) if args.device is not None and str(args.device).isdigit() else args.device

    if importlib.util.find_spec("sherpa_onnx") is None:
        print("The package 'sherpa-onnx' is missing.  Install it with:  pip install sherpa-onnx")
        return 1
    import os
    import sounddevice as sd
    from openwakeword.vad import VAD

    if not os.path.exists(speaker.MODEL_PATH):
        try:
            speaker.download_model()
        except Exception as exc:
            print(f"Could not download the model: {exc}")
            return 1
    extractor = speaker.make_extractor()
    vad = VAD()

    print("\nYou will read 6 sentences. Speak naturally, as you would to Jarvis.\n")
    embeddings = []
    i = 0
    while len(embeddings) < len(SENTENCES):
        sentence = SENTENCES[len(embeddings)]
        input(f"[{len(embeddings) + 1}/{len(SENTENCES)}] Press Enter, then read:\n      \"{sentence}\"\n")
        print("      recording ...", end="", flush=True)
        audio = record(sd, 7, device)
        vad.reset_states()
        speech = trim_to_speech(audio, vad)
        if speech is None:
            print(" I did not hear enough speech. Let's try that sentence again.")
            i += 1
            if i > 12:
                print("Too many failed tries - check your microphone with diagnose_voice.py")
                return 1
            continue
        embeddings.append(speaker.embed(extractor, speech))
        print(" ok")

    # --- step 2: how do OTHER voices score? (a video / TV is perfect for this)
    others = []
    print("\nSTEP 2 (recommended, 20 seconds): play a video or TV with people talking, at the volume you")
    print("normally have it, close to the laptop - or ask someone to chat nearby. This lets Jarvis set the")
    print("bar between YOUR voice and everyone else's. Don't speak yourself during this step.")
    if input("Press Enter to start (or type s to skip): ").strip().lower() != "s":
        print("      recording ...", end="", flush=True)
        audio = record(sd, 20, device)
        vad.reset_states()
        segments = speech_segments(audio, vad)
        others = [speaker.embed(extractor, seg) for seg in segments[:12]]
        print(f" heard {len(segments)} sentence(s) from other voices")
        if not others:
            print("      (no speech heard - skipping; a general bar will be used)")

    profile, notes = speaker.build_profile(embeddings, others)
    import json
    with open(speaker.PROFILE_PATH, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2)
    print(f"\nSaved your voice print (bar = {profile['threshold']}).")
    print(f"How closely each of your recordings matched the rest: {profile['genuine_scores']}")
    if profile["other_voice_scores"]:
        print(f"How closely the OTHER voices matched you:             {profile['other_voice_scores']}")
    for n in notes:
        print("  -", n)

    owner = np.array(profile["embedding"], dtype=np.float32)
    print("\nOptional test. Press Enter, then for 5 seconds either talk normally (should PASS),")
    print("or let someone else speak / play a video (should be REJECTED). Type q to finish.")
    while input("> ").strip().lower() != "q":
        print("      recording ...", end="", flush=True)
        audio = record(sd, 5, device)
        vad.reset_states()
        speech = trim_to_speech(audio, vad, min_seconds=1.0)
        if speech is None:
            print(" no speech heard.")
            continue
        score = float(speaker.embed(extractor, speech) @ owner)
        verdict = "ACCEPTED - this is you" if score >= profile["threshold"] else "REJECTED - not your voice"
        print(f" score {score:.2f} (bar {profile['threshold']}) -> {verdict}")
    print("\nDone. Restart Jarvis to use it (stop_jarvis.bat, then python jarvis_launcher.py).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
