/**
 * Browser smoke test: serves the production build, opens it in headless
 * Chromium and does what a person would: draw a rectangle, a circle, a line
 * and some words → set what the laser does → arrange → export an SVG and a
 * DXF → import an SVG → save and open a .juracut file → undo. Fails on any
 * console error. Run after `npm run build`.
 *
 * In GitHub Actions, problems are reported as annotations. SMOKE_SCREENSHOT=1
 * also saves smoke.png beside the build.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";

const inCI = process.env.GITHUB_ACTIONS === "true";
const annotate = (level, title, message) => {
  if (inCI) console.log(`::${level} title=${title}::${String(message).replace(/%/g, "%25").replace(/\r?\n/g, "%0A")}`);
  else console.log(`[${level}] ${title}: ${message}`);
};

// The site's base path, as vite.config.ts builds it (CI passes BASE_PATH; default /JuraCUT/).
const wanted = process.env.BASE_PATH || "/JuraCUT/";
const basePath = `/${wanted.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
const dist = process.env.SMOKE_DIST || "dist";
if (!existsSync(join(dist, "index.html"))) {
  annotate("error", "Smoke test", `No build at ${dist}/index.html — run npm run build first.`);
  process.exit(1);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  let path = new URL(req.url, "http://x").pathname;
  if (path.startsWith(basePath)) path = path.slice(basePath.length - 1);
  if (path === "/" || path === "") path = "/index.html";
  try {
    const data = await readFile(join(dist, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(4173, "127.0.0.1", r));

/** A small PNG (black shapes on white) made here, for the Trace window: a ring and a bar. */
function testPng(w = 120, h = 80) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - 40, y - 40);
      const dark = (r < 30 && r > 18) || (x > 80 && x < 110 && y > 20 && y < 60);
      raw.fill(dark ? 0 : 255, y * (w * 3 + 1) + 1 + x * 3, y * (w * 3 + 1) + 4 + x * 3);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

let step = "starting";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const store = (fn) => page.evaluate(fn);
const items = () => store(() => window.juracutStore.getState().history.present.items.map((i) => ({ kind: i.kind, op: i.op, name: i.name })));
const bedPoint = async (mm) => page.evaluate(([x, y]) => {
  // The bed view's transform: find it from the SVG's group.
  const g = document.querySelector(".bed-svg > g");
  const m = /matrix\(([-\d.e]+) 0 0 ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)/.exec(g.getAttribute("transform"));
  const r = document.querySelector(".bed-svg").getBoundingClientRect();
  return [r.left + Number(m[3]) + x * Number(m[1]), r.top + Number(m[4]) + y * Number(m[2])];
}, mm);
const drag = async (from, to) => {
  const a = await bedPoint(from);
  const b = await bedPoint(to);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  await page.mouse.move(b[0], b[1]);
  await page.mouse.up();
};
const expect = (ok, what) => {
  if (!ok) throw new Error(`Expected ${what}`);
};

