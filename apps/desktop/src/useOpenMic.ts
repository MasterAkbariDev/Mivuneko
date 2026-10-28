import { useEffect, useRef, useState } from "react";
import { pcm16Wav, rms } from "../../../packages/shared-schemas/audio.ts";

// Capture stays on-device; successive snapshots update the draft. The completed
// utterance is submitted once after a quiet gap, not sent to a model mid-sentence.
export function useOpenMic(
  enabled: boolean,
  paused: boolean,
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (text: string) => void,
) {
  const callbacks = useRef({ onPartial, onFinal, onError });
  callbacks.current = { onPartial, onFinal, onError };
  const [working, setWorking] = useState(false);
  const [restart, setRestart] = useState(0);
  useEffect(() => {
    if (!enabled || paused) return;
    let stopped = false,
      finishing = false,
      transcribing = false;
    let stream: MediaStream | undefined,
      context: AudioContext | undefined,
      processor: ScriptProcessorNode | undefined;
    let chunks: Float32Array[] = [],
      total = 0,
      lastVoice = 0,
      lastSnapshot = 0,
      started = false;
    let pending: Promise<void> = Promise.resolve();
    let transcript = "";
    const cleanup = () => {
      processor?.disconnect();
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
      const wav = pcm16Wav(samples, sampleRate);
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string>("transcribe_audio", { wav: Array.from(wav) });
    };
    const finish = () => {
      if (finishing || !context) return;
      finishing = true;
      const rate = context.sampleRate,
        frames = chunks,
        size = total;
      cleanup();
      setWorking(true);
      void (async () => {
        try {
          await pending;
          if (stopped) return;
          const final = (await snapshot(frames, size, rate)).trim();
          if (stopped) return;
          callbacks.current.onPartial("");
          if (final) callbacks.current.onFinal(final);
          else {
            callbacks.current.onError(
              "No speech was recognized. Try speaking closer to the microphone.",
            );
            setRestart((n) => n + 1);
          }
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
        processor = context.createScriptProcessor(4096, 1, 1);
        const muted = context.createGain();
        muted.gain.value = 0;
        source.connect(processor);
        processor.connect(muted);
        muted.connect(context.destination);
        processor.onaudioprocess = (event) => {
          if (stopped || finishing || !context) return;
          const frame = new Float32Array(event.inputBuffer.getChannelData(0));
          const now = performance.now();
          const voiced = rms(frame) > 0.06;
          if (!started && !voiced) return;
          if (!started) {
            started = true;
            lastSnapshot = now;
          }
          if (voiced) lastVoice = now;
          chunks.push(frame);
          total += frame.length;
          if (!transcribing && now - lastSnapshot >= 2500) {
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
          if (
            (lastVoice && now - lastVoice > 1000) ||
            total >= context.sampleRate * 20
          )
            finish();
        };
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
    };
  }, [enabled, paused, restart]);
  return { working };
}
