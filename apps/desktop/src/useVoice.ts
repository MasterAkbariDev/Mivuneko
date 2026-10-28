import { useEffect, useRef, useState } from "react";
import { usePreferences } from "./preferences";
import type { Mood } from "../../../packages/shared-schemas/index.ts";
import { isNative } from "./broker";
import {
  pcm16Wav,
  resampleTo16k,
  rms,
} from "../../../packages/shared-schemas/audio.ts";
import {
  deliveryFor,
  splitSpeech,
  type VoicePack,
} from "../../../packages/shared-schemas/voice-style.ts";
import { pronounce } from "../../../packages/shared-schemas/pronounce.ts";
import { getSpeechContext } from "./speechContext";
import { cleanTranscript } from "../../../packages/shared-schemas/transcript.ts";
import { publishPet } from "./session";
export function useVoice(
  onTranscript: (text: string) => void,
  onMood: (mood: Mood) => void,
  onError: (text: string) => void,
) {
  const preferences = usePreferences();
  const cloud = preferences.voiceProvider === "gemini";
  const requests = useRef(new Set<string>());
  async function cloudInvoke<T>(
    command: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const requestId = crypto.randomUUID();
    requests.current.add(requestId);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<T>(command, { ...args, requestId });
    } finally {
      requests.current.delete(requestId);
    }
  }
  const [recording, setRecording] = useState(false),
    [speaking, setSpeaking] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    context = useRef<AudioContext | null>(null),
    source = useRef<AudioBufferSourceNode | null>(null),
    phrases = useRef<AudioBufferSourceNode[]>([]),
    packs = useRef(new Map<string, VoicePack | null>()),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    frame = useRef(0),
    discard = useRef(false),
    starting = useRef(false);
  function prepare() {
    if (!context.current) context.current = new AudioContext();
    void context.current.resume();
  }
  function releaseMic() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) clearTimeout(timer.current);
  }
  async function stop() {
    generation.current++;
    discard.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseMic();
    source.current?.stop();
    source.current = null;
    for (const node of phrases.current) {
      try {
        node.stop();
      } catch {}
    }
    phrases.current = [];
    cancelAnimationFrame(frame.current);
    setRecording(false);
    setSpeaking(false);
    onMood("idle");
    if (isNative) {
      const { invoke } = await import("@tauri-apps/api/core");
      await Promise.all([
        invoke("cancel_voice"),
        ...Array.from(requests.current, (requestId) =>
          invoke("cancel_gemini", { requestId }),
        ),
      ]);
    }
  }
  async function record() {
    if (!isNative) {
      onError(
        "Microphone transcription requires the native app and a configured local whisper.cpp model.",
      );
      return;
    }
    if (starting.current || recorder.current?.state === "recording") return;
    starting.current = true;
    try {
      await stop();
      const ticket = generation.current;
      discard.current = false;
      prepare();
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
        video: false,
      });
      if (ticket !== generation.current) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = mic;
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(mic);
      recorder.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        releaseMic();
        setRecording(false);
        onError("Recording failed. No audio was uploaded.");
      };
      rec.onstop = async () => {
        releaseMic();
        setRecording(false);
        if (discard.current || ticket !== generation.current) return;
        onMood("thinking");
        try {
          const buffer = await context.current!.decodeAudioData(
            await new Blob(chunks, { type: rec.mimeType }).arrayBuffer(),
          );
          const mono = new Float32Array(buffer.length);
          for (let c = 0; c < buffer.numberOfChannels; c++) {
            const channel = buffer.getChannelData(c);
            for (let i = 0; i < mono.length; i++)
              mono[i] += channel[i] / buffer.numberOfChannels;
          }
          const wav = pcm16Wav(resampleTo16k(mono, buffer.sampleRate), 16000);
          const { invoke } = await import("@tauri-apps/api/core");
          if (ticket !== generation.current) return;
          const localTranscribe = () =>
            invoke<string>("transcribe_audio", {
              wav: Array.from(wav),
              context: preferences.sttContext ? getSpeechContext() : "",
              engine: preferences.sttEngine,
            });
          let text: string;
          if (cloud) {
            try {
              text = await cloudInvoke<string>("gemini_transcribe", {
                wav: Array.from(wav),
              });
            } catch (e) {
              if (ticket !== generation.current) return;
              onError(
                `Gemini transcription unavailable (${String(e)}). Using local transcription.`,
              );
              text = await localTranscribe();
            }
          } else text = await localTranscribe();
          if (ticket === generation.current) {
            onMood("idle");
            text = cleanTranscript(text);
            if (text) onTranscript(text);
            else onError("No speech was recognized.");
          }
        } catch (e) {
          if (ticket === generation.current) {
            onMood("idle");
            onError(String(e));
          }
        }
      };
      rec.start();
      setRecording(true);
      onMood("listening");
      timer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 29000);
    } catch (e) {
      releaseMic();
      setRecording(false);
      onMood("idle");
      onError(String(e));
    } finally {
      starting.current = false;
    }
  }
  function finishRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  // Luna's own voice: speech is split into phrases; the first plays as soon as it is
  // ready while the rest are made, with a natural pause after each. Returns false when
  // the character has no voice pack or the engine is unavailable (system voice instead).
  async function speakCharacter(
    text: string,
    volume: number,
    emotion: Mood,
    ticket: number,
  ): Promise<boolean> {
    const character = preferences.character;
    const { invoke } = await import("@tauri-apps/api/core");
    if (!packs.current.has(character))
      packs.current.set(
        character,
        await invoke<VoicePack | null>("character_voice", { character }).catch(
          () => null,
        ),
      );
    const pack = packs.current.get(character);
    const parts = splitSpeech(pronounce(text));
    if (!pack || !parts.length || ticket !== generation.current) return false;
    const delivery = deliveryFor(emotion, pack);
    const audio = context.current!;
    await audio.resume();
    const analyser = audio.createAnalyser(),
      out = audio.createGain();
    out.gain.value = volume * delivery.gain;
    analyser.connect(out);
    out.connect(audio.destination);
    const make = (phrase: string) => {
      const request = invoke<number[]>("synthesize_phrase", {
        text: phrase,
        character,
        mood: emotion,
        speed: delivery.speed,
      }).then((bytes) => audio.decodeAudioData(new Uint8Array(bytes).buffer));
      request.catch(() => {});
      return request;
    };
    let pending = make(parts[0].text),
      nextAt = 0,
      started = false,
      last: AudioBufferSourceNode | undefined;
    for (let i = 0; i < parts.length; i++) {
      let buffer: AudioBuffer;
      try {
        buffer = await pending;
      } catch (e) {
        if (ticket !== generation.current) return true;
        if (!started) return false;
        break;
      }
      if (ticket !== generation.current) return true;
      if (i + 1 < parts.length) pending = make(parts[i + 1].text);
      const node = audio.createBufferSource();
      node.buffer = buffer;
      node.connect(analyser);
      const at = Math.max(audio.currentTime + 0.03, nextAt);
      node.start(at);
      phrases.current.push(node);
      last = node;
      nextAt =
        at + buffer.duration + (parts[i].pauseMs * delivery.pauseScale) / 1000;
      if (!started) {
        started = true;
        setSpeaking(true);
        onMood("speaking");
        const samples = new Float32Array(analyser.fftSize);
        let shown = 0;
        const animate = (now: number) => {
          if (ticket !== generation.current) return;
          if (now - shown > 80) {
            analyser.getFloatTimeDomainData(samples);
            publishPet("speaking", text, rms(samples), emotion);
            shown = now;
          }
          frame.current = requestAnimationFrame(animate);
        };
        frame.current = requestAnimationFrame(animate);
      }
    }
    if (last)
      await new Promise<void>((done) => {
        last!.onended = () => done();
      });
    cancelAnimationFrame(frame.current);
    phrases.current = [];
    analyser.disconnect();
    out.disconnect();
    if (ticket === generation.current) {
      setSpeaking(false);
      onMood(emotion);
      publishPet(emotion, text, 0);
    }
    return true;
  }
  async function speak(text: string, volume: number, emotion: Mood = "happy") {
    if (!isNative) return;
    const ticket = generation.current;
    setSpeaking(true);
    try {
      prepare();
      const { invoke } = await import("@tauri-apps/api/core");
      if (ticket !== generation.current) return;
      if (!cloud && (await speakCharacter(text, volume, emotion, ticket)))
        return;
      if (ticket !== generation.current) return;
      // Characters without their own voice pack use the system voice.
      const localSpeech = () =>
        invoke<number[]>("synthesize_speech", {
          text: text.slice(0, 2000),
          style: "natural",
          language: "en",
          character: preferences.character,
        });
      let bytes: number[];
      if (cloud) {
        try {
          bytes = await cloudInvoke<number[]>("gemini_speak", {
            text: text.slice(0, 2000),
            emotion,
            character: preferences.character,
          });
        } catch (e) {
          if (ticket !== generation.current) return;
          onError(
            `Gemini speech unavailable (${String(e)}). Using the local character voice.`,
          );
          bytes = await localSpeech();
        }
      } else bytes = await localSpeech();
      if (ticket !== generation.current) return;
      const audio = context.current!;
      await audio.resume();
      const buffer = await audio.decodeAudioData(new Uint8Array(bytes).buffer);
      if (ticket !== generation.current) return;
      const node = audio.createBufferSource(),
        analyser = audio.createAnalyser(),
        gain = audio.createGain();
      gain.gain.value = volume;
      node.buffer = buffer;
      node.connect(analyser);
      analyser.connect(gain);
      gain.connect(audio.destination);
      source.current = node;
      setSpeaking(true);
      onMood("speaking");
      const samples = new Float32Array(analyser.fftSize);
      let last = 0;
      function animate(now: number) {
        if (ticket !== generation.current) return;
        if (now - last > 80) {
          analyser.getFloatTimeDomainData(samples);
          publishPet("speaking", text, rms(samples), emotion);
          last = now;
        }
        frame.current = requestAnimationFrame(animate);
      }
      frame.current = requestAnimationFrame(animate);
      node.onended = () => {
        cancelAnimationFrame(frame.current);
        if (source.current === node) source.current = null;
        node.disconnect();
        analyser.disconnect();
        gain.disconnect();
        if (ticket === generation.current) {
          setSpeaking(false);
          onMood(emotion);
          publishPet(emotion, text, 0);
        }
      };
      node.start();
    } catch (e) {
      if (ticket === generation.current) {
        setSpeaking(false);
        onMood("idle");
        onError(String(e));
      }
    }
  }
  useEffect(() => {
    const hidden = () => {
      if (
        document.hidden &&
        (starting.current || recorder.current?.state === "recording")
      )
        void stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      generation.current++;
      discard.current = true;
      releaseMic();
      if (recorder.current?.state === "recording") recorder.current.stop();
      source.current?.stop();
      cancelAnimationFrame(frame.current);
      if (isNative)
        void import("@tauri-apps/api/core").then(({ invoke }) => {
          for (const requestId of requests.current)
            void invoke("cancel_gemini", { requestId });
        });
      void context.current?.close();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  return { recording, speaking, record, finishRecording, speak, stop, prepare };
}
