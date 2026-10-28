// Runs on the audio thread so capture never drops frames when the UI is busy.
class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(1024);
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const take = Math.min(
        channel.length - offset,
        this.buffer.length - this.filled,
      );
      this.buffer.set(channel.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.buffer.length) {
        this.port.postMessage(this.buffer);
        this.buffer = new Float32Array(1024);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("mic-capture", MicCapture);
