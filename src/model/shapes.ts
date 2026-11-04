/**
 * Shapes as outlines, and the pure edits on them: where a shape is, moving it,
 * turning it, and whether a click lands on it. Nothing here touches React.
 */
import { FONTS, textOutline } from "../geometry/text";
import { movePaths, pathPoints, pathsBox, segmentPoints, type Affine, type LaserPath, type Pt, type Segment } from "../geometry/segments";
import type { CircleItem, Item, LineItem, Outline, PictureItem, RectItem, ShapeItem, TextItem } from "./types";

const deg = (a: number) => (a * Math.PI) / 180;

/** Turn `angle` degrees anticlockwise about a point. */
export function rotation(angle: number, about: Pt): Affine {
  const c = Math.cos(deg(angle));
  const s = Math.sin(deg(angle));
  const [cx, cy] = about;
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

export const translation = (dx: number, dy: number): Affine => [1, 0, 0, 1, dx, dy];

/** Flip left to right about a vertical line at `x`. */
export const mirrorX = (x: number): Affine => [-1, 0, 0, 1, 2 * x, 0];

export function moveOutlines(outlines: Outline[], m: Affine): Outline[] {
  return movePaths(
    outlines.map((o) => ({ ...o, layer: "outer" as const })),
    m,
  ).map(({ segments, closed }) => ({ segments, closed }));
}

/** A rectangle's outline (corners rounded by `radius`, up to half the shorter side), before it's turned. */
function rectOutline(r: RectItem): Outline {
  const rad = Math.max(0, Math.min(r.radius, r.w / 2, r.h / 2));
  const { x, y, w, h } = r;
  if (rad < 1e-6) {
    const a: Pt = [x, y], b: Pt = [x + w, y], c: Pt = [x + w, y + h], d: Pt = [x, y + h];
    return { closed: true, segments: [{ kind: "line", from: a, to: b }, { kind: "line", from: b, to: c }, { kind: "line", from: c, to: d }, { kind: "line", from: d, to: a }] };
  }
  const arc = (cx: number, cy: number, a0: number, a1: number): Segment => {
    const p = (t: number): Pt => [cx + rad * Math.cos(t), cy + rad * Math.sin(t)];
    return { kind: "arc", from: p(a0), mid: p((a0 + a1) / 2), to: p(a1) };
  };
  const segs: Segment[] = [];
  const line = (a: Pt, b: Pt) => {
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-9) segs.push({ kind: "line", from: a, to: b });
  };
  // Anticlockwise from the bottom edge.
  line([x + rad, y], [x + w - rad, y]);
  segs.push(arc(x + w - rad, y + rad, -Math.PI / 2, 0));
  line([x + w, y + rad], [x + w, y + h - rad]);
  segs.push(arc(x + w - rad, y + h - rad, 0, Math.PI / 2));
  line([x + w - rad, y + h], [x + rad, y + h]);
  segs.push(arc(x + rad, y + h - rad, Math.PI / 2, Math.PI));
  line([x, y + h - rad], [x, y + rad]);
  segs.push(arc(x + rad, y + rad, Math.PI, 1.5 * Math.PI));
  return { closed: true, segments: segs };
}

export const rectCentre = (r: RectItem): Pt => [r.x + r.w / 2, r.y + r.h / 2];

/** The outlines a shape is made of, on the bed. */
export function itemOutlines(item: Item): Outline[] {
  switch (item.kind) {
    case "rect": {
      const o = rectOutline(item);
      return item.angle ? moveOutlines([o], rotation(item.angle, rectCentre(item))) : [o];
    }
    case "circle":
      return [{ closed: true, segments: [{ kind: "circle", center: [item.cx, item.cy], radius: Math.max(item.r, 1e-6) }] }];
    case "line":
      return [{ closed: false, segments: [{ kind: "line", from: [item.x1, item.y1], to: [item.x2, item.y2] }] }];
    case "text": {
      const { loops } = textOutline(FONTS[item.font], item.text, Math.max(item.size, 0.1), item.align);
      const outlines = loops.map((segments): Outline => ({ segments, closed: true }));
      let m: Affine = translation(item.x, item.y);
      if (item.angle) m = compose(rotation(item.angle, [item.x, item.y]), m);
      return moveOutlines(outlines, m);
    }
    case "shape":
      return item.outlines;
    case "picture": {
      // Its frame (for picking, measuring and laying out); the picture itself is drawn and engraved as an image.
      const [w, h] = pictureSize(item);
      const x0 = item.cx - w / 2;
      const y0 = item.cy - h / 2;
      const a: Pt = [x0, y0], b: Pt = [x0 + w, y0], c: Pt = [x0 + w, y0 + h], d: Pt = [x0, y0 + h];
      return [{ closed: true, segments: [{ kind: "line", from: a, to: b }, { kind: "line", from: b, to: c }, { kind: "line", from: c, to: d }, { kind: "line", from: d, to: a }] }];
    }
  }
}

