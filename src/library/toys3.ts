/**
 * Toys and gifts: a jigsaw puzzle and a hanging ornament or keyring. JuraCAD's src/library/designs/jigsaw.ts and
 * ornament.ts with flat shapes instead of sketches (the puzzle maths, puzzle.ts, is JuraCAD's unchanged, so the same
 * pattern number gives the same puzzle in both): keep them in step.
 */
import type { Segment } from "../geometry/segments";
import { isFontId, type FontId } from "../geometry/text";
import { itemOutlines, makeCircle, makeRect, makeShape } from "../model/shapes";
import { pathPoints } from "../geometry/segments";
import type { Item } from "../model/types";
import { allEdges, makePuzzle, puzzleProblems, type Arc, type PuzzleEdge, type PuzzleSpec } from "./puzzle";
import { fontChoice, mm, n, placed, r6, str, take, wordsAt, type LibraryDesign, type Values } from "./kit";

type P2 = [number, number];

const fontOf = (v: Values): FontId => (isFontId(v.font) ? v.font : "inter-bold");

/** The point halfway round an arc that runs anticlockwise from `a` to `b` round `c`. */
function arcMiddle(c: P2, a: P2, b: P2): P2 {
  const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  let a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
  while (a1 <= a0) a1 += 2 * Math.PI;
  const m = (a0 + a1) / 2;
  return [r6(c[0] + r * Math.cos(m)), r6(c[1] + r * Math.sin(m))];
}

/** An arc as a segment from `from` (one of its ends) to the other. */
function arcFrom(a: Arc, from: P2): Segment {
  const mid = arcMiddle(a.centre, a.start, a.end);
  const forward = Math.hypot(a.start[0] - from[0], a.start[1] - from[1]) <= Math.hypot(a.end[0] - from[0], a.end[1] - from[1]);
  return forward ? { kind: "arc", from: a.start, mid, to: a.end } : { kind: "arc", from: a.end, mid, to: a.start };
}

// ---------------------------------------------------------------------------
// Jigsaw puzzle

export function puzzleSpec(v: Values): PuzzleSpec {
  return { width: n(v, "width"), height: n(v, "height"), rows: n(v, "rows"), columns: n(v, "columns"), tab: n(v, "tab") / 100, seed: n(v, "seed"), minNeck: n(v, "thickness") };
}

/** One cut between two pieces: a line, three arcs (shoulder, head, shoulder) and a line, end to end. */
export function edgeSegments(e: PuzzleEdge): Segment[] {
  const out: Segment[] = [{ kind: "line", from: e.points[0], to: e.points[1] }];
  let at = e.points[1];
  for (const a of e.arcs) {
    const s = arcFrom(a, at);
    out.push(s);
    at = (s as { to: P2 }).to;
  }
  out.push({ kind: "line", from: e.points[4], to: e.points[5] });
  return out;
}

