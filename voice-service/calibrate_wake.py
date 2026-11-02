r"""
calibrate_wake.py - teaches Jarvis YOUR voice, in about a minute.

Run it from the project folder with Jarvis STOPPED:
    python voice-service\calibrate_wake.py

  Step 1: say "Hey Jarvis" 5 times, in the quiet voice you want to use, about 3 s apart.
  Step 2: talk normally for 10 s WITHOUT saying Jarvis (read something aloud).

It measures how strongly the wake-word model reacts to each, picks thresholds that sit
between the two, and saves them to voice-service\wake_config.json (Jarvis reads that file
on start-up). Delete the file to go back to the defaults.

Options:  --device N   microphone number   --seconds-wake 18   --seconds-talk 10
"""
import argparse
import json
import os
import queue
import sys
import time

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

CHUNK = 1280
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wake_config.json")


def find_events(scores, start=0.08, quiet=0.05, gap_chunks=10):
    """Peak score of each separate 'Hey Jarvis' (a burst of scores, then ~0.8 s of quiet)."""
    peaks, current, quiet_run = [], None, 0
    for s in scores:
        if current is None:
            if s >= start:
                current, quiet_run = s, 0
        else:
            current = max(current, s)
            quiet_run = quiet_run + 1 if s < quiet else 0
            if quiet_run >= gap_chunks:
                peaks.append(current)
                current, quiet_run = None, 0
    if current is not None:
        peaks.append(current)
    return peaks


def choose_thresholds(wake_peaks, other_max):
    """-> (config dict or None, [notes]).  Sits between your 'Hey Jarvis' and your normal speech."""
    notes = []
    if len(wake_peaks) < 2:
        return None, [f"I only heard {len(wake_peaks)} 'Hey Jarvis'. Say it 5 times, clearly, and run this again."]
    ordered = sorted(wake_peaks)
    weak = ordered[max(0, int(len(ordered) * 0.25))]          # 25th percentile: "most of the time"
    strong = min(0.6, max(0.15, 0.85 * weak))
    floor = other_max + 0.05                                   # must clear your everyday speech
    if strong < floor:
        strong = floor
        if strong > weak:
            notes.append("Your normal speech scores close to your 'Hey Jarvis'. Wake-ups may need a clearer, closer 'Hey JAR-vis'.")
    soft = min(strong - 0.05, max(0.5 * strong, other_max * 1.15, 0.08))
    cfg = {"strong": round(float(strong), 2), "soft": round(float(max(soft, 0.05)), 2)}
    if cfg["strong"] >= 0.5:
        notes.append("Your voice already scores high: the settings are fine.")
    return cfg, notes


def collect_scores(frames, model, boost):
    scores = []
    for chunk in frames:
        out = model.predict(boost(chunk))
        scores.append(float(max(out.values())) if out else 0.0)   # plain float (numpy numbers cannot be saved as JSON)
    return scores


def mic_frames(sd, device, seconds, label):
    q = queue.Queue()

    def callback(indata, frames, time_info, status):
        q.put(indata[:, 0].copy())

    end = time.time() + seconds
    with sd.InputStream(samplerate=16000, channels=1, dtype="int16", blocksize=CHUNK, device=device, callback=callback):
        last = -1
        while time.time() < end:
            left = int(end - time.time()) + 1
            if left != last:
                print(f"\r  {label}  {left:>2}s left ", end="", flush=True)
                last = left
            try:
                yield q.get(timeout=1.0)
            except queue.Empty:
                break
    print("\r" + " " * 40 + "\r", end="")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default=None)
    ap.add_argument("--seconds-wake", type=float, default=18)
    ap.add_argument("--seconds-talk", type=float, default=10)
    args = ap.parse_args()

    import sounddevice as sd
    import wake
    from wake import VoiceLoop, load_wake_model

    device = int(args.device) if args.device is not None and str(args.device).isdigit() else args.device
    print("Loading the wake-word model...")
    model, _ = load_wake_model()

    input("\nSTEP 1 - Press Enter, then say  \"Hey Jarvis\"  5 times, about 3 seconds apart,\n         in the voice you want to use every day... ")
    model.reset()
    wake_scores = collect_scores(mic_frames(sd, device, args.seconds_wake, "Say 'Hey Jarvis' ..."), model, VoiceLoop._boost)

    input("\nSTEP 2 - Press Enter, then talk normally for 10 seconds WITHOUT saying Jarvis\n         (read this text aloud, or anything else)... ")
    model.reset()
    talk_scores = collect_scores(mic_frames(sd, device, args.seconds_talk, "Talk normally ..."), model, VoiceLoop._boost)

    peaks = find_events(wake_scores)
    other_max = max(talk_scores) if talk_scores else 0.0
    print(f"\nI heard {len(peaks)} 'Hey Jarvis' (strength: {', '.join(f'{p:.2f}' for p in sorted(peaks))}).")
    print(f"Your everyday speech reached at most {other_max:.2f}.")

    cfg, notes = choose_thresholds(peaks, other_max)
    for n in notes:
        print("  -", n)
    if cfg is None:
        return 1
    cfg["gain"] = wake.DETECT_GAIN
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    print(f"\nSaved: wakes at {cfg['strong']}, or twice at {cfg['soft']}  ->  {CONFIG_PATH}")
    print("Restart Jarvis (stop_jarvis.bat, then python jarvis_launcher.py) to use it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