/** A picture's size on the bed (mm): across and up, after its quarter turns. */
export function pictureSize(p: PictureItem): [number, number] {
  return p.turns % 2 ? [p.h, p.w] : [p.w, p.h];
}

/** A picture turned a number of quarter turns anticlockwise about its middle (flipped pictures turn the other way inside). */
function turnedPicture(p: PictureItem, quarters: number): PictureItem {
  const q = ((Math.round(quarters) % 4) + 4) % 4;
  return { ...p, turns: (((p.turns + (p.flip ? -q : q)) % 4) + 4) % 4 };
}

/** m2 after m1 (apply m1 first). */
export function compose(m2: Affine, m1: Affine): Affine {
  return [
    m2[0] * m1[0] + m2[2] * m1[1],
    m2[1] * m1[0] + m2[3] * m1[1],
    m2[0] * m1[2] + m2[2] * m1[3],
    m2[1] * m1[2] + m2[3] * m1[3],
    m2[0] * m1[4] + m2[2] * m1[5] + m2[4],
    m2[1] * m1[4] + m2[3] * m1[5] + m2[5],
  ];
}

export const applyAffine = (m: Affine, p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

/** The outlines as laser paths on one layer (the sheet maker sorts cuts into outer/inner). */
export function outlinePaths(outlines: Outline[], layer: LaserPath["layer"]): LaserPath[] {
  return outlines.map((o) => ({ layer, segments: o.segments, closed: o.closed }));
}

/** The box round a shape [x0, y0, x1, y1], or null when it has no size (empty text). */
export function itemBox(item: Item): [number, number, number, number] | null {
  return pathsBox(outlinePaths(itemOutlines(item), "outer"));
}

export const boxCentre = (b: [number, number, number, number]): Pt => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

/** The shape moved by (dx, dy). */
export function movedItem(item: Item, dx: number, dy: number): Item {
  if (!dx && !dy) return item;
  switch (item.kind) {
    case "rect":
      return { ...item, x: item.x + dx, y: item.y + dy };
    case "circle":
      return { ...item, cx: item.cx + dx, cy: item.cy + dy };
    case "line":
      return { ...item, x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy };
    case "text":
      return { ...item, x: item.x + dx, y: item.y + dy };
    case "shape":
      return { ...item, outlines: moveOutlines(item.outlines, translation(dx, dy)) };
    case "picture":
      return { ...item, cx: item.cx + dx, cy: item.cy + dy };
  }
}

/** The shape with any affine applied (a turn, a flip): parametric shapes that can't carry it become outlines. */
export function transformedItem(item: Item, m: Affine): Item {
  switch (item.kind) {
    case "circle": {
      const c = applyAffine(m, [item.cx, item.cy]);
      const r = item.r * Math.hypot(m[0], m[1]);
      return { ...item, cx: c[0], cy: c[1], r };
    }
    case "line": {
      const a = applyAffine(m, [item.x1, item.y1]);
      const b = applyAffine(m, [item.x2, item.y2]);
      return { ...item, x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
    }
    case "picture": {
      // Pictures move, turn by quarter turns and flip; any other turn just moves them.
      const c = applyAffine(m, [item.cx, item.cy]);
      const flipped = m[0] * m[3] - m[1] * m[2] < 0;
      // The turn the matrix makes (after taking out a left-right flip).
      const angle = Math.atan2(m[1], flipped ? -m[0] : m[0]);
      const q = Math.round(angle / (Math.PI / 2));
      let p: PictureItem = { ...item, cx: c[0], cy: c[1] };
      if (flipped) p = { ...p, flip: !p.flip };
      return Math.abs(angle - q * (Math.PI / 2)) < 1e-6 ? turnedPicture(p, flipped ? -q : q) : p;
    }
    default:
      return { id: item.id, name: item.name, op: item.op, hidden: item.hidden, group: item.group, kind: "shape", outlines: moveOutlines(itemOutlines(item), m) };
  }
}

/** The shape turned `angle` degrees anticlockwise about its centre (rectangles and text keep their settings). */
export function rotatedItem(item: Item, angle: number): Item {
  const box = itemBox(item);
  if (!box || !angle) return item;
  const centre = boxCentre(box);
  switch (item.kind) {
    case "rect":
      return { ...item, angle: norm(item.angle + angle) };
    case "text": {
      // Turn about the words' middle: the anchor moves round it.
      const anchor = applyAffine(rotation(angle, centre), [item.x, item.y]);
      return { ...item, x: anchor[0], y: anchor[1], angle: norm(item.angle + angle) };
    }
    case "circle":
      return item;
    case "picture":
      return angle % 90 === 0 ? turnedPicture(item, angle / 90) : item;
    default:
      return transformedItem(item, rotation(angle, centre));
  }
}

const norm = (a: number) => ((a % 360) + 360) % 360;

/** The shape turned `angle` degrees anticlockwise about any point (a group of shapes turning together). */
export function rotatedItemAbout(item: Item, angle: number, about: Pt): Item {
  const box = itemBox(item);
  if (!box || !angle) return item;
  const turned = rotatedItem(item, angle);
  const was = boxCentre(box);
  const now = boxCentre(itemBox(turned) ?? box);
  const to = applyAffine(rotation(angle, about), was);
  return movedItem(turned, to[0] - now[0], to[1] - now[1]);
}

/**
 * Which shapes sit inside another closed shape (a hole drawn in a plate, words on a tag): each
 * shape's id → the id of the shape it belongs to (the smallest closed shape round it), for
 * laying pieces out without separating them.
 */
export function pieceOf(items: readonly Item[]): Map<string, string> {
  const info = items.filter((it) => !it.hidden).map((it) => ({ it, box: itemBox(it), outlines: itemOutlines(it) })).filter((x) => x.box);
  const area = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);
  const out = new Map<string, string>();
  for (const x of info) {
    const c = boxCentre(x.box!);
    let best: (typeof info)[number] | null = null;
    for (const y of info) {
      if (y === x || !y.outlines.some((o) => o.closed)) continue;
      const b = y.box!;
      if (!(x.box![0] >= b[0] - 1e-6 && x.box![1] >= b[1] - 1e-6 && x.box![2] <= b[2] + 1e-6 && x.box![3] <= b[3] + 1e-6)) continue;
      if (area(b) <= area(x.box!)) continue;
      if (!insideOutlines(c, y.outlines)) continue;
      if (!best || area(b) < area(best.box!)) best = y;
    }
    if (best) out.set(x.it.id, best.it.id);
  }
  // Follow chains (a hole in a plate in a frame) to the outermost piece.
  const root = (id: string): string => {
    let r = id;
    for (let k = 0; k < 100 && out.has(r); k++) r = out.get(r)!;
    return r;
  };
  for (const [id] of out) out.set(id, root(id));
  return out;
}

/** Flipped left to right about its own middle (for engraving on the back). */
export function mirroredItem(item: Item): Item {
  const box = itemBox(item);
  if (!box) return item;
  const m = mirrorX(boxCentre(box)[0]);
  if (item.kind === "picture") return { ...item, flip: !item.flip };
  return item.kind === "circle" ? item : transformedItem(item, m);
}

/** The shape, moved so that its box's bottom-left corner is at (x, y). */
export function placedAt(item: Item, x: number, y: number): Item {
  const box = itemBox(item);
  return box ? movedItem(item, x - box[0], y - box[1]) : item;
}

/** Distance from a point to the nearest of some outlines (mm), using straight pieces within `tol`. */
export function distanceToOutlines(p: Pt, outlines: Outline[], tol = 0.05): number {
  let best = Infinity;
  for (const o of outlines) {
    for (const s of o.segments) {
      const pts = segmentPoints(s, tol);
      for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i], pts[i + 1]));
    }
  }
  return best;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Is the point inside any closed outline of the shape (even–odd per outline)? */