const jigsaw: LibraryDesign = {
  id: "jigsaw",
  name: "Jigsaw puzzle",
  group: "Toys and gifts",
  description:
    "A jigsaw puzzle with classic round tabs that lock together. Change the pattern number for a different set of pieces. The cuts between pieces are cut first and the border last. Engrave or glue a picture on the sheet first. Each cut is shared by the two pieces either side, so how snugly they fit is set by how thin your laser cuts.",
  icon: '<path d="M6 6h16v6a3 3 0 1 0 0 6v4H16a3 3 0 1 1-6 0H6z"/><path d="M26 6h16v16h-6a3 3 0 1 0-6 0h-4v-6a3 3 0 1 1 0-6z" opacity=".7"/><path d="M6 26h4a3 3 0 1 0 6 0h6v16H6z" opacity=".7"/><path d="M26 26h4a3 3 0 1 1 6 0h6v16H26v-6a3 3 0 1 0 0-6z"/>',
  inputs: (m) => [
    { key: "width", label: "Width", kind: "number", unit: "mm", default: 200, min: 30, max: 580 },
    { key: "height", label: "Height", kind: "number", unit: "mm", default: 150, min: 30, max: 290, help: "The R1's bed is 600 × 300 mm." },
    { key: "rows", label: "Rows", kind: "count", default: 4, min: 1, max: 20 },
    { key: "columns", label: "Columns", kind: "count", default: 5, min: 1, max: 30 },
    { key: "tab", label: "Tab size", kind: "count", default: 25, min: 15, max: 32, help: "How far each tab pokes into the next piece, as a percentage of a piece's width." },
    { key: "seed", label: "Pattern number", kind: "count", default: 1, min: 0, max: 999999, help: "Any number: each gives a different arrangement of tabs, and the same number always gives the same puzzle." },
    { key: "thickness", label: "Material thickness", kind: "number", unit: "mm", default: m.thickness || 3, min: 0.5, max: 25, help: "Measure your sheet: 3 mm plywood is often 2.8–3.2 mm. Tabs' necks are kept at least this wide." },
  ],
  problems: (v) => puzzleProblems(puzzleSpec(v)),
  make: (v, ids) => {
    const spec = puzzleSpec(v);
    const p = makePuzzle(spec);
    const group = `puzzle-${take(ids)}`;
    const board = { ...makeRect(take(ids), 0, 0, spec.width, spec.height), name: "Puzzle border", group };
    const cuts = { ...makeShape(take(ids), "Puzzle cuts", allEdges(p).map((e) => ({ segments: edgeSegments(e), closed: false }))), group };
    return {
      items: placed([board, cuts]),
      notes: [`${spec.rows * spec.columns} pieces, each about ${mm(spec.width / spec.columns)} × ${mm(spec.height / spec.rows)}.`, "Leave “Allow for the kerf” off for a puzzle: the pieces share their cuts."],
    };
  },
};

// ---------------------------------------------------------------------------
// Ornament or keyring

/**
 * The shapes, sized by `size` across (S, R = S/2):
 *  - star: five points, the inner corners at 0.45 R;
 *  - heart: two round lobes (radius 0.28 S, centres 0.22 S either side of the middle) and two straight sides, each
 *    touching its lobe exactly (tangent), meeting at a point 0.62 S below the lobes' centres;
 *  - snowflake: a hexagonal middle (0.4 R to its flats) with six arms 0.14 R wide, each with a pair of side branches at
 *    60°; the top arm ends in a round eye for the hole.
 */
const at = (p: P2): P2 => [r6(p[0]), r6(p[1])];

/** One piece of an outline: a straight line to `to`, or an arc round `centre` (anticlockwise) to `to`. */
export type PathStep = { to: P2; centre?: P2 };

export interface OrnamentShape {
  /** The outline as steps from `start` (closed: the last step ends at `start`). Empty for the circle. */
  start: P2;
  steps: PathStep[];
  /** The circle's radius (circle only). */
  circle?: number;
  hole: { c: P2; d: number } | null;
  /** Where the words go. */
  centre: P2;
}

const rot = (p: P2, deg: number): P2 => {
  const a = (deg * Math.PI) / 180;
  return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
};

function starShape(R: number, d: number): OrnamentShape {
  const ri = 0.45 * R;
  const pts: P2[] = Array.from({ length: 10 }, (_, k) => {
    const a = ((90 + 36 * k) * Math.PI) / 180;
    const r = k % 2 ? ri : R;
    return at([r * Math.cos(a), r * Math.sin(a)]);
  });
  const s36 = Math.sin((36 * Math.PI) / 180);
  const c36 = Math.cos((36 * Math.PI) / 180);
  // In the top point, as high as leaves 2 mm round the hole: the point is ri·sin36 wide each side at ri·cos36 high.
  const y = R - ((d / 2 + 2) * (R - ri * c36)) / (ri * s36) - d / 2;
  return { start: pts[0], steps: [...pts.slice(1), pts[0]].map((to) => ({ to })), hole: d > 0 ? { c: [0, r6(y)], d } : null, centre: [0, 0] };
}

