/** The Polygon tool's last choice — how many sides, and whether it's a star — kept on this computer. */
const KEY = "juracut.polygon";

export interface PolygonStyle {
  sides: number;
  /** Inner corners' share of the size (0 = a plain polygon). */
  star: number;
}

export function polygonStyle(): PolygonStyle {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { sides?: unknown; star?: unknown };
    const sides = typeof v.sides === "number" && v.sides >= 3 && v.sides <= 100 ? Math.round(v.sides) : 6;
    const star = typeof v.star === "number" && v.star >= 0.05 && v.star <= 0.95 ? v.star : 0;
    return { sides, star };
  } catch {
    return { sides: 6, star: 0 };
  }
}

export function keepPolygonStyle(s: PolygonStyle): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not kept; fine.
  }
}
