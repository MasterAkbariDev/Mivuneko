import { markTurn, recordSpan } from "./metrics";
import { packInfo } from "./characterPackStore";
import { speechChunks } from "../../../packages/shared-schemas/speech";
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
import { microphoneConstraints } from "./microphone";
export function useVoice(
  onTranscript: (text: string) => void,
  onMood: (mood: Mood) => void,
  onError: (text: string) => void,
  /** Only the conversation voice marks `turn.first_audio` for latency spans. */
  options: { measureTurn?: boolean } = {},
) {
  const preferences = usePreferences();
  const cloud = preferences.voiceProvider === "gemini";
  const packVoicePrompt = useRef<string | undefined>(undefined);
  const requests = useRef(new Set<string>());
  const [recording, setRecording] = useState(false),
    [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
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
    setPreparing(false);
    onMood("idle");
    publishPet("idle", "", 0);
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
        audio: microphoneConstraints(preferences),
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
          const wav = pcm16Wav(
            resampleTo16k(mono, buffer.sampleRate).subarray(0, 16000 * 120),
            16000,
          );
          const { invoke } = await import("@tauri-apps/api/core");
          if (ticket !== generation.current) return;
          const localTranscribe = () =>
            invoke<string>("transcribe_audio", {
              wav: Array.from(wav),
              context: preferences.sttContext ? getSpeechContext() : "",
              engine: preferences.sttEngine,
            });
          const sttStart = performance.now();
          let text = await localTranscribe();
          recordSpan(
            "stt.transcribe",
            performance.now() - sttStart,
            preferences.sttEngine,
          );
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
      }, 120000);
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
  // the character has no voice pack or the engine is unavailable.
  async function speakCharacter(
    text: string,
    volume: number,
    emotion: Mood,
    ticket: number,
  ): Promise<boolean> {
    const system = preferences.voiceProvider === "system";
    const character =
      preferences.renderer === "sample-vrm" ? "haru" : preferences.character;
    const { invoke } = await import("@tauri-apps/api/core");
    if (!system && !packs.current.get(character))
      packs.current.set(
        character,
        await invoke<VoicePack | null>("character_voice", { character }).catch(
          () => null,
        ),
      );
    const pack: VoicePack | null | undefined = system
      ? { engine: "kokoro", speed: 1, gain: 1 }
      : packs.current.get(character);
    const parts = speechChunks(pronounce(text), 220).flatMap((part) =>
      splitSpeech(part),
    );
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
      const request = invoke<number[]>(
        system ? "synthesize_speech" : "synthesize_phrase",
        {
          style: preferences.localVoiceStyle,
          language: preferences.localVoiceLanguage,
          text: phrase,
          character,
          mood: emotion,
          speed: delivery.speed,
        },
      ).then((bytes) => audio.decodeAudioData(new Uint8Array(bytes).buffer));
      request.catch(() => {});
      return request;
    };
    let pending = make(parts[0].text),
      nextAt = 0,
      started = false,
      lastEnded: Promise<void> | undefined;
    try {
      for (let i = 0; i < parts.length; i++) {
        let buffer: AudioBuffer;
        try {
          buffer = await pending;
        } catch (e) {
          if (ticket !== generation.current) return true;
          throw e;
        }
        if (ticket !== generation.current) return true;
        if (i + 1 < parts.length) pending = make(parts[i + 1].text);
        const node = audio.createBufferSource();
        node.buffer = buffer;
        node.connect(analyser);
        const at = Math.max(audio.currentTime + 0.03, nextAt);
        // Track completion as soon as a phrase is scheduled, including phrases
        // that finish while another synthesis request is pending.
        lastEnded = new Promise<void>((done) => {
          node.onended = () => done();
        });
        node.start(at);
        if (options.measureTurn) markTurn("turn.first_audio");
        phrases.current.push(node);
        nextAt =
          at +
          buffer.duration +
          (parts[i].pauseMs * delivery.pauseScale) / 1000;
        if (!started) {
          started = true;
          setSpeaking(true);
          setPreparing(false);
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
      await lastEnded;
    } finally {
      analyser.disconnect();
      out.disconnect();
    }
    if (ticket !== generation.current) return true;
    cancelAnimationFrame(frame.current);
    phrases.current = [];
    if (ticket === generation.current) {
      setSpeaking(false);
      onMood(emotion);
      publishPet(emotion, text, 0);
    }
    return true;
  }
  async function speakCloud(
    text: string,
    volume: number,
    emotion: Mood,
    ticket: number,
    played: { value: boolean },
  ) {
    const audio = context.current!;
    await audio.resume();
    const analyser = audio.createAnalyser(),
      gain = audio.createGain();
    gain.gain.value = volume;
    analyser.connect(gain);
    gain.connect(audio.destination);
    const requestId = crypto.randomUUID();
    let nextAt = audio.currentTime + 0.04;
    let lastEnded: Promise<void> | undefined;
    let playbackError: unknown;
    const { listen } = await import("@tauri-apps/api/event");
    const { invoke } = await import("@tauri-apps/api/core");
    const unlisten = await listen<{
      requestId: string;
      pcm: number[];
      sampleRate: number;
    }>("voice-audio", (event) => {
      if (
        event.payload.requestId !== requestId ||
        ticket !== generation.current ||
        playbackError
      )
        return;
      try {
        const { pcm, sampleRate } = event.payload;
        if (!pcm.length) return;
        if (pcm.length % 2 || sampleRate < 8000 || sampleRate > 48000)
          throw Error("Unsupported speech audio chunk");
        const bytes = new Uint8Array(pcm),
          view = new DataView(bytes.buffer),
          buffer = audio.createBuffer(1, bytes.length / 2, sampleRate),
          samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++)
          samples[i] = view.getInt16(i * 2, true) / 32768;
        const node = audio.createBufferSource();
        node.buffer = buffer;
        node.connect(analyser);
        lastEnded = new Promise<void>((done) => {
          node.onended = () => {
            node.disconnect();
            done();
          };
        });
        const at = Math.max(audio.currentTime + 0.025, nextAt);
        nextAt = at + buffer.duration;
        phrases.current.push(node);
        node.start(at);
        if (options.measureTurn) markTurn("turn.first_audio");
        if (!played.value) {
          played.value = true;
          setPreparing(false);
          setSpeaking(true);
          onMood("speaking");
          const meter = new Float32Array(analyser.fftSize);
          let shown = 0;
          const animate = (now: number) => {
            if (ticket !== generation.current) return;
            if (now - shown > 60) {
              analyser.getFloatTimeDomainData(meter);
              publishPet("speaking", text, rms(meter), emotion);
              shown = now;
            }
            frame.current = requestAnimationFrame(animate);
          };
          frame.current = requestAnimationFrame(animate);
        }
      } catch (e) {
        playbackError = e;
        void invoke("cancel_gemini", { requestId }).catch(() => {});
      }
    });
    requests.current.add(requestId);
    try {
      if (ticket !== generation.current) return;
      for (const part of speechChunks(text)) {
        if (ticket !== generation.current) return;
        await invoke("gemini_speak_stream", {
          requestId,
          text: part,
          emotion,
          voicePrompt: packVoicePrompt.current,
          character: preferences.activePackId
            ? "custom-pack"
            : preferences.renderer === "sample-vrm"
              ? "haru"
              : preferences.character,
        });
      }
      if (playbackError) throw playbackError;
      if (!played.value) throw Error("No speech audio was returned");
      await lastEnded;
    } finally {
      requests.current.delete(requestId);
      unlisten();
      analyser.disconnect();
      gain.disconnect();
    }
    if (ticket === generation.current) {
      cancelAnimationFrame(frame.current);
      phrases.current = [];
      setSpeaking(false);
      setPreparing(false);
      onMood(emotion);
      publishPet(emotion, text, 0);
    }
  }
  async function speak(text: string, volume: number, emotion: Mood = "happy") {
    if (!isNative) return;
    await stop();
    // Standalone VRM imports carry no voice identity; never borrow another character's voice.
    const voiceTicket = generation.current;
    packVoicePrompt.current = undefined;
    if (preferences.activePackId) {
      const pack = await packInfo(preferences.activePackId);
      if (voiceTicket !== generation.current) return;
      if (pack?.manifest.voice.kind !== "prompt") {
        onMood(emotion);
        publishPet(emotion, text, 0);
        return;
      }
      if (!cloud) {
        onError(
          "This character uses a server voice prompt. Choose Gemini in Voice & input.",
        );
        return;
      }
      packVoicePrompt.current = pack.manifest.voice.prompt;
    } else if (preferences.renderer === "custom-vrm") {
      onMood(emotion);
      publishPet(emotion, text, 0);
      return;
    }
    const ticket = generation.current;
    setPreparing(true);
    try {
      prepare();
      const { invoke } = await import("@tauri-apps/api/core");
      if (ticket !== generation.current) return;
      if (
        preferences.voiceProvider === "local" ||
        preferences.voiceProvider === "system"
      ) {
        if (await speakCharacter(text, volume, emotion, ticket)) return;
        throw new Error(
          "Local character voice is not installed. Install Kokoro or choose Gemini in Character voice settings.",
        );
      }
      if (ticket !== generation.current) return;
      if (cloud) {
        const played = { value: false };
        try {
          await speakCloud(text, volume, emotion, ticket, played);
          return;
        } catch (e) {
          if (ticket !== generation.current) return;
          if (packVoicePrompt.current)
            throw Error(
              `This character's server voice is unavailable (${String(e)}). The reply is still available as text.`,
            );
          if (played.value)
            throw Error(
              "Speech was interrupted. You can still read the full reply.",
            );
          onError(
            `Gemini speech unavailable (${String(e)}). Using the local character voice.`,
          );
          if (await speakCharacter(text, volume, emotion, ticket)) return;
          throw new Error(
            "Gemini speech is unavailable and the local character voice is not installed. Your reply is still available as text.",
          );
        }
      }
    } catch (e) {
      if (ticket === generation.current) {
        for (const node of phrases.current) {
          try {
            node.stop();
          } catch {}
        }
        phrases.current = [];
        cancelAnimationFrame(frame.current);
        setSpeaking(false);
        setPreparing(false);
        onMood("idle");
        publishPet("idle", "", 0);
        onError(String(e));
      }
    }
  }
  useEffect(() => {
    const hidden = () => {
      if (
        document.hidden &&
        !isNative &&
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
      for (const node of phrases.current) {
        try {
          node.stop();
        } catch {}
      }
      phrases.current = [];
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
  return {
    recording,
    speaking,
    preparing,
    record,
    finishRecording,
    speak,
    stop,
    prepare,
  };
}
