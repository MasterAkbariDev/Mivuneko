export function pcm16Wav(input: Float32Array, sourceRate: number): Uint8Array {
  if (
    !Number.isFinite(sourceRate) ||
    sourceRate < 8000 ||
    sourceRate > 192000 ||
    input.length > sourceRate * 120
  )
    throw Error(
      "Recording must be at most 120 seconds at a supported sample rate",
    );
  const size = Math.floor((input.length * 16000) / sourceRate);
  const bytes = new Uint8Array(44 + size * 2),
    view = new DataView(bytes.buffer);
  function tag(offset: number, text: string) {
    for (let i = 0; i < text.length; i++)
      bytes[offset + i] = text.charCodeAt(i);
  }
  tag(0, "RIFF");
  view.setUint32(4, 36 + size * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, size * 2, true);
  for (let i = 0; i < size; i++) {
    const start = (i * sourceRate) / 16000,
      end = ((i + 1) * sourceRate) / 16000;
    let total = 0,
      count = 0;
    for (
      let j = Math.floor(start);
      j < Math.min(input.length, Math.ceil(end));
      j++
    ) {
      total += Number.isFinite(input[j]) ? input[j] : 0;
      count++;
    }
    const n = Math.max(-1, Math.min(1, count ? total / count : 0));
    view.setInt16(44 + i * 2, n < 0 ? n * 32768 : n * 32767, true);
  }
  return bytes;
}
export function rms(samples: Float32Array) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.max(0, Math.min(1, Math.sqrt(sum / samples.length) * 4));
}
// Mono resample to 16 kHz for whisper. Down-sampling averages a centred window
// of about one output step first (cheap low-pass), then interpolates linearly.
export function resampleTo16k(
  input: Float32Array,
  fromRate: number,
): Float32Array {
  if (!Number.isFinite(fromRate) || fromRate < 8000 || fromRate > 192000)
    throw Error("Unsupported sample rate");
  if (fromRate === 16000) return input.slice();
  const ratio = fromRate / 16000,
    count = Math.floor(input.length / ratio),
    out = new Float32Array(count);
  let source = input;
  const width = Math.round(ratio);
  if (width > 1) {
    const prefix = new Float64Array(input.length + 1);
    for (let i = 0; i < input.length; i++)
      prefix[i + 1] = prefix[i] + (Number.isFinite(input[i]) ? input[i] : 0);
    source = new Float32Array(input.length);
    const half = Math.floor(width / 2);
    for (let i = 0; i < input.length; i++) {
      const a = Math.max(0, i - half),
        b = Math.min(input.length, a + width);
      source[i] = (prefix[b] - prefix[a]) / Math.max(1, b - a);
    }
  }
  for (let i = 0; i < count; i++) {
    const t = i * ratio,
      j = Math.floor(t),
      frac = t - j,
      a = source[j],
      b = source[Math.min(source.length - 1, j + 1)];
    out[i] = Number.isFinite(a + b) ? a + (b - a) * frac : 0;
  }
  return out;
}