export function insideOutlines(p: Pt, outlines: Outline[]): boolean {
  let inside = false;
  for (const o of outlines) {
    if (!o.closed) continue;
    const poly = pathPoints(o.segments, true, 0.1);
    if (poly.length >= 3 && pointInPolygonPts(p, poly)) inside = !inside;
  }
  return inside;
}

function pointInPolygonPts(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The topmost shape under a point: within `reach` mm of an outline, or inside
 * a closed shape (so a filled area can be grabbed anywhere). Later items win.
 */
export function itemAt(items: readonly Item[], p: Pt, reach: number): Item | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.hidden) continue;
    const box = itemBox(it);
    if (!box || p[0] < box[0] - reach || p[0] > box[2] + reach || p[1] < box[1] - reach || p[1] > box[3] + reach) continue;
    const outlines = itemOutlines(it);
    if (distanceToOutlines(p, outlines, 0.2) <= reach || insideOutlines(p, outlines)) return it;
  }
  return null;
}

/** Items whose box lies wholly inside a box (a drag-select). */
export function itemsInBox(items: readonly Item[], box: [number, number, number, number]): Item[] {
  const [x0, y0, x1, y1] = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
  return items.filter((it) => {
    if (it.hidden) return false;
    const b = itemBox(it);
    return !!b && b[0] >= x0 && b[2] <= x1 && b[1] >= y0 && b[3] <= y1;
  });
}

