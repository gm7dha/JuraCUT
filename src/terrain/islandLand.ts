/**
 * Which land to keep (pure), from JuraCAD's island puzzle (src/terrain/islandPuzzle.ts), unchanged: the land on a grid of
 * cells, every island / the biggest / all of it, or just one island cut free from land the height data joins it to (at
 * a bridge or narrow strait), and lochs and gaps closed in by the land filled in.
 */
type XY = [number, number];

export type IslandLand = "islands" | "biggest" | "all";

export interface IslandOnly {
  keep: { e: number; n: number }[];
  apart?: { e: number; n: number }[];
  /**
   * Points in sea lochs that stay sea even when the height data closes their mouths (Mull's Loch Spelve and Loch Don):
   * a closed-in patch holding one is never filled in. Used with no keep points too (a trimmed area, decided already).
   */
  sea?: { e: number; n: number }[];
}

/** Land (m², or share of what's kept) the cut may give to the other side, beyond its own shaved coast, before saying so. */
export const MOST_HANDED = 2_000_000;
export const MOST_HANDED_SHARE = 0.03;

/** How far (m) a keep or apart point looks for land when it falls on sea, and the widest neck (m, half of it) parted. */
export const KEEP_REACH = 2000;
/** How far (m) an apart point looks for land when it falls on sea: not far, so a point on an islet the data hasn't got never lands on the island itself. */
export const APART_REACH = 600;
/** How far (m) a sea point (`IslandOnly.sea`) looks for sea when the grid reads its own spot as land. */
export const SEA_REACH = 300;
export const WIDEST_NECK = 1500;
/** Heights (m) of low ground tried as shore, in turn, when an island can't be cut free from other land by shape alone. */
export const LOW_JOINS = [2, 5, 10, 20];

/** Squared distance to the nearest `true` cell (in cells), Felzenszwalb–Huttenlocher, separable. */
export function distanceTransform(mask: Uint8Array, nx: number, ny: number): Float64Array {
  const INF = 1e20;
  const d = new Float64Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) d[i] = mask[i] ? 0 : INF;
  const n = Math.max(nx, ny);
  const f = new Float64Array(n);
  const z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const out = new Float64Array(n);
  const pass = (len: number, get: (k: number) => number, set: (k: number, x: number) => void) => {
    for (let q = 0; q < len; q++) f[q] = get(q);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      out[q] = (q - v[k]) ** 2 + f[v[k]];
    }
    for (let q = 0; q < len; q++) set(q, out[q]);
  };
  for (let y = 0; y < ny; y++) pass(nx, (x) => d[y * nx + x], (x, val) => (d[y * nx + x] = val));
  for (let x = 0; x < nx; x++) pass(ny, (y) => d[y * nx + x], (y, val) => (d[y * nx + x] = val));
  return d;
}

const STEPS: XY[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Number each 4-connected stretch of cells where `ok` holds (−1 elsewhere); returns the numbers and how many. */
export function stretches(nx: number, ny: number, ok: (c: number) => boolean, same: (a: number, b: number) => boolean = () => true): { id: Int32Array; count: number } {
  const id = new Int32Array(nx * ny).fill(-1);
  let count = 0;
  for (let c0 = 0; c0 < nx * ny; c0++) {
    if (!ok(c0) || id[c0] >= 0) continue;
    const n = count++;
    id[c0] = n;
    const stack = [c0];
    while (stack.length) {
      const c = stack.pop()!;
      const [i, j] = [c % nx, Math.floor(c / nx)];
      for (const [di, dj] of STEPS) {
        const [a, b] = [i + di, j + dj];
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const d = b * nx + a;
        if (id[d] < 0 && ok(d) && same(c0, d)) {
          id[d] = n;
          stack.push(d);
        }
      }
    }
  }
  return { id, count };
}

/**
 * Keep only the land asked for (`isLand` changed in place): every island (land touching the area's edge dropped), the
 * biggest, or all of it. Throws when there's no land at all.
 */
export function keepLand(isLand: Uint8Array, nx: number, ny: number, land: IslandLand, warnings: string[], only?: OnlyCells, heightOf?: (c: number) => number) {
  const N = nx * ny;
  const spec = { land };
  const masses = stretches(nx, ny, (c) => isLand[c] === 1);
  if (!masses.count) throw new Error("There's no land in this area — it's all sea.");
  if (only && only.keep.length && keepOnly(isLand, nx, ny, only, warnings, heightOf)) return;
  if (spec.land !== "all") {
    const size = new Int32Array(masses.count);
    const edge = new Uint8Array(masses.count);
    for (let c = 0; c < N; c++) {
      const m = masses.id[c];
      if (m < 0) continue;
      size[m]++;
      const [i, j] = [c % nx, Math.floor(c / nx)];
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) edge[m] = 1;
    }
    let keep: (m: number) => boolean;
    if (spec.land === "biggest") {
      const big = size.indexOf(Math.max(...size));
      keep = (m) => m === big;
    } else if (edge.some((e, m) => !e && size[m] > 0) ) {
      keep = (m) => !edge[m];
      if (edge.some(Boolean)) warnings.push("Land running off the edge of the area (the mainland, say) is left out.");
    } else {
      keep = () => true;
      warnings.push("All the land runs off the edge of the area, so all of it is used — make the area bigger to take in a whole island.");
    }
    for (let c = 0; c < N; c++) if (isLand[c] && !keep(masses.id[c])) isLand[c] = 0;
  }
}

