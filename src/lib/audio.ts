export async function blobToMonoWav(blob: Blob, targetRate = 16000): Promise<Blob> {
  const context = new AudioContext();
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  const length = Math.ceil(decoded.duration * targetRate);
  const offline = new OfflineAudioContext(1, length, targetRate);
  const source = offline.createBufferSource();
  const mono = offline.createBuffer(1, decoded.length, decoded.sampleRate);
  const channel = mono.getChannelData(0);
  for (let c = 0; c < decoded.numberOfChannels; c += 1) {
    const input = decoded.getChannelData(c);
    for (let i = 0; i < input.length; i += 1) channel[i] += input[i] / decoded.numberOfChannels;
  }
  source.buffer = mono;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  await context.close();

  const samples = rendered.getChannelData(0);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

export function preferredMimeType(): string {
  const choices = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return choices.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}
