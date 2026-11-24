// Short synthesised card sounds (no audio files). Off when the player has muted them.
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
const KEY = "zhol.sound";

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSound(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
}

/** "snap" when a card lands, "swish" when it is picked up. */
export function cardSound(kind: "snap" | "swish") {
  if (!soundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = kind === "snap" ? 2600 : 1400;
    f.Q.value = kind === "snap" ? 1.4 : 0.7;
    const g = ctx.createGain();
    const t = ctx.currentTime, len = kind === "snap" ? 0.07 : 0.22;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(kind === "snap" ? 0.5 : 0.12, t + (kind === "snap" ? 0.004 : 0.08));
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + len + 0.02);
  } catch { /* audio not available */ }
}
