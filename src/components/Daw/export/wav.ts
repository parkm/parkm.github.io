/** Encode an AudioBuffer as a PCM WAV file (16 or 24 bit). */
export function encodeWav(buffer: AudioBuffer, bitDepth: 16 | 24 = 24): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = bitDepth / 8;
  const dataSize = frames * channels * bytes;
  const view = new DataView(new ArrayBuffer(44 + dataSize));

  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytes, true);
  view.setUint16(32, channels * bytes, true);
  view.setUint16(34, bitDepth, true);
  ascii(36, "data");
  view.setUint32(40, dataSize, true);

  const data = Array.from({ length: channels }, (_, c) =>
    buffer.getChannelData(c),
  );
  const max = 2 ** (bitDepth - 1) - 1;
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.round(Math.max(-1, Math.min(1, data[c][i])) * max);
      if (bitDepth === 16) {
        view.setInt16(offset, s, true);
      } else {
        view.setUint8(offset, s & 0xff);
        view.setUint8(offset + 1, (s >> 8) & 0xff);
        view.setUint8(offset + 2, (s >> 16) & 0xff);
      }
      offset += bytes;
    }
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}
