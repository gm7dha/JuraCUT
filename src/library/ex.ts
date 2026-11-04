/**
 * Sizes for the design library. In JuraCAD every size carries both its value
 * and the expression behind it (so a part follows the design's variables);
 * JuraCUT's designs are made once from the numbers chosen, so an `Ex` here is
 * just the value with a short text — the same shape, so the finger-joint maths
 * (fingers.ts) can be shared with JuraCAD unchanged.
 */
export interface Ex {
  /** The number as short text. */
  t: string;
  /** Its value (mm, or a plain count). */
  v: number;
}

/** Numbers as short text (no 0.30000000000000004). */
export function tidy(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return String(Object.is(r, -0) ? 0 : r);
}

export const lit = (v: number): Ex => ({ t: tidy(v), v });
export const ZERO: Ex = lit(0);
export const plus = (a: Ex, b: Ex): Ex => lit(a.v + b.v);
export const minus = (a: Ex, b: Ex): Ex => lit(a.v - b.v);
export const neg = (a: Ex): Ex => lit(-a.v);
export const times = (a: Ex, k: number): Ex => lit(a.v * k);
export const over = (a: Ex, k: number): Ex => lit(a.v / k);
/** `a` × i / n. */
export const fraction = (a: Ex, i: number, n: number): Ex => lit((a.v * i) / n);
