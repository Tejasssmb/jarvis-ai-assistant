r"""
diagnose_voice.py — shows what your microphone and the "Hey Jarvis" detector really hear.

Run it from the project folder with Jarvis STOPPED:
    python voice-service\diagnose_voice.py
Then say "Hey Jarvis" clearly a few times. It prints a live level meter and the
wake-word score (a wake needs a score of 0.50 or more), then tells you what to fix.

Options:
    --device N     use microphone number N (the list is printed first)
    --gain G       boost for detection (default: the same boost Jarvis uses)
    --seconds S    how long to listen (default 25)
    --threshold T  score that counts as a wake (default 0.5)
"""
import argparse
import math
import queue
import sys
import time

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import numpy as np

CHUNK = 1280  # 80 ms at 16 kHz


def level_db(chunk):
    rms = float(np.sqrt(np.mean(chunk.astype(np.float32) ** 2)))
    return 20 * math.log10(max(rms, 1.0) / 32768)


def advise(frames_seen, max_db, max_score, threshold, fired=False):
    """Plain-English verdict from the measurements (kept separate so it can be tested)."""
    tips = []
    if frames_seen == 0:
        return ["❌ No audio arrived at all. Wrong microphone, or Windows is blocking it.",
                "   → Settings > Privacy & security > Microphone: allow apps, and desktop apps.",
                "   → Try another device from the list:  python voice-service\\diagnose_voice.py --device N"]
    if max_db < -55:
        tips.append("❌ The microphone is almost silent (loudest sound was %.0f dB)." % max_db)
        tips.append("   → Raise the level: Settings > System > Sound > Input > your mic > Volume.")
        tips.append("   → Or pick another device with --device N, or amplify with --gain 3.")
    elif max_db < -35:
        tips.append("⚠️  The microphone is quiet (loudest %.0f dB). Wake words work best above -30 dB." % max_db)
        tips.append("   → Raise the Windows input volume, or use  --gain 3  (then set JARVIS_MIC_GAIN=3).")
    else:
        tips.append("✅ Microphone level is fine (loudest %.0f dB)." % max_db)

    if fired or max_score >= threshold:
        tips.append("✅ \"Hey Jarvis\" was recognised (best score %.2f)." % max_score)
    elif max_score >= 0.15:
        tips.append("⚠️  Close, but not enough: best score %.2f (needs %.2f)." % (max_score, threshold))
        tips.append("   → Say it clearly as \"HEY JAR-vis\", 20-30 cm from the mic.")
        tips.append("   → Or make him more sensitive:  $env:JARVIS_DETECT_GAIN = \"5\"  and/or  $env:JARVIS_WAKE_SOFT = \"0.2\"")
    else:
        tips.append("❌ \"Hey Jarvis\" was not recognised (best score %.2f)." % max_score)
        if max_db >= -35:
            tips.append("   → The mic is loud enough, so say the phrase clearly twice, in a quiet room.")
        tips.append("   → If a headset is available, try it: laptop mics are the weakest link.")
    return tips


def analyse(frames, model, threshold, show=print, gain=None):
    """frames: iterable of int16 arrays (1280 samples). Returns (seen, max_db, max_score, fired)."""
    from wake import WakeTrigger

    trigger = WakeTrigger(strong=threshold)      # the exact rule Jarvis uses
    seen, max_db, max_score, fired = 0, -120.0, 0.0, False
    for i, chunk in enumerate(frames):
        if gain is None:
            from wake import VoiceLoop
            chunk = VoiceLoop._boost(chunk)                  # exactly what Jarvis hears
        elif gain != 1.0:
            chunk = np.clip(chunk.astype(np.int32) * gain, -32768, 32767).astype(np.int16)
        seen += 1
        db = level_db(chunk)
        scores = model.predict(chunk)
        score = max(scores.values()) if scores else 0.0
        max_db, max_score = max(max_db, db), max(max_score, score)
        hit = trigger.update(score)
        fired = fired or hit
        if hit or i % 2 == 0:
            bar_len = max(0, min(20, int((db + 60) / 3)))
            bar = "#" * bar_len + "-" * (20 - bar_len)
            flag = "   <<< HEY JARVIS!" if hit else ""
            show(("\r  mic [%s] %4.0f dB   wake score %.2f%s" % (bar, db, score, flag)).ljust(72), end="", flush=True)
    return seen, max_db, max_score, fired


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default=None)
    ap.add_argument("--gain", type=float, default=None)
    ap.add_argument("--seconds", type=float, default=25)
    ap.add_argument("--threshold", type=float, default=None)
    args = ap.parse_args()

    import sounddevice as sd
    import wake
    from wake import load_wake_model

    print("\nAvailable microphones (number, name):")
    default_in = sd.default.device[0]
    for idx, dev in enumerate(sd.query_devices()):
        if dev["max_input_channels"] > 0:
            mark = "   <- default" if idx == default_in else ""
            print(f"  {idx:>3}  {dev['name']}{mark}")

    device = int(args.device) if args.device is not None and str(args.device).isdigit() else args.device
    print("\nLoading the wake-word model...")
    model, _ = load_wake_model()

    q = queue.Queue()

    def callback(indata, frames, time_info, status):
        q.put(indata[:, 0].copy())

    def frames():
        end = time.time() + args.seconds
        while time.time() < end:
            try:
                yield q.get(timeout=1.0)
            except queue.Empty:
                break

    gain = args.gain                                           # None = use Jarvis's own boost
    if args.threshold is None:
        args.threshold = wake.WAKE_THRESHOLD
    print(f"\n🎤 Listening for {args.seconds:.0f} s — say \"Hey Jarvis\" a few times, clearly...\n")
    with sd.InputStream(samplerate=16000, channels=1, dtype="int16",
                        blocksize=CHUNK, device=device, callback=callback):
        try:
            seen, max_db, max_score, fired = analyse(frames(), model, args.threshold, show=print, gain=gain)
        except KeyboardInterrupt:
            print("\n(stopped)")
            return

    print("\n\n===== RESULT =====")
    for line in advise(seen, max_db, max_score, args.threshold, fired):
        print(line)
    print()


if __name__ == "__main__":
    sys.exit(main())
