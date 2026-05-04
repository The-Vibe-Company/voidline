let s = Number(process.env.VOIDLINE_SEED ?? 1) >>> 0;

Math.random = () => {
  s = (s + 0x6D2B79F5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function reseed(n) {
  s = Number(n) >>> 0;
}