/** Where a line from `p` touches a circle (centre c, radius r): the touching point on the outer side (bigger |x|). */
function tangentPoint(p: P2, c: P2, r: number): P2 {
  const [dx, dy] = [p[0] - c[0], p[1] - c[1]];
  const D = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  const turn = Math.acos(r / D);
  const options = [base + turn, base - turn].map((a): P2 => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  return options.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))[0];
}

function heartShape(S: number, d: number): OrnamentShape {
  const r = 0.28 * S;
  const c = S / 2 - r;
  const cusp: P2 = at([0, Math.sqrt(r * r - c * c)]);
  const tip: P2 = [0, r6(-0.62 * S)];
  const tr = at(tangentPoint(tip, [c, 0], r));
  const tl: P2 = [-tr[0], tr[1]];
  return {
    start: tip,
    steps: [{ to: tr }, { to: cusp, centre: [r6(c), 0] }, { to: tl, centre: [r6(-c), 0] }, { to: tip }],
    hole: d > 0 ? { c: [0, r6(cusp[1] - 2.5 - d / 2)], d } : null,
    centre: [0, r6(-0.12 * S)],
  };
}

/** How far apart the cut edges of an ornament must stay (mm), and its snowflake's eye from the branches beside it. */
export const EDGE_ROOM = 1.5;
const FLAKE_ROOM = EDGE_ROOM;

function distanceToSegment(p: P2, a: P2, b: P2): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** The snowflake's sizes, as shares of its radius. */
export const FLAKE = { hub: 0.4, arm: 0.07, branchAt: 0.62, branch: 0.22 };

function flakeShape(R: number, d: number): OrnamentShape {
  const h = FLAKE.arm * R;
  const F = FLAKE.hub * R;
  const p = FLAKE.branchAt * R;
  const l = FLAKE.branch * R;
  const re = Math.max(d / 2 + 2, h * 1.5);
  const eye = R - re;
  const dir: P2 = [0.5, -Math.sqrt(3) / 2];
  const nrm: P2 = [Math.sqrt(3) / 2, 0.5];
  const branchEnd = (side: 1 | -1): P2 => [p + l * dir[0] + side * h * nrm[0], l * dir[1] + side * h * nrm[1]];
  // One arm along +x, from the hub's corner below it to the corner above it (anticlockwise round the whole flake).
  const branch: P2[] = [[p - h / Math.sqrt(3), -h], branchEnd(-1), branchEnd(1), [p + h * Math.sqrt(3), -h]];
  const lower: PathStep[] = [{ to: [F, -h] }, ...branch.map((to) => ({ to }))];
  // The top arm's eye must stay clear of its side branches: if it doesn't, that arm goes without them.
  const eyeGap = Math.min(...branch.slice(0, -1).map((q, i) => distanceToSegment([eye, 0], q, branch[i + 1]))) - re;
  const topLower: PathStep[] = eyeGap >= FLAKE_ROOM ? lower : [{ to: [F, -h] }];
  const flip = (q: P2): P2 => [q[0], -q[1]];
  const upperOf = (list: PathStep[]): PathStep[] => [...list].reverse().map((s) => ({ to: flip(s.to) }));
  const corner: P2 = [F, F / Math.sqrt(3)];
  const steps: PathStep[] = [];
  for (let k = 0; k < 6; k++) {
    const deg = 90 + 60 * k;
    const own = k === 0 ? topLower : lower;
    const arm: PathStep[] = [...own];
    if (k === 0) {
      // The top arm ends in the eye (a round end bigger than the arm, for the hole).
      const x = eye - Math.sqrt(re * re - h * h);
      arm.push({ to: [x, -h] }, { to: [x, h], centre: [eye, 0] });
    } else arm.push({ to: [R, -h] }, { to: [R, h] });
    arm.push(...upperOf(own), { to: corner });
    steps.push(...arm.map((s) => ({ to: at(rot(s.to, deg)), ...(s.centre ? { centre: at(rot(s.centre, deg)) } : {}) })));
  }
  const start = at(rot(corner, 30));
  steps[steps.length - 1] = { to: start };
  return { start, steps, hole: d > 0 ? { c: [0, r6(eye)], d } : null, centre: [0, 0] };
}

