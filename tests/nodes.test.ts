import { describe, expect, it } from "vitest";
import { pathPoints } from "../src/geometry/segments";
import { signedArea } from "../src/geometry/boolean";
import { addedNode, curved, editable, handlesOf, movedHandle, movedNode, nodesOf, pieceAt, removedNode, straightened } from "../src/model/nodes";
import { itemOutlines, makeCircle, makeLine, makeRect } from "../src/model/shapes";
import type { Outline } from "../src/model/types";

const area = (o: Outline[]) => o.reduce((a, x) => a + Math.abs(signedArea(pathPoints(x.segments, true, 0.001))), 0);
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b) < tol, `${a} ≈ ${b}`).toBe(true);

describe("editing points", () => {
  it("lists a square's four corners and moves one", () => {
    const sq = editable(itemOutlines(makeRect("r", 0, 0, 10, 10)));
    const nodes = nodesOf(sq);
    expect(nodes.length).toBe(4);
    const moved = movedNode(sq, nodes[2].ref, [20, 20]);
    expect(nodesOf(moved)[2].at).toEqual([20, 20]);
    near(area(moved), 200); // (0,0) (10,0) (20,20) (0,10)
  });
  it("an open line's two ends, the last one movable", () => {
    const l = editable(itemOutlines(makeLine("l", 0, 0, 10, 0)));
    const nodes = nodesOf(l);
    expect(nodes.length).toBe(2);
    const m = movedNode(l, nodes[1].ref, [10, 5]);
    expect(m[0].segments[0].kind === "line" && m[0].segments[0].to).toEqual([10, 5]);
  });
  it("curves come in as Bézier pieces with handles that move", () => {
    const c = editable(itemOutlines(makeCircle("c", 0, 0, 10)));
    expect(c[0].segments.every((s) => s.kind === "bezier")).toBe(true);
    near(area(c), 100 * Math.PI, 0.05);
    const h = handlesOf(c, nodesOf(c)[0].ref);
    expect(h.length).toBe(2);
    const m = movedHandle(c, h[0].ref, [h[0].at[0] + 5, h[0].at[1]]);
    expect(area(m) !== area(c)).toBe(true);
  });
  it("adds a point without changing the shape, and takes one out", () => {
    const c = editable(itemOutlines(makeCircle("c", 0, 0, 10)));
    const n = c[0].segments.length;
    const hit = pieceAt(c, [10, 0.5], 1)!;
    expect(hit).not.toBe(null);
    const more = addedNode(c, hit.outline, hit.index, hit.t);
    expect(more[0].segments.length).toBe(n + 1);
    near(area(more), area(c), 0.01);
    const sq = editable(itemOutlines(makeRect("r", 0, 0, 10, 10)));
    const tri = removedNode(sq, nodesOf(sq)[1].ref)!;
    expect(tri[0].segments.length).toBe(3);
    near(area(tri), 50);
    expect(removedNode(removedNode(tri, nodesOf(tri)[0].ref)!, { outline: 0, index: 0 })).toBe(null);
  });
  it("makes a piece curved and straight again", () => {
    const sq = editable(itemOutlines(makeRect("r", 0, 0, 10, 10)));
    const c = curved(sq, 0, 0);
    expect(c[0].segments[0].kind).toBe("bezier");
    near(area(c), 100);
    expect(straightened(c, 0, 0)[0].segments[0].kind).toBe("line");
  });
});

describe("editing points after the shape changes", () => {
  it("stops when Undo or Round corners leaves the shape with pieces the point tools don't handle", async () => {
    const { useStore } = await import("../src/model/store");
    const s = useStore.getState();
    s.newDocument();
    s.addItems([{ id: "r", name: "R", op: "cut", kind: "rect", x: 0, y: 0, w: 40, h: 20, radius: 0, angle: 0 }]);
    s.editPoints("r");
    expect(useStore.getState().pointsOf).toBe("r");
    useStore.getState().roundCornersSelected(3);
    expect(useStore.getState().pointsOf).toBe(null);
  });
  it("never finds a point on a piece it can't edit", async () => {
    const { nearestOn } = await import("../src/model/nodes");
    expect(nearestOn({ kind: "arc", from: [0, 0], mid: [5, 5], to: [10, 0] }, [5, 5]).distance).toBe(Infinity);
  });
});