/** An `IslandOnly` on one grid: its points in cells (fractional, from the grid's south-west corner) and distances in cells. */
export interface OnlyCells {
  keep: XY[];
  apart: XY[];
  reach: number;
  /** How far an apart point looks (cells; missing: `reach`). */
  apartReach?: number;
  widest: number;
  /** m² per cell (missing: only the share of the island counts). */
  cellArea?: number;
  /**
   * Which sides of the grid are the area's own edges, where land is other land (missing: all). A side cut inside the
   * area (the area cut down to the island, put together) isn't: land there is the island's, or what was cut off it.
   */
  edges?: Sides;
}

export interface Sides {
  w: boolean;
  e: boolean;
  s: boolean;
  n: boolean;
}

/** `only` on a grid of `cellM`-metre cells whose south-west corner is `sw`. */
export function onlyCells(only: IslandOnly, sw: { e: number; n: number }, cellM: number, edges?: Sides): OnlyCells {
  const at = (p: { e: number; n: number }): XY => [(p.e - sw.e) / cellM, (p.n - sw.n) / cellM];
  return {
    keep: only.keep.map(at),
    apart: (only.apart ?? []).map(at),
    reach: KEEP_REACH / cellM,
    apartReach: APART_REACH / cellM,
    widest: WIDEST_NECK / cellM,
    cellArea: cellM * cellM,
    ...(edges ? { edges } : {}),
  };
}

/**
 * The land cell nearest a point (cells), within `reach` cells; −1 when the point is off the grid or there's none.
 * `want` 0: the nearest sea cell instead.
 */
function landNear(isLand: Uint8Array, nx: number, ny: number, p: XY, reach: number, want = 1): number {
  const [i0, j0] = [Math.floor(p[0]), Math.floor(p[1])];
  if (i0 < 0 || j0 < 0 || i0 >= nx || j0 >= ny) return -1;
  if ((isLand[j0 * nx + i0] ? 1 : 0) === want) return j0 * nx + i0;
  const r = Math.ceil(reach);
  let [best, bd] = [-1, Infinity];
  for (let j = Math.max(0, j0 - r); j <= Math.min(ny - 1, j0 + r); j++)
    for (let i = Math.max(0, i0 - r); i <= Math.min(nx - 1, i0 + r); i++) {
      if ((isLand[j * nx + i] ? 1 : 0) !== want) continue;
      const d = (i + 0.5 - p[0]) ** 2 + (j + 0.5 - p[1]) ** 2;
      if (d < bd && d <= reach * reach) [bd, best] = [d, j * nx + i];
    }
  return best;
}

/**
 * Keep just the land holding `only`'s keep points (`isLand` changed in place), parted first from other land it's
 * joined to (see `IslandOnly`). False (nothing changed) when no keep point finds land.
 */