export function ornamentShape(v: Values): OrnamentShape {
  const S = n(v, "size");
  const d = n(v, "hole");
  if (v.shape === "heart") return heartShape(S, d);
  if (v.shape === "snowflake") return flakeShape(S / 2, d);
  if (v.shape === "circle") return { start: [0, 0], steps: [], circle: S / 2, hole: d > 0 ? { c: [0, r6(S / 2 - 2.5 - d / 2)], d } : null, centre: [0, r6(-d / 2)] };
  return starShape(S / 2, d);
}

/** Points along an arc from a to b, anticlockwise round c. */
function arcBetween(a: P2, b: P2, c: P2, count = 24): P2[] {
  const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  let a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
  while (a1 <= a0) a1 += 2 * Math.PI;
  return Array.from({ length: count }, (_, i) => {
    const t = a0 + ((a1 - a0) * (i + 1)) / count;
    return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] as P2;
  });
}

/** The outline as a polygon (arcs in short pieces), anticlockwise. */
export function ornamentPolygon(s: OrnamentShape): P2[] {
  if (s.circle) return Array.from({ length: 96 }, (_, i) => [s.circle! * Math.cos((i * Math.PI) / 48), s.circle! * Math.sin((i * Math.PI) / 48)] as P2);
  const out: P2[] = [];
  let from = s.start;
  for (const step of s.steps) {
    if (step.centre) out.push(...arcBetween(from, step.to, step.centre));
    else out.push(step.to);
    from = step.to;
  }
  return out;
}

/** The outline as exact segments: lines and arcs end to end. */
export function ornamentSegments(s: OrnamentShape): Segment[] {
  let from = s.start;
  return s.steps.map((step) => {
    const seg: Segment = step.centre ? { kind: "arc", from, mid: arcMiddle(step.centre, from, step.to), to: step.to } : { kind: "line", from, to: step.to };
    from = step.to;
    return seg;
  });
}

function segmentsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const side = (o: P2, p: P2, q: P2) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const [d1, d2, d3, d4] = [side(c, d, a), side(c, d, b), side(a, b, c), side(a, b, d)];
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Each step of an outline as a polyline from where the last ended (arcs in short pieces). */
export function stepPolylines(s: OrnamentShape): P2[][] {
  let from = s.start;
  return s.steps.map((step) => {
    const pts = [from, ...(step.centre ? arcBetween(from, step.to, step.centre, 12) : [step.to])];
    from = step.to;
    return pts;
  });
}

/** How close an outline comes to itself (mm): 0 where it crosses itself. A circle can't. */
export function outlineGap(s: OrnamentShape): number {
  if (s.circle) return Infinity;
  const runs = stepPolylines(s);
  const count = runs.length;
  let best = Infinity;
  for (let i = 0; i < count; i++)
    for (let j = i + 2; j < count; j++) {
      if (i === 0 && j === count - 1) continue;
      const [a, b] = [runs[i], runs[j]];
      for (let u = 0; u + 1 < a.length; u++)
        for (let w = 0; w + 1 < b.length; w++) {
          if (segmentsCross(a[u], a[u + 1], b[w], b[w + 1])) return 0;
          best = Math.min(best, distanceToSegment(a[u], b[w], b[w + 1]), distanceToSegment(a[u + 1], b[w], b[w + 1]), distanceToSegment(b[w], a[u], a[u + 1]), distanceToSegment(b[w + 1], a[u], a[u + 1]));
        }
    }
  return best;
}

/** Room the words must leave to the edge and the hole (mm). */
export const WORDS_ROOM = 1.5;

