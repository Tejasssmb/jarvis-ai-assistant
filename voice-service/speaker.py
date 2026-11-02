r"""
speaker.py - "is this MY voice?"  (the owner-voice lock)

Once you have enrolled (python voice-service\enroll_voice.py), Jarvis compares every
sentence he hears with your voice print BEFORE doing anything with it. A TV, music with
singing, a video, or another person talking is ignored; you are not.

How it works: a small neural network (WeSpeaker ResNet34, ~26 MB, runs on the CPU through
sherpa-onnx) turns a few seconds of speech into 256 numbers that describe the voice.
Two recordings of the same person give similar numbers (cosine similarity close to 1).

If anything is missing (not enrolled, model not downloaded, package not installed) the lock
simply stays off and Jarvis behaves as before.
"""
import json
import os
import time
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "models", "speaker_wespeaker.onnx")
MODEL_URL = ("https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/"
             "wespeaker_en_voxceleb_resnet34_LM.onnx")
PROFILE_PATH = os.path.join(HERE, "owner_voice.json")
SAMPLE_RATE = 16000

MIN_VERIFY_SECONDS = 0.8     # shorter than this cannot be told apart reliably -> not checked
SHORT_SECONDS = 1.6          # short sentences get a slightly lower bar
SHORT_ALLOWANCE = 0.07


def download_model(progress=print):
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    tmp = MODEL_PATH + ".part"
    progress("Downloading the voice-recognition model (about 26 MB) ...")
    urllib.request.urlretrieve(MODEL_URL, tmp)
    if os.path.getsize(tmp) < 10_000_000:
        os.remove(tmp)
        raise RuntimeError("the download looks incomplete - check your internet connection and try again")
    os.replace(tmp, MODEL_PATH)
    progress("Model ready.")


def make_extractor(model_path=None, threads=2):
    import sherpa_onnx

    cfg = sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=model_path or MODEL_PATH, num_threads=threads, debug=False, provider="cpu")
    return sherpa_onnx.SpeakerEmbeddingExtractor(cfg)


def to_float(audio):
    """int16 / float array -> float32 in [-1, 1]"""
    a = np.asarray(audio)
    if a.dtype == np.int16:
        return a.astype(np.float32) / 32768.0
    return a.astype(np.float32)


def embed(extractor, audio):
    """audio (16 kHz mono) -> unit-length voice print"""
    stream = extractor.create_stream()
    stream.accept_waveform(SAMPLE_RATE, to_float(audio))
    stream.input_finished()
    vec = np.array(extractor.compute(stream), dtype=np.float32)
    return vec / (np.linalg.norm(vec) + 1e-9)


def build_profile(embeddings, impostor_embeddings=None):
    """
    embeddings:          voice prints of several things the OWNER said.
    impostor_embeddings: voice prints of OTHER voices (a video / TV playing, another person) - optional.
    -> (profile dict, notes)

    With impostors the bar goes half-way between "the weakest the owner ever scored" and
    "the strongest anybody else scored", so it is set from real data of this room and these
    speakers. Without them it is placed a safe distance below the owner's weakest score.
    """
    notes = []
    embs = [e / (np.linalg.norm(e) + 1e-9) for e in embeddings]
    if len(embs) < 3:
        raise ValueError("need at least 3 recordings")
    mean = np.mean(embs, axis=0)
    mean /= np.linalg.norm(mean) + 1e-9
    genuine = []
    for i, e in enumerate(embs):
        others = np.mean([x for j, x in enumerate(embs) if j != i], axis=0)
        others /= np.linalg.norm(others) + 1e-9
        genuine.append(float(e @ others))
    weakest = min(genuine)

    impostor_scores = []
    if impostor_embeddings:
        impostor_scores = [float((v / (np.linalg.norm(v) + 1e-9)) @ mean) for v in impostor_embeddings]

    if impostor_scores:
        strongest = max(impostor_scores)
        threshold = (weakest + strongest) / 2
        threshold = max(threshold, strongest + 0.04)
        threshold = float(min(0.80, max(0.35, threshold)))
        if weakest - strongest < 0.08:
            notes.append("Your voice and the other voices are close together, so the lock may sometimes let another voice through or ask you to repeat. A quieter room and 40 cm from the microphone help.")
    else:
        threshold = float(min(0.60, max(0.45, weakest - 0.15)))
        notes.append("No other voices were measured, so the bar is a general one. Run enroll_voice.py again and use the 'play a video' step for a bar set from real data.")
    if weakest < 0.40:
        notes.append("Your recordings differ quite a bit from each other (noise? different distance?). Re-record in a quiet room, about 40 cm from the microphone.")

    profile = {
        "embedding": [float(x) for x in mean],
        "threshold": round(threshold, 2),
        "recordings": len(embs),
        "genuine_scores": [round(g, 2) for g in genuine],
        "other_voice_scores": [round(x, 2) for x in impostor_scores],
        "created": time.strftime("%Y-%m-%d %H:%M"),
    }
    return profile, notes


class SpeakerLock:
    def __init__(self, extractor, profile):
        self.extractor = extractor
        self.owner = np.array(profile["embedding"], dtype=np.float32)
        self.owner /= np.linalg.norm(self.owner) + 1e-9
        self.threshold = float(os.getenv("JARVIS_VOICE_LOCK_BAR") or profile["threshold"])   # env var = quick manual tuning

    @classmethod
    def load(cls, log=print):
        """The lock, or None (with a one-line reason) if it cannot be used."""
        if not os.path.exists(PROFILE_PATH):
            log("[voice-lock] off: no voice print yet (run  python voice-service\\enroll_voice.py  to switch it on)")
            return None
        try:
            with open(PROFILE_PATH, encoding="utf-8") as f:
                profile = json.load(f)
            if not os.path.exists(MODEL_PATH):
                log("[voice-lock] off: model file missing (run enroll_voice.py again)")
                return None
            lock = cls(make_extractor(), profile)
            log(f"[voice-lock] ON - only your voice is accepted (bar {lock.threshold:.2f}, enrolled {profile.get('created', '?')})")
            return lock
        except ImportError:
            log("[voice-lock] off: the sherpa-onnx package is not installed  (pip install sherpa-onnx)")
        except Exception as exc:
            log(f"[voice-lock] off: {type(exc).__name__}: {exc}")
        return None

    def score(self, audio):
        return float(embed(self.extractor, audio) @ self.owner)

    def check(self, audio):
        """-> (accepted, score or None, bar)"""
        seconds = len(audio) / SAMPLE_RATE
        if seconds < MIN_VERIFY_SECONDS:
            return True, None, self.threshold                 # too short to judge: do not lock the owner out
        bar = self.threshold - (SHORT_ALLOWANCE if seconds < SHORT_SECONDS else 0.0)
        s = self.score(audio)
        return s >= bar, s, bar
