import { useEffect, useRef, useState } from "react";
import {
  pcm16Wav,
  resampleTo16k,
} from "../../../packages/shared-schemas/audio.ts";
import { createVad, type Vad } from "../../../packages/shared-schemas/vad.ts";
import { getSpeechContext } from "./speechContext";
import { usePreferences } from "./preferences";
import { cleanTranscript } from "../../../packages/shared-schemas/transcript.ts";

// Capture stays on-device; successive snapshots update the draft. The completed
// utterance is submitted once after a quiet gap, not sent to a model mid-sentence.
// `meter` is mutated at audio rate and read by <MicMeter>, so level changes never
// re-render the chat. `phase` changes only a few times per utterance.
export type MicPhase = "off" | "listening" | "hearing" | "transcribing";
export const micMeter = { level: 0 };
export function useOpenMic(
  enabled: boolean,
  paused: boolean,
  characterSpeaking: boolean,
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (text: string) => void,
  onInterrupt: () => void,
) {
  const callbacks = useRef({ onPartial, onFinal, onError, onInterrupt });
  callbacks.current = { onPartial, onFinal, onError, onInterrupt };
  const preferences = usePreferences();
  const prefs = useRef(preferences);
  prefs.current = preferences;
  const talking = useRef(false);
  talking.current = characterSpeaking;
  const [working, setWorking] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [restart, setRestart] = useState(0);
  useEffect(() => {
    if (!enabled || paused) return;
    let stopped = false,
      finishing = false,
      transcribing = false;
    let stream: MediaStream | undefined,
      context: AudioContext | undefined,
      processor: AudioNode | undefined;
    let chunks: Float32Array[] = [],
      total = 0,
      lastSnapshot = 0,
      started = false;
    let vad: Vad | undefined;
    let pending: Promise<void> = Promise.resolve();
    let transcript = "";
    const cleanup = () => {
      processor?.disconnect();
      micMeter.level = 0;
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      processor = undefined;
      stream = undefined;
      context = undefined;
    };
    const snapshot = async (
      frames: Float32Array[],
      size: number,
      sampleRate: number,
    ) => {
      if (!size) return "";
      const samples = new Float32Array(size);
      let offset = 0;
      for (const frame of frames) {
        samples.set(frame, offset);
        offset += frame.length;
      }
      const wav = pcm16Wav(resampleTo16k(samples, sampleRate), 16000);
      const { invoke } = await import("@tauri-apps/api/core");
      return cleanTranscript(
        await invoke<string>("transcribe_audio", {
          wav: Array.from(wav),
          context: prefs.current.sttContext ? getSpeechContext() : "",
          engine: prefs.current.sttEngine,
        }),
      );
    };
    const finish = () => {
      if (finishing || !context) return;
      finishing = true;
      const rate = context.sampleRate,
        frames = chunks,
        size = total;
      cleanup();
      setHearing(false);
      setWorking(true);
      void (async () => {
        try {
          await pending;
          if (stopped) return;
          const final = (await snapshot(frames, size, rate)).trim();
          if (stopped) return;
          callbacks.current.onPartial("");
          if (final) callbacks.current.onFinal(final);
          else setRestart((n) => n + 1);
        } catch (e) {
          if (!stopped) callbacks.current.onError(String(e));
        } finally {
          setWorking(false);
        }
      })();
    };
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        context = new AudioContext();
        await context.resume();
        if (stopped) {
          cleanup();
          return;
        }
        const source = context.createMediaStreamSource(stream);
        vad = createVad({
          sampleRate: context.sampleRate,
          sensitivity: prefs.current.micSensitivity,
          endSilenceMs: prefs.current.endPauseMs,
        });
        const muted = context.createGain();
        muted.gain.value = 0;
        const onFrame = (frame: Float32Array) => {
          if (stopped || finishing || !context) return;
          // With interrupting off, her own speech is not listened to at all.
          if (talking.current && !started && !prefs.current.bargeIn) return;
          const now = performance.now();
          vad!.strict = talking.current && !started;
          const state = vad!.push(frame);
          micMeter.level = Math.min(
            1,
            vad!.meter.level / (vad!.meter.threshold * 4),
          );
          if (!started) {
            if (state !== "speech") return;
            started = true;
            setHearing(true);
            lastSnapshot = now;
            // Talking over the character interrupts her.
            if (talking.current) callbacks.current.onInterrupt();
            // Prepend the pre-roll so the first word is not clipped.
            for (const early of vad!.takePreRoll()) {
              chunks.push(early);
              total += early.length;
            }
          } else {
            chunks.push(frame);
            total += frame.length;
          }
          if (!transcribing && now - lastSnapshot >= 6000) {
            lastSnapshot = now;
            transcribing = true;
            const frames = chunks.slice(),
              size = total,
              rate = context.sampleRate;
            pending = snapshot(frames, size, rate)
              .then((text) => {
                if (!stopped && text.trim()) {
                  transcript = text.trim();
                  callbacks.current.onPartial(transcript);
                }
              })
              .catch(() => {})
              .finally(() => {
                transcribing = false;
              });
          }
          if (state === "end" || total >= context.sampleRate * 20) finish();
        };
        try {
          // Audio-thread capture; falls back to the main thread if unavailable.
          await context.audioWorklet.addModule("/mic-worklet.js");
          const node = new AudioWorkletNode(context, "mic-capture");
          node.port.onmessage = (event) => onFrame(event.data as Float32Array);
          processor = node;
        } catch {
          const node = context.createScriptProcessor(2048, 1, 1);
          node.onaudioprocess = (event) =>
            onFrame(new Float32Array(event.inputBuffer.getChannelData(0)));
          processor = node;
        }
        if (stopped) {
          cleanup();
          return;
        }
        source.connect(processor);
        processor.connect(muted);
        muted.connect(context.destination);
      } catch (e) {
        cleanup();
        if (!stopped)
          callbacks.current.onError(`Microphone unavailable: ${String(e)}`);
      }
    })();
    return () => {
      stopped = true;
      cleanup();
      callbacks.current.onPartial("");
      setHearing(false);
    };
  }, [
    enabled,
    paused,
    restart,
    preferences.micSensitivity,
    preferences.endPauseMs,
  ]);
  const phase: MicPhase = !enabled
    ? "off"
    : working
      ? "transcribing"
      : hearing && !paused
        ? "hearing"
        : "listening";
  return { working, phase };
}