function insidePolygon(p: P2, poly: P2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function distanceToPolygon(p: P2, poly: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, distanceToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

const ornamentWords = (v: Values, s: OrnamentShape, id = "words"): Item | null => {
  const words = str(v, "text").trim();
  return words ? wordsAt(id, "Ornament words", words, n(v, "height"), fontOf(v), s.centre[0], s.centre[1]) : null;
};

function ornamentProblems(v: Values): string[] {
  const s = ornamentShape(v);
  const shape = String(v.shape);
  const poly = ornamentPolygon(s);
  const gap = outlineGap(s);
  if (gap < EDGE_ROOM) return [gap === 0 ? `The ${shape}'s outline would cross itself at this size: make it bigger or the hole smaller.` : `Parts of the ${shape} would be only ${mm(gap)} wide — too thin to cut: make it bigger or the hole smaller.`];
  const words = ornamentWords(v, s);
  const contours = words ? itemOutlines(words).map((o) => pathPoints(o.segments, o.closed, 0.05) as P2[]) : [];
  const ok = (p: P2) => insidePolygon(p, poly) && distanceToPolygon(p, poly) >= WORDS_ROOM && (!s.hole || Math.hypot(p[0] - s.hole.c[0], p[1] - s.hole.c[1]) >= s.hole.d / 2 + WORDS_ROOM);
  if (s.hole && !(insidePolygon(s.hole.c, poly) && distanceToPolygon(s.hole.c, poly) >= s.hole.d / 2 + 1.5)) return [`The hole is too big for the ${shape}: make it smaller or the shape bigger.`];
  if (contours.some((c) => !c.every(ok))) return [`The words don't fit on the ${shape}: make the letters smaller or the shape bigger.`];
  return [];
}

const ornament: LibraryDesign = {
  id: "ornament",
  name: "Ornament or keyring",
  group: "Toys and gifts",
  description:
    "A star, heart, circle or snowflake with a name engraved on it and a hole to hang it from — a Christmas tree decoration, a gift tag or a keyring.",
  icon: '<path d="M24 6l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z"/><circle cx="24" cy="12" r="1.8"/>',
  inputs: () => [
    {
      key: "shape",
      label: "Shape",
      kind: "choice",
      default: "star",
      choices: [
        { value: "star", label: "Star" },
        { value: "heart", label: "Heart" },
        { value: "circle", label: "Circle" },
        { value: "snowflake", label: "Snowflake" },
      ],
    },
    { key: "size", label: "Size", kind: "number", unit: "mm", default: 80, min: 25, max: 280, help: "Across." },
    { key: "text", label: "Words", kind: "text", default: "NOEL", help: "Engraved in the middle; leave empty for none." },
    fontChoice("inter-bold"),
    { key: "height", label: "Letter height", kind: "number", unit: "mm", default: 7, min: 2, max: 60 },
    { key: "hole", label: "Hanging hole", kind: "number", unit: "mm", default: 4, min: 0, max: 20, help: "0 for no hole; 4–5 mm takes a ribbon, a key ring needs about 4." },
  ],
  problems: ornamentProblems,
  make: (v, ids) => {
    const s = ornamentShape(v);
    const group = `ornament-${take(ids)}`;
    const name = `Ornament (${String(v.shape)})`;
    const items: Item[] = [s.circle ? { ...makeCircle(take(ids), 0, 0, s.circle), name, group } : { ...makeShape(take(ids), name, [{ segments: ornamentSegments(s), closed: true }]), group }];
    if (s.hole) items.push({ ...makeCircle(take(ids), s.hole.c[0], s.hole.c[1], s.hole.d / 2), name: "Ornament hole", group });
    const words = ornamentWords(v, s, take(ids));
    if (words) items.push({ ...words, group });
    return { items: placed(items), notes: [] };
  },
};

export const TOYS_3: LibraryDesign[] = [jigsaw, ornament];
