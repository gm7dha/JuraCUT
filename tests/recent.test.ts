import { describe, expect, it } from "vitest";
import { newDocument } from "../src/model/document";
import { keepRecent, memoryStore, MOST_RECENT, openRecent, recentList, thumbnail } from "../src/model/recent";
import { makeCircle, makeRect } from "../src/model/shapes";

describe("recent designs", () => {
  it("keeps designs newest first, drops the oldest past the limit, and opens them again", async () => {
    const store = memoryStore();
    for (let i = 0; i < MOST_RECENT + 3; i++) await keepRecent(store, `d${i}`, { ...newDocument(), name: `Design ${i}`, items: [makeRect("r", 0, 0, 10 + i, 10)] }, 1000 + i);
    const list = await recentList(store);
    expect(list.length).toBe(MOST_RECENT);
    expect(list[0].name).toBe(`Design ${MOST_RECENT + 2}`);
    expect(list.some((m) => m.id === "d0")).toBe(false);
    const back = await openRecent(store, list[0].id);
    expect(back!.items[0].kind === "rect" && back!.items[0].w).toBe(10 + MOST_RECENT + 2);
  });
  it("updates a design kept under the same id, and skips empty ones", async () => {
    const store = memoryStore();
    await keepRecent(store, "a", { ...newDocument(), items: [makeRect("r", 0, 0, 5, 5)] }, 1);
    await keepRecent(store, "a", { ...newDocument(), items: [makeRect("r", 0, 0, 5, 5), makeCircle("c", 9, 9, 2)] }, 2);
    await keepRecent(store, "b", newDocument(), 3);
    const list = await recentList(store);
    expect(list.length).toBe(1);
    expect(list[0].shapes).toBe(2);
  });
  it("draws a small picture of the outlines", () => {
    const t = thumbnail({ ...newDocument(), items: [makeRect("r", 0, 0, 20, 10), { ...makeCircle("c", 5, 5, 2), op: "engrave" }] });
    expect(t.startsWith("<svg") && t.includes("<path") && t.includes("#343a40")).toBe(true);
    expect(thumbnail(newDocument())).toBe("");
  });
});