export function keepOnly(
  isLand: Uint8Array,
  nx: number,
  ny: number,
  only: OnlyCells,
  warnings: string[],
  /** Each cell's height (m): when the land is too broadly joined to cut free by shape alone, low ground is tried too. */
  heightOf?: (c: number) => number,
): boolean {
  const N = nx * ny;
  const keep = only.keep.map((p) => landNear(isLand, nx, ny, p, only.reach)).filter((c) => c >= 0);
  if (!keep.length) {
    warnings.push("The island wasn't found where it should be in the height data, so the usual Land choice (hidden for this island) was used instead: the puzzle may hold other land too.");
    return false;
  }
  const points = only.apart.map((p) => landNear(isLand, nx, ny, p, only.apartReach ?? only.reach)).filter((c) => c >= 0);
  let masses = stretches(nx, ny, (c) => isLand[c] === 1);
  const keepMasses = new Set(keep.map((c) => masses.id[c]));
  let parted = false;
  let joined = false;
  let handedAway = false;
  let throughLow = 0;
  for (const m of keepMasses) {
    // Other land in this mass: apart points, and its cells on the area's edge.
    const others = points.filter((c) => masses.id[c] === m);
    for (let i = 0; i < nx; i++) for (const j of ny > 1 ? [0, ny - 1] : [0]) if (masses.id[j * nx + i] === m) others.push(j * nx + i);
    for (let j = 1; j < ny - 1; j++) for (const i of nx > 1 ? [0, nx - 1] : [0]) if (masses.id[j * nx + i] === m) others.push(j * nx + i);
    // Land met only on sides cut inside the area (put together): what was left of a join already cut free on a coarser
    // grid, so when it can't be parted again it's kept without a word.
    const ed = only.edges;
    const real = (c: number) => {
      if (!ed) return true;
      const [i, j] = [c % nx, Math.floor(c / nx)];
      return (j === 0 && ed.s) || (j === ny - 1 && ed.n) || (i === 0 && ed.w) || (i === nx - 1 && ed.e);
    };
    const onlyCutSides = !others.some((c) => real(c)) && !points.some((c) => masses.id[c] === m);
    if (!others.length) continue;
    const mine = keep.filter((c) => masses.id[c] === m);
    // The thinnest shaving (cells) at which what's left of the island no longer joins what's left of the other land,
    // shaving from the coast (`low`: and from ground no higher than that, m).
    const findSplit = (low?: number) => {
      const outside = new Uint8Array(N);
      for (let c = 0; c < N; c++) outside[c] = masses.id[c] === m && (low === undefined || heightOf!(c) > low) ? 0 : 1;
      const d2 = distanceTransform(outside, nx, ny);
      for (let t = 1; t <= only.widest; t++) {
        // Points too near the coast to be left in the shaved land stop counting; with none left on a side, it can't be parted.
        if (!mine.some((c) => d2[c] > t * t)) break;
        const core = stretches(nx, ny, (c) => masses.id[c] === m && d2[c] > t * t).id;
        const otherCores = new Set(others.filter((c) => d2[c] > t * t).map((c) => core[c]));
        if (!otherCores.size) break;
        const mineCores = new Set(mine.filter((c) => d2[c] > t * t).map((c) => core[c]));
        if ([...mineCores].some((q) => otherCores.has(q))) continue;
        return { core, mineCores, otherCores, t };
      }
      return null;
    };
    // Both sides grow back over the land shaved off, step by step; whatever the other side reaches first goes.
    const growBack = (split: { core: Int32Array; mineCores: Set<number>; otherCores: Set<number> }) => {
      const side = new Uint8Array(N);
      let frontier: number[] = [];
      for (let c = 0; c < N; c++) {
        const q = split.core[c];
        if (q < 0) continue;
        if (split.mineCores.has(q)) side[c] = 1;
        else if (split.otherCores.has(q)) side[c] = 2;
        else continue;
        frontier.push(c);
      }
      // Thick land that was neither side's (a lobe of the island with a waist narrower than the join) and went to the other
      // side is counted, so a cut that took a real part of the island says so. Thin strips (the join itself) aren't.
      let handed = 0;
      while (frontier.length) {
        const next: number[] = [];
        for (const c of frontier) {
          const [i, j] = [c % nx, Math.floor(c / nx)];
          for (const [di, dj] of STEPS) {
            const [a, b] = [i + di, j + dj];
            if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
            const d = b * nx + a;
            if (!side[d] && masses.id[d] === m) {
              side[d] = side[c];
              next.push(d);
              if (side[d] === 2 && split.core[d] >= 0) handed++;
            }
          }
        }
        frontier = next;
      }
      return { side, handed };
    };
    // Parted by shape first; joined too broadly by shape, the height data may read a shallow strait or bay as low land
    // (the sea's depths blended over the coast), so try again with ever more of the lowest ground counted as shore. A
    // parting that would give away land holding a keep point is never used.
    let cut: { side: Uint8Array; handed: number } | null = null;
    let low: number | undefined;
    for (const tryLow of heightOf ? [undefined, ...LOW_JOINS] : [undefined]) {
      const split = findSplit(tryLow);
      if (!split) continue;
      const grown = growBack(split);
      if (mine.some((c) => grown.side[c] !== 1)) continue;
      cut = grown;
      low = tryLow;
      break;
    }
    if (!cut) {
      if (!onlyCutSides) joined = true;
      continue;
    }
    if (low !== undefined) throughLow = Math.max(throughLow, low);
    const { side, handed } = cut;
    let mineCount = 0;
    for (let c = 0; c < N; c++) if (side[c] === 1) mineCount++;
    if ((only.cellArea !== undefined && handed * only.cellArea > MOST_HANDED) || handed > MOST_HANDED_SHARE * mineCount) handedAway = true;
    for (let c = 0; c < N; c++) if (side[c] === 2) isLand[c] = 0;
    parted = true;
  }
  if (parted) warnings.push("The island is joined to other land in the height data (at a bridge or narrow strait), so it was cut free there.");
  if (handedAway)
    warnings.push("Cutting it free also took away a sizeable piece of land beside the cut — check the island hasn't lost part of itself (a narrow headland, say).");
  if (throughLow)
    warnings.push(`The cut went through low ground (up to ${throughLow} m) that the height data may have read from shallow sea — check the shore near the cut: a bit of bay may be left as land, or a bit of low shore taken.`);
  if (joined) warnings.push("The island is joined to other land too broadly to cut it free, so that land is kept too.");
  if (parted) masses = stretches(nx, ny, (c) => isLand[c] === 1);
  const kept = new Set(keep.map((c) => masses.id[c]));
  let dropped = false;
  for (let c = 0; c < N; c++)
    if (isLand[c] && !kept.has(masses.id[c])) {
      isLand[c] = 0;
      dropped = true;
    }
  if (dropped || parted) warnings.push("Only the island itself is kept: other land in the area is left out.");
  return true;
}