try {
  step = "open the app";
  await page.goto(`http://127.0.0.1:4173${basePath}?smoke`);
  await page.waitForSelector(".bed-svg");
  await page.waitForFunction(() => !!window.juracutStore);
  await page.evaluate(() => localStorage.clear());
  // The browser's own Save / Open windows can't be driven from a test: the ordinary download and file picker are used instead.
  await page.addInitScript(() => {
    window.showOpenFilePicker = undefined;
    window.showSaveFilePicker = undefined;
  });
  await page.reload();
  await page.waitForFunction(() => !!window.juracutStore);
  await page.waitForTimeout(200);

  step = "draw a rectangle";
  await page.keyboard.press("r");
  await drag([20, 20], [80, 60]);
  let list = await items();
  expect(list.length === 1 && list[0].kind === "rect", "one rectangle");

  step = "draw a circle inside it";
  await page.keyboard.press("c");
  await drag([30, 40], [35, 40]);
  list = await items();
  expect(list.length === 2 && list[1].kind === "circle", "a circle");

  step = "draw a line and score it";
  await page.keyboard.press("l");
  await drag([100, 20], [160, 20]);
  await page.click(".op-button:has-text('Score')");
  list = await items();
  expect(list[2].kind === "line" && list[2].op === "score", "a scored line");

  step = "add words";
  await page.keyboard.press("t");
  const p = await bedPoint([100, 60]);
  await page.mouse.click(p[0], p[1]);
  await page.waitForSelector(".text-box");
  await page.fill(".text-box", "JuraCUT");
  list = await items();
  expect(list[3].kind === "text" && list[3].op === "engrave", "engraved words");
  const words = await store(() => window.juracutStore.getState().history.present.items[3].text);
  expect(words === "JuraCUT", "the words typed");

  step = "select all and arrange";
  await page.click(".bed-svg", { position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+a");
  const selected = await store(() => window.juracutStore.getState().selection.length);
  expect(selected === 4, "4 selected");
  await page.click(".arrange-button");
  await page.click(".menu-choice:has-text('In rows')");

  step = "export an SVG";
  await page.click(".primary-button:has-text('Export for laser')");
  await page.waitForSelector(".export-preview svg");
  await page.click(".check-row:has-text('Everything'), .segmented button:has-text('Everything')").catch(() => {});
  const [download] = await Promise.all([page.waitForEvent("download"), page.click(".modal button:has-text('Save SVG')")]);
  const svgText = await readFile(await download.path(), "utf8");
  expect(svgText.includes('stroke="#FF0000"') && svgText.includes('stroke="#0000FF"') && svgText.includes('stroke="#00FF00"') && svgText.includes('fill="#000000"'), "all four layers in the SVG");
  expect(/width="[\d.]+mm"/.test(svgText), "a millimetre width");

  step = "export a DXF";
  const [dxf] = await Promise.all([page.waitForEvent("download"), page.click(".modal button:has-text('Save DXF')")]);
  const dxfText = await readFile(await dxf.path(), "utf8");
  expect(dxfText.includes("CUT_OUTER") && dxfText.includes("SCORE") && dxfText.includes("ENGRAVE"), "DXF layers");
  await page.keyboard.press("Escape");

  step = "import the SVG back in";
  await page.evaluate(() => window.juracutStore.getState().clearSelection());
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("button:has-text('Import')")]);
  await chooser.setFiles({ name: "back.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svgText) });
  await page.waitForFunction(() => window.juracutStore.getState().history.present.items.length === 7);
  list = await items();
  expect(list.slice(4).map((i) => i.op).sort().join() === "cut,engrave,score", "cut, score and engrave shapes came back");

  step = "save a .juracut file and open it";
  const [saved] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  const savedText = await readFile(await saved.path(), "utf8");
  expect(JSON.parse(savedText).items.length === 7, "7 shapes in the saved file");
  page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('New')");
  await page.waitForFunction(() => window.juracutStore.getState().history.present.items.length === 0);
  const [chooser2] = await Promise.all([page.waitForEvent("filechooser"), page.click("button:has-text('Open')")]);
  await chooser2.setFiles({ name: "Test.juracut", mimeType: "application/json", buffer: Buffer.from(savedText) });
  await page.waitForFunction(() => window.juracutStore.getState().history.present.items.length === 7);

  step = "design library: a stencil and a box";
  await page.evaluate(() => window.juracutStore.getState().newDocument());
  await page.click(".tool-button:has-text('Library')");
  await page.waitForSelector(".library-card");
  await page.click(".library-card:has-text('Stencil')");
  await page.fill("#lib-text", "HELLO");
  await page.waitForSelector(".library-preview path");
  await page.click("button:has-text('Put on the bed')");
  list = await items();
  expect(list.length === 2 && list.some((i) => i.name === "Stencil letters"), "a stencil sheet and its letters");
  await page.click(".tool-button:has-text('Library')");
  // The search finds it too.
  await page.fill(".library-search", "finger");
  await page.click(".library-card:has-text('Finger-joint box')");
  await page.click("button:has-text('Put on the bed')");
  list = await items();
  expect(list.length === 8, "6 box panels added");
  await page.click(".tool-button:has-text('Library')");
  await page.click(".library-card:has-text('Gear')");
  await page.waitForSelector(".library-preview path");
  await page.click("button:has-text('Back')");
  await page.waitForSelector(".library-card");
  await page.keyboard.press("Escape");

  step = "group, line up and space out";
  await page.evaluate(() => {
    const s = window.juracutStore.getState();
    const ids = s.history.present.items.filter((i) => i.name.startsWith("Box")).map((i) => i.id);
    s.select(ids);
  });
  await page.click(".tool-button:has-text('Group')");
  const groupCount = await store(() => new Set(window.juracutStore.getState().history.present.items.filter((i) => i.name.startsWith("Box")).map((i) => i.group)).size);
  expect(groupCount === 1, "the box panels in one group");
  await page.click(".tool-button:has-text('Ungroup')");
  await page.click("button[aria-label='Line up left edges']");
  const lefts = await store(() => {
    const st = window.juracutStore.getState();
    return st.history.present.items.filter((i) => st.selection.includes(i.id)).length;
  });
  expect(lefts === 6, "six panels still selected after lining up");
  await page.click("button:has-text('Column')");
  // The toolbar's Align menu: line up against the key shape (the first one picked stays put), then centre on the bed.
  const keyBefore = await store(() => {
    const st = window.juracutStore.getState();
    return JSON.stringify(st.history.present.items.find((i) => i.id === st.selection[0]));
  });
  await page.click(".align-button");
  await page.click(".align-menu button[role='radio']:has-text('Key shape')");
  await page.click(".align-menu button[aria-label='Line up right edges']");
  const keyAfter = await store(() => {
    const st = window.juracutStore.getState();
    return JSON.stringify(st.history.present.items.find((i) => i.id === st.selection[0]));
  });
  expect(keyBefore === keyAfter, "the key shape stays put when the others line up with it");
  await page.keyboard.press("Escape");
  await page.mouse.move(5, 5);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press("Alt+KeyC");
  const centred = await store(() => {
    const st = window.juracutStore.getState();
    const boxes = st.history.present.items.filter((i) => st.selection.includes(i.id)).map((i) => window.juracutBox(i));
    const x0 = Math.min(...boxes.map((b) => b[0]));
    const x1 = Math.max(...boxes.map((b) => b[2]));
    return Math.abs((x0 + x1) / 2 - st.history.present.bed[0] / 2) < 1e-6;
  });
  expect(centred, "Alt+C centres the selection on the bed");
  await page.evaluate(() => window.juracutStore.getState().setAlignAgainst("each"));
  await page.click(".arrange-button");
  await page.click(".menu-choice:has-text('In rows')");

  step = "trace a picture";
  const [pic] = await Promise.all([page.waitForEvent("filechooser"), page.click("button:has-text('Import')")]);
  await pic.setFiles({ name: "logo.png", mimeType: "image/png", buffer: testPng() });
  await page.waitForSelector(".trace-preview path");
  await page.waitForFunction(() => (document.querySelector(".trace-preview path")?.getAttribute("d") ?? "").length > 20);
  await page.click(".modal button:has-text('Put on the bed')");
  const traced = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.name === "logo"));
  expect(traced && traced.kind === "shape" && traced.op === "engrave" && traced.outlines.length === 3, "the ring (outside and hole) and the bar traced");

  step = "engrave a photo";
  const [pic2] = await Promise.all([page.waitForEvent("filechooser"), page.click("button:has-text('Import')")]);
  await pic2.setFiles({ name: "photo.png", mimeType: "image/png", buffer: testPng() });
  await page.click(".library-tabs button:has-text('Engrave as a photo')");
  await page.waitForSelector("img.photo-preview");
  await page.click(".modal button:has-text('Put on the bed')");
  await page.waitForFunction(() => window.juracutStore.getState().history.present.items.some((i) => i.kind === "picture"));
  const photo = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.kind === "picture"));
  expect(photo.op === "engrave" && photo.mode === "dots" && photo.src.startsWith("data:image/jpeg"), "a photo to engrave as dots");
  await page.waitForSelector(".bed-svg .picture image");
  await page.evaluate((id) => window.juracutStore.getState().select([id]), photo.id);
  await page.click(".primary-button:has-text('Export for laser')");
  await page.click(".segmented button:has-text('Selected')");
  await page.waitForSelector(".export-preview svg image");
  const [photoSvg] = await Promise.all([page.waitForEvent("download"), page.click(".modal button:has-text('Save SVG')")]);
  const photoText = await readFile(await photoSvg.path(), "utf8");
  expect(photoText.includes("<image ") && photoText.includes("data:image/png;base64,"), "the photo inside the SVG");
  const [photoPng] = await Promise.all([page.waitForEvent("download"), page.click(".modal button:has-text('as PNG')")]);
  const pngBytes = await readFile(await photoPng.path());
  expect(pngBytes.subarray(1, 4).toString() === "PNG" && pngBytes.includes(Buffer.from("pHYs")), "a PNG with its size in dots per mm");
  await page.keyboard.press("Escape");
  // Its setting in the side panel: Black and white.
  await page.evaluate((id) => window.juracutStore.getState().select([id]), photo.id);
  await page.click(".properties .segmented button:has-text('Black & white')");
  expect((await store(() => window.juracutStore.getState().history.present.items.find((i) => i.kind === "picture").mode)) === "black", "the photo's style changed");

  step = "pack tightly";
  await page.click(".arrange-button");
  await page.click(".menu-choice:has-text('Pack tightly')");
  const outside = await store(() => {
    const s = window.juracutStore.getState();
    return s.history.present.items.length;
  });
  expect(outside > 0, "shapes still there after packing");

  step = "the link with JuraCAD";
  // A pretend JuraCAD tab on the same site's channel: it finds JuraCUT's tab, sends it a design, and answers
  // what JuraCUT sends back.
  await page.evaluate(() => {
    const cad = { inbox: [], cutTab: null, channel: new BroadcastChannel("jura-link.v1") };
    window.fakeJuraCAD = cad;
    cad.channel.onmessage = (e) => {
      const m = e.data;
      cad.inbox.push(m);
      if (m.type === "here" && m.app === "juracut") cad.cutTab = m.tab;
      if (m.type === "who") cad.channel.postMessage({ type: "here", app: "juracad", tab: "cad-tab" });
      if (m.type === "parcel" && m.tab === "cad-tab") cad.channel.postMessage({ type: "got", tab: "cad-tab", id: m.parcel.id, ok: true, message: "It's a new sketch in JuraCAD." });
    };
    cad.channel.postMessage({ type: "who", from: "juracad", tab: "cad-tab" });
  });
  await page.waitForFunction(() => window.fakeJuraCAD.cutTab);
  const beforeLink = await store(() => window.juracutStore.getState().history.present.items.length);
  await page.evaluate(() => {
    const cad = window.fakeJuraCAD;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><g id="cut-outer"><path d="M0 0H40V30H0Z" fill="none" stroke="#ff0000"/></g><g id="cut-inner"><circle cx="20" cy="15" r="4" fill="none" stroke="#0000ff"/></g></svg>';
    cad.channel.postMessage({ type: "parcel", tab: cad.cutTab, parcel: { id: "from-cad-1", from: "juracad", to: "juracut", name: "Bracket", kind: "svg", content: svg } });
  });
  await page.waitForFunction(() => window.fakeJuraCAD.inbox.some((m) => m.type === "got" && m.id === "from-cad-1"));
  const got = await store(() => window.fakeJuraCAD.inbox.find((m) => m.type === "got"));
  const linked = await store(() => {
    const st = window.juracutStore.getState();
    return st.history.present.items.filter((i) => st.selection.includes(i.id)).map((i) => i.name);
  });
  expect(got.ok && linked.length === 1 && linked[0] === "Bracket", `JuraCAD's design is on the bed (${JSON.stringify(got)} ${JSON.stringify(linked)})`);
  expect((await store(() => window.juracutStore.getState().history.present.items.length)) === beforeLink + 1, "one shape came in");
  // And back: Export › Send to JuraCAD goes to the open JuraCAD tab, as a DXF.
  await page.click(".primary-button:has-text('Export for laser')");
  await page.waitForSelector(".export-preview svg");
  await page.click(".modal button:has-text('Send to JuraCAD')");
  await page.waitForFunction(() => window.fakeJuraCAD.inbox.some((m) => m.type === "parcel" && m.parcel.to === "juracad"));
  const parcel = await store(() => window.fakeJuraCAD.inbox.find((m) => m.type === "parcel" && m.parcel.to === "juracad").parcel);
  expect(parcel.kind === "dxf" && parcel.content.includes("ENTITIES") && parcel.from === "juracut", "a DXF went to JuraCAD");
  await page.waitForSelector(".toast:has-text('Sent to JuraCAD')");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.fakeJuraCAD.channel.close());

  step = "materials and kerf";
  await page.click(".settings-button");
  await page.click(".settings-menu button:has-text('Materials')");
  await page.waitForSelector(".materials-table");
  await page.click(".materials-table tr:nth-child(2) button:has-text('Use')");
  const material = await store(() => window.juracutStore.getState().history.present.material);
  expect(material.name === "6 mm plywood" && material.kerf === 0.2, "the design uses 6 mm plywood");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const s = window.juracutStore.getState();
    s.newDocument();
    s.setMaterial({ name: "test", thickness: 3, kerf: 0.2 });
    s.addItems([{ id: "k", name: "Square", op: "cut", kind: "rect", x: 10, y: 10, w: 40, h: 40, radius: 0, angle: 0 }]);
  });
  await page.click(".primary-button:has-text('Export for laser')");
  await page.waitForSelector(".export-preview svg");
  const [kerfed] = await Promise.all([page.waitForEvent("download"), page.click(".modal button:has-text('Save SVG')")]);
  const kerfText = await readFile(await kerfed.path(), "utf8");
  expect(kerfText.includes('width="40.2mm"'), "the square grew by the kerf");
  await page.keyboard.press("Escape");

  step = "undo, dark mode, help";
  // Undo takes the square back off; redo puts it back.
  const before = await store(() => window.juracutStore.getState().history.present.items.length);
  await page.keyboard.press("Control+z");
  const after = await store(() => window.juracutStore.getState().history.present.items.length);
  expect(after === before - 1, "undo took the last shape away");
  await page.keyboard.press("Control+y");
  expect((await store(() => window.juracutStore.getState().history.present.items.length)) === before, "redo put it back");
  await page.click(".settings-button");
  await page.click(".settings-menu button:has-text('Dark')");
  expect((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "dark mode");
  await page.keyboard.press("Escape");
  await page.keyboard.type("?");
  await page.waitForSelector(".modal:has-text('Help and shortcuts')");
  await page.keyboard.press("Escape");

  if (process.env.SMOKE_SCREENSHOT === "1") await page.screenshot({ path: join(dist, "smoke.png") });
  if (errors.length) throw new Error(`Console errors:\n${errors.join("\n")}`);
  annotate("notice", "Smoke test", "Drew shapes, exported SVG and DXF, imported, saved, opened, undid: all fine.");
} catch (e) {
  annotate("error", `Smoke test failed at "${step}"`, `${e instanceof Error ? e.message : e}${errors.length ? `\nConsole errors:\n${errors.join("\n")}` : ""}`);
  await page.screenshot({ path: join(dist, "smoke-failure.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
