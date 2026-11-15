import { markTurn, recordSpan } from "./metrics";
import { packInfo } from "./characterPackStore";
import { voiceIdentity, pronunciationEntries } from "./voiceIdentity";
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
  const slowExpressive = useRef(false);
  const warmCharacter = useRef("");
  useEffect(() => {
    slowExpressive.current = false;
  }, [preferences.voiceProvider]);
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
    if (!context.current || context.current.state === "closed")
      context.current = new AudioContext();
    void context.current.resume();
    warmVoice();
  }
  function warmVoice() {
    // Warm the CPU voice while the conversation model is preparing its answer.
    // Experimental Qwen is reserved for previews; live replies must not wait for it.
    const character =
      preferences.renderer === "sample-vrm" ? "haru" : preferences.character;
    if (
      options.measureTurn &&
      ["local", "qwen"].includes(preferences.voiceProvider) &&
      !preferences.activePackId &&
      preferences.renderer !== "custom-vrm" &&
      warmCharacter.current !== character
    ) {
      warmCharacter.current = character;
      void import("@tauri-apps/api/core")
        .then(({ invoke }) =>
          invoke("synthesize_phrase", {
            text: "Hi.",
            character,
            mood: "idle",
            speed: 1,
          }),
        )
        .catch(() => {
          warmCharacter.current = "";
        });
    }
  }
  useEffect(() => {
    if (isNative && options.measureTurn && preferences.voice !== "off")
      warmVoice();
  }, [
    preferences.voice,
    preferences.voiceProvider,
    preferences.character,
    preferences.renderer,
  ]);
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
        invoke("cancel_local_voice").catch(() => {}),
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
    fastFallback = false,
  ): Promise<boolean> {
    const system = preferences.voiceProvider === "system";
    const expressive =
      preferences.voiceProvider === "qwen" &&
      !fastFallback &&
      (!options.measureTurn || !!packVoicePrompt.current);
    if (expressive && slowExpressive.current && !packVoicePrompt.current)
      return speakCharacter(text, volume, emotion, ticket, true);
    const identity = voiceIdentity(preferences);
    const character =
      preferences.renderer === "sample-vrm" ? "haru" : preferences.character;
    const { invoke } = await import("@tauri-apps/api/core");
    if (!system && !expressive && !packs.current.get(character))
      packs.current.set(
        character,
        await invoke<VoicePack | null>("character_voice", { character }).catch(
          () => null,
        ),
      );
    const pack: VoicePack | null | undefined =
      system || expressive
        ? { engine: "kokoro", speed: 1, gain: 1 }
        : packs.current.get(character);
    const parts = speechChunks(
      pronounce(text, pronunciationEntries(identity.pronunciations)),
      expressive ? 700 : 300,
    ).flatMap((part) =>
      expressive ? [{ text: part, pauseMs: 0 }] : splitSpeech(part),
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
        expressive
          ? "qwen_synthesize"
          : system
            ? "synthesize_speech"
            : "synthesize_phrase",
        {
          style: preferences.localVoiceStyle,
          language: preferences.localVoiceLanguage,
          text: phrase,
          character,
          mood: emotion,
          speed: delivery.speed,
          ...(expressive
            ? {
                speaker: identity.speaker,
                language: (
                  {
                    en: "English",
                    ja: "Japanese",
                    fr: "French",
                    es: "Spanish",
                    de: "German",
                  } as const
                )[preferences.localVoiceLanguage],
                instruction: packVoicePrompt.current ?? identity.instruction,
                ollamaModel: preferences.ollamaModel,
              }
            : {}),
        },
      ).then((bytes) => audio.decodeAudioData(new Uint8Array(bytes).buffer));
      request.catch(() => {});
      return request;
    };
    // The expressive model generates slower than playback on consumer GPUs.
    // Buffer the whole utterance so it cannot pause halfway through a sentence.
    let nextAt = 0,
      started = false,
      lastEnded: Promise<void> | undefined;
    try {
      const buffered: AudioBuffer[] = [];
      if (expressive) {
        for (const part of parts) {
          if (ticket !== generation.current) return true;
          let deadline: ReturnType<typeof setTimeout> | undefined;
          try {
            buffered.push(
              await Promise.race([
                make(part.text),
                new Promise<never>((_, reject) => {
                  deadline = setTimeout(
                    () =>
                      reject(
                        Error(
                          "Expressive voice exceeded the live reply budget",
                        ),
                      ),
                    5000,
                  );
                }),
              ]),
            );
          } catch (error) {
            if (ticket !== generation.current) return true;
            await invoke("cancel_local_voice").catch(() => {});
            if (packVoicePrompt.current) throw error;
            slowExpressive.current = true;
            onError(
              "Expressive voice is too slow for live replies on this device. Using the character's fast local voice for this session.",
            );
            return speakCharacter(text, volume, emotion, ticket, true);
          } finally {
            clearTimeout(deadline);
          }
        }
      }
      let pending = expressive
        ? Promise.resolve(buffered[0])
        : make(parts[0].text);
      for (let i = 0; i < parts.length; i++) {
        let buffer: AudioBuffer;
        try {
          buffer = await pending;
        } catch (e) {
          if (ticket !== generation.current) return true;
          throw e;
        }
        if (ticket !== generation.current) return true;
        if (i + 1 < parts.length)
          pending = expressive
            ? Promise.resolve(buffered[i + 1])
            : make(parts[i + 1].text);
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
          voicePrompt:
            packVoicePrompt.current ?? voiceIdentity(preferences).instruction,
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
      if (!cloud && preferences.voiceProvider !== "qwen") {
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
    publishPet("thinking", text, 0);
    try {
      prepare();
      const { invoke } = await import("@tauri-apps/api/core");
      if (ticket !== generation.current) return;
      if (
        preferences.voiceProvider === "local" ||
        preferences.voiceProvider === "qwen" ||
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