/** Low patches inside the land, filled in: each cell's patch (−1 elsewhere), how many, and each patch's level (m). */
export interface FilledHoles {
  patch: Int32Array;
  count: number;
  level: Float64Array;
  /** Patches left as sea (`fill` said no). */
  kept: number;
  /** Their cells (1), so nothing fills them later. */
  keptCells: Uint8Array;
}

/**
 * Fill in every patch of non-land the land closes round (`isLand` changed in place): only what can be reached from the
 * area's edge through non-land — diagonal steps too, so a sea channel one cell wide still counts — stays sea. Each patch
 * gets the lowest height (`heightOf` a cell) of the land cells beside it: a loch's surface, or the shore round a gap.
 */
export function fillEnclosed(
  isLand: Uint8Array,
  nx: number,
  ny: number,
  heightOf: (c: number) => number,
  /** Fill this patch (its cells, its lowest height)? Missing: every one. */
  fill: (cells: number[], lowest: number) => boolean = () => true,
): FilledHoles {
  const N = nx * ny;
  const open = new Uint8Array(N);
  const stack: number[] = [];
  for (let i = 0; i < nx; i++) for (const j of [0, ny - 1]) stack.push(j * nx + i);
  for (let j = 0; j < ny; j++) for (const i of [0, nx - 1]) stack.push(j * nx + i);
  while (stack.length) {
    const c = stack.pop()!;
    if (open[c] || isLand[c]) continue;
    open[c] = 1;
    const [i, j] = [c % nx, Math.floor(c / nx)];
    for (let b = Math.max(0, j - 1); b <= Math.min(ny - 1, j + 1); b++)
      for (let a = Math.max(0, i - 1); a <= Math.min(nx - 1, i + 1); a++) {
        const d = b * nx + a;
        if (!open[d] && !isLand[d]) stack.push(d);
      }
  }
  const found = stretches(nx, ny, (c) => !isLand[c] && !open[c]);
  // Which to fill: numbered again, the rest left as sea.
  const cellsOf: number[][] = Array.from({ length: found.count }, () => []);
  for (let c = 0; c < N; c++) if (found.id[c] >= 0) cellsOf[found.id[c]].push(c);
  const renumber = new Int32Array(found.count).fill(-1);
  let count = 0;
  for (let q = 0; q < found.count; q++) {
    let lowest = Infinity;
    for (const c of cellsOf[q]) lowest = Math.min(lowest, heightOf(c));
    if (fill(cellsOf[q], lowest)) renumber[q] = count++;
  }
  const patches = { id: new Int32Array(N).fill(-1), count };
  for (let c = 0; c < N; c++) if (found.id[c] >= 0) patches.id[c] = renumber[found.id[c]];
  const level = new Float64Array(patches.count).fill(Infinity);
  for (let c = 0; c < N; c++) {
    const p = patches.id[c];
    if (p < 0) continue;
    const [i, j] = [c % nx, Math.floor(c / nx)];
    for (const [di, dj] of STEPS) {
      const [a, b] = [i + di, j + dj];
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const d = b * nx + a;
      if (isLand[d] && patches.id[d] < 0) level[p] = Math.min(level[p], heightOf(d));
    }
  }
  for (let c = 0; c < N; c++) if (patches.id[c] >= 0) isLand[c] = 1;
  for (let p = 0; p < patches.count; p++) if (!Number.isFinite(level[p])) level[p] = 0;
  const keptCells = new Uint8Array(N);
  for (let c = 0; c < N; c++) if (found.id[c] >= 0 && renumber[found.id[c]] < 0) keptCells[c] = 1;
  return { patch: patches.id, count: patches.count, level, kept: found.count - count, keptCells };
}