// Makers: new shapes with sensible defaults, placed where asked.

export const makeRect = (id: string, x: number, y: number, w: number, h: number): RectItem => ({ id, name: "Rectangle", op: "cut", kind: "rect", x, y, w, h, radius: 0, angle: 0 });
export const makeCircle = (id: string, cx: number, cy: number, r: number): CircleItem => ({ id, name: "Circle", op: "cut", kind: "circle", cx, cy, r });
export const makeLine = (id: string, x1: number, y1: number, x2: number, y2: number): LineItem => ({ id, name: "Line", op: "cut", kind: "line", x1, y1, x2, y2 });
export const makeText = (id: string, x: number, y: number, text = "Hello", size = 20): TextItem => ({ id, name: "Text", op: "engrave", kind: "text", text, x, y, size, font: "inter-regular", align: "left", angle: 0 });
export const makeShape = (id: string, name: string, outlines: Outline[]): ShapeItem => ({ id, name, op: "cut", kind: "shape", outlines });

/** A short description for the list and the properties panel. */
export function describeItem(item: Item): string {
  const n = (v: number) => String(Math.round(v * 100) / 100);
  switch (item.kind) {
    case "rect":
      return `${n(item.w)} × ${n(item.h)} mm`;
    case "circle":
      return `⌀ ${n(item.r * 2)} mm`;
    case "line":
      return `${n(Math.hypot(item.x2 - item.x1, item.y2 - item.y1))} mm long`;
    case "text":
      return `"${item.text.split("\n")[0]}" ${n(item.size)} mm`;
    case "shape": {
      const box = itemBox(item);
      return box ? `${n(box[2] - box[0])} × ${n(box[3] - box[1])} mm` : "empty";
    }
    case "picture": {
      const [w, h] = pictureSize(item);
      return `photo ${n(w)} × ${n(h)} mm`;
    }
  }
}

export const makePicture = (id: string, name: string, src: string, cx: number, cy: number, w: number, h: number): PictureItem => ({
  id,
  name,
  op: "engrave",
  kind: "picture",
  src,
  cx,
  cy,
  w,
  h,
  turns: 0,
  flip: false,
  mode: "dots",
  brightness: 0,
  contrast: 0,
  invert: false,
  dpm: 10,
});
