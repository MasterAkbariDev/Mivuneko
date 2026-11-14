"""Private line-delimited stdio worker. No listening network socket."""
import base64
import contextlib
import gc
import io
import json
import os
import sys
import time
import threading

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
model = None
fast_model = None
fast_config = None
model_lock = threading.RLock()
idle_timer = None

STYLES = {
    "idle": "Speak naturally, warmly and clearly, with a soft friendly tone.",
    "happy": "Speak with a cheerful smile, warm excitement and lively intonation.",
    "celebrating": "Sound delighted and excited, celebrating a wonderful success.",
    "sad": "Speak softly and gently, with a tender, slightly sad tone.",
    "crying": "Speak with a trembling, tearful voice, quietly and gently.",
    "angry": "Sound playfully annoyed and firm, with emphasis, without shouting.",
    "love": "Speak tenderly and affectionately, with a soft warm smile.",
    "sleeping": "Sound sleepy and relaxed, speaking softly with unhurried pauses.",
    "surprised": "Sound genuinely surprised, with a brief lift in pitch and expressive emphasis.",
    "curious": "Sound curious and thoughtful, with bright questioning intonation.",
    "confused": "Sound puzzled and thoughtful, using gentle questioning intonation.",
    "concerned": "Sound caring, reassuring and calm.",
    "excited": "Sound enthusiastic and energetic, with bright expressive intonation.",
    "shy": "Sound shy and a little bashful, softly and warmly.",
}

def unload():
    global model
    if model is None:return {"unloaded":True}
    model = None
    gc.collect()
    import torch
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return {"unloaded": True}

def run(req):
    global model,fast_model,fast_config,idle_timer
    if idle_timer is not None:
        idle_timer.cancel()
        idle_timer = None
    if req["action"] == "speak_fast":
        if model is not None:
            unload()
        import sherpa_onnx
        import soundfile as sf
        from pathlib import Path
        folder=Path(req["fastModelDir"])
        signature=(str(folder),req["voices"])
        started=time.monotonic()
        if fast_model is None or fast_config!=signature:
            lexicons=",".join(str(p) for p in sorted(folder.glob("lexicon-*.txt")))
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=str(folder/"model.onnx"),voices=req["voices"],tokens=str(folder/"tokens.txt"),data_dir=str(folder/"espeak-ng-data"),lexicon=lexicons)
            fast_model=sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=kokoro,num_threads=4,provider="cpu"),max_num_sentences=1))
            fast_config=signature
        audio=fast_model.generate(req["text"],sid=int(req["speaker"]),speed=float(req["speed"]))
        wav=io.BytesIO();sf.write(wav,audio.samples,audio.sample_rate,format="WAV",subtype="PCM_16")
        return {"audio":base64.b64encode(wav.getvalue()).decode(),"seconds":time.monotonic()-started}
    if req["action"] == "status":
        import torch
        return {"cuda": torch.cuda.is_available(), "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU", "loaded": model is not None}
    if req["action"] == "unload":
        return unload()
    if req["action"] != "speak":
        raise ValueError("Unknown voice action")
    import torch
    import soundfile as sf
    from qwen_tts import Qwen3TTSModel
    text = req.get("text", "").strip()
    if not text or len(text) > 1200:
        raise ValueError("Speech must contain 1–1200 characters")
    speaker = req.get("speaker", "Vivian")
    allowed = ["Vivian", "Serena", "Ono_Anna", "Sohee", "Aiden", "Ryan", "Eric", "Dylan", "Uncle_Fu"]
    if speaker not in allowed:
        raise ValueError("Choose a supported Qwen voice")
    started = time.monotonic()
    if model is None:
        torch.set_num_threads(6)
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        model = Qwen3TTSModel.from_pretrained(req["modelDir"], device_map=device, dtype=torch.float16 if device.startswith("cuda") else torch.float32, attn_implementation="sdpa")
    instruction = (STYLES.get(req.get("mood"), STYLES["idle"]) + " " + req.get("instruction", ""))[:1600]
    wavs, sr = model.generate_custom_voice(text=text, language=req.get("language", "English"), speaker=speaker, instruct=instruction, max_new_tokens=1500, do_sample=True, temperature=0.7, top_p=0.9, repetition_penalty=1.05)
    def release_idle():
        with model_lock:
            unload()
    idle_timer = threading.Timer(20, release_idle)
    idle_timer.daemon = True
    idle_timer.start()
    audio = io.BytesIO()
    sf.write(audio, wavs[0], sr, format="WAV", subtype="PCM_16")
    return {"audio": base64.b64encode(audio.getvalue()).decode(), "sampleRate": sr, "duration": len(wavs[0]) / sr, "seconds": round(time.monotonic() - started, 3), "speaker": speaker, "mood": req.get("mood", "idle")}

if __name__ == "__main__":
    for line in sys.stdin:
        try:
            req = json.loads(line)
            with model_lock, contextlib.redirect_stdout(sys.stderr):
                result = run(req)
            print(json.dumps({"ok": True, "result": result}), flush=True)
        except Exception as exc:
            print(json.dumps({"ok": False, "error": str(exc)[:1500]}), flush=True)
