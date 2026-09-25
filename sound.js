let context = null;
let enabled = true;
function audioContext() {
  if (!enabled) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!context) context = new AudioContextClass();
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}
export function unlockAudio() { return audioContext() !== null; }
export function setSoundEnabled(value) { enabled = Boolean(value); if (enabled) unlockAudio(); }
export function isSoundEnabled() { return enabled; }
function tone(ctx, start, from, to, duration, volume, type = "triangle") {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.014, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}
function woodClick(ctx, start, volume = 0.055) {
  const length = Math.ceil(ctx.sampleRate * 0.055);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.15));
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = 1900;
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
  source.stop(start + 0.06);
}
export function playThrow() {
  const ctx = audioContext();
  if (!ctx) return;
  const start = ctx.currentTime + 0.01;
  [0.04, 0.13, 0.23, 0.34].forEach((offset, index) => {
    woodClick(ctx, start + offset, 0.07 - index * 0.008);
    tone(ctx, start + offset, 220 + index * 32, 120 + index * 15, 0.11, 0.065, "sine");
  });
}
export function playStep(index = 0) {
  const ctx = audioContext();
  if (!ctx) return;
  const start = ctx.currentTime + 0.005;
  woodClick(ctx, start, 0.025);
  tone(ctx, start, 420 + (index % 4) * 35, 300 + (index % 4) * 25, 0.105, 0.043);
}
export function playPortal() {
  const ctx = audioContext();
  if (!ctx) return;
  const start = ctx.currentTime + 0.005;
  tone(ctx, start, 430, 920, 0.22, 0.055, "sine");
  tone(ctx, start + 0.08, 620, 1050, 0.2, 0.036, "triangle");
}
export function playCaptureBonus() {
  const ctx = audioContext();
  if (!ctx) return;
  const start = ctx.currentTime + 0.01;
  woodClick(ctx, start, 0.085);
  tone(ctx, start, 280, 150, 0.3, 0.075, "sawtooth");
  [523, 659, 784, 1047].forEach((frequency, index) => tone(ctx, start + 0.12 + index * 0.075, frequency, frequency * 1.015, 0.36, 0.045, "sine"));
}
