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
  // A bird box found by searching: 7 pieces cut, and the front's climbing lines scored; then undone.
  await page.click(".tool-button:has-text('Library')");
  await page.fill(".library-search", "bird box");
  await page.click(".library-card:has-text('Bird box')");
  await page.waitForSelector(".library-preview path");
  await page.click("button:has-text('Put on the bed')");
  list = await items();
  const bird = list.filter((i) => i.name.startsWith("Bird box"));
  expect(bird.filter((i) => i.op === "cut").length === 7 && bird.filter((i) => i.op === "score").length === 1, `a bird box: 7 pieces and its score lines (got ${bird.length})`);
  await page.evaluate(() => window.juracutStore.getState().undo());
  list = await items();
  expect(list.length === 8, "the bird box undone");

  step = "island relief from the library (pretend heights, no network)";
  await page.evaluate(() => {
    const R = window.juracutRelief;
    const a = R.islands.find((i) => i.id === "arran");
    const [cx, cy] = [a.sw.e + a.width / 2, a.sw.n + a.height / 2];
    R.pretendHeights.set("arran", R.gridFrom(a.sw, a.width, a.height, 80, (e, n) => Math.max(-5, 700 * (1 - Math.hypot((e - cx) / 9000, (n - cy) / 14000)))));
  });
  await page.click(".tool-button:has-text('Library')");
  await page.fill(".library-search", "island");
  await page.click(".library-card:has-text('Island relief')");
  await page.waitForSelector(".relief-preview image");
  await page.selectOption("select[aria-label='Pattern']", "classic");
  await page.fill("input[aria-label='Frame']", "12");
  await page.press("input[aria-label='Frame']", "Enter");
  await page.waitForSelector("input[aria-label='Name on the frame']");
  await page.waitForFunction(() => !document.querySelector(".modal .primary-button")?.disabled);
  await page.click("button:has-text('Put on the bed')");
  list = await items();
  const island = list.filter((i) => i.name.startsWith("Isle of Arran"));
  const depthPic = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.kind === "picture" && i.name.startsWith("Isle of Arran")));
  expect(island.length === 7 && island.some((i) => i.name.endsWith("scale bar") && i.op === "score") && depthPic?.mode === "greys" && depthPic?.clip?.length === 1 && island.some((i) => i.name.endsWith("jigsaw cuts")), `an island relief: picture clipped to the coast, coast, jigsaw, frame, name (got ${island.map((i) => i.name)})`);
  await page.evaluate(() => window.juracutStore.getState().undo());
  await page.click(".tool-button:has-text('Library')");
  await page.fill(".library-search", "island");
  await page.click(".library-card:has-text('Island relief')");
  await page.click("button:has-text('Depth test strip')");
  list = await items();
  expect(list.filter((i) => i.name.startsWith("Depth test")).length === 8, "a depth test strip: squares, six labels and a cut line");
  await page.evaluate(() => window.juracutStore.getState().undo());
  list = await items();
  expect(list.length === 8, "the island and the strip undone");

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
  // Sent: the Export window closes by itself.
  await page.waitForSelector(".modal", { state: "detached" });
  await page.evaluate(() => window.fakeJuraCAD.channel.close());

  step = "resize and turn with the handles";
  await store(() => {
    const s = window.juracutStore.getState();
    s.addItems([{ id: "h1", name: "Handle test", op: "cut", kind: "rect", x: 100, y: 100, w: 40, h: 20, radius: 0, angle: 0 }], { select: true });
    s.setTool("select");
  });
  const rectOf = () => store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "h1"));
  // The top-right corner dragged 20 mm right and 10 up: 60 × 30, the bottom-left corner stays put.
  await drag([140, 120], [160, 130]);
  let r = await rectOf();
  expect(r.kind === "rect" && Math.abs(r.w - 60) < 0.01 && Math.abs(r.h - 30) < 0.01 && Math.abs(r.x - 100) < 0.01 && Math.abs(r.y - 100) < 0.01, `the corner handle made it 60 × 30 (got ${r.w} × ${r.h} at ${r.x}, ${r.y})`);
  // The right-hand edge with Shift: proportions kept, 90 × 45.
  const e1 = await bedPoint([160, 115]);
  const e2 = await bedPoint([190, 115]);
  await page.mouse.move(e1[0], e1[1]);
  await page.mouse.down();
  await page.keyboard.down("Shift");
  await page.mouse.move((e1[0] + e2[0]) / 2, e1[1]);
  await page.mouse.move(e2[0], e2[1]);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  r = await rectOf();
  expect(Math.abs(r.w - 90) < 0.01 && Math.abs(r.h - 45) < 0.01, `Shift kept the proportions (got ${r.w} × ${r.h})`);
  // One undo step per drag.
  await page.keyboard.press("Control+z");
  r = await rectOf();
  expect(Math.abs(r.w - 60) < 0.01, "undo took back one resize");
  // The turning handle: from above the middle round to the left = a quarter turn.
  const top = await bedPoint([130, 130]);
  const centre = await bedPoint([130, 115]);
  const above = [top[0], top[1] - 26];
  await page.mouse.move(above[0], above[1]);
  await page.mouse.down();
  await page.mouse.move(centre[0] - 40, centre[1] - 40);
  await page.mouse.move(centre[0] - 80, centre[1] + 1);
  await page.mouse.up();
  r = await rectOf();
  expect(r.kind === "rect" && Math.abs(Math.abs(r.angle) - 90) < 0.01, `the turning handle gave a quarter turn (got ${r.angle}°)`);

  step = "copy and paste, the right-click menu";
  const count = () => store(() => window.juracutStore.getState().history.present.items.length);
  const n0 = await count();
  await store(() => window.juracutStore.getState().select(["h1"]));
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  expect((await count()) === n0 + 1, "Ctrl+V pasted a copy");
  const pasted = await store(() => {
    const s = window.juracutStore.getState();
    return s.history.present.items.find((i) => i.id === s.selection[0]);
  });
  expect(pasted.id !== "h1" && pasted.name === "Handle test", "the copy is selected, with its own id");
  // Right-click on it: the menu, then Delete.
  const pc = await bedPoint([pasted.x + pasted.w / 2, pasted.y + pasted.h / 2]);
  await page.mouse.click(pc[0], pc[1], { button: "right" });
  await page.waitForSelector(".bed-menu");
  await page.click(".bed-menu button:has-text('Delete')");
  expect((await count()) === n0, "the menu's Delete took the copy away");
  expect(!(await page.$(".bed-menu")), "the menu closed");

  step = "select and hide by colour, zoom to selection";
  await store(() => window.juracutStore.getState().addItems([{ id: "sc1", name: "Fold", op: "score", kind: "line", x1: 20, y1: 150, x2: 80, y2: 150 }]));
  await page.click(".op-chip button[title='Select every score shape']");
  const scored = await store(() => {
    const s = window.juracutStore.getState();
    const all = s.history.present.items;
    return { picked: s.selection.length, all: all.filter((i) => i.op === "score" && !i.hidden).length, onlyScore: s.selection.every((id) => all.find((i) => i.id === id).op === "score") };
  });
  expect(scored.picked > 0 && scored.picked === scored.all && scored.onlyScore, "the chip selected every scored shape");
  const zoomBefore = await page.evaluate(() => document.querySelector(".bed-svg > g").getAttribute("transform"));
  await page.keyboard.press("Shift+F");
  await page.waitForTimeout(100);
  expect((await page.evaluate(() => document.querySelector(".bed-svg > g").getAttribute("transform"))) !== zoomBefore, "Shift+F zoomed to the selection");
  await page.keyboard.press("f");
  await page.click(".op-chip button[aria-label='Hide score shapes']");
  expect(await store(() => window.juracutStore.getState().history.present.items.filter((i) => i.op === "score").every((i) => i.hidden)), "the eye hid every scored shape");
  await page.click(".op-chip button[aria-label='Show score shapes']");
  expect(await store(() => window.juracutStore.getState().history.present.items.filter((i) => i.op === "score").every((i) => !i.hidden)), "and showed them again");
  await store(() => window.juracutStore.getState().clearSelection());

  step = "outline, combine, step and repeat, words round a circle";
  const shapesNow = () => store(() => window.juracutStore.getState().history.present.items);
  await store(() => {
    const s = window.juracutStore.getState();
    s.addItems([
      { id: "m1", name: "Plate", op: "cut", kind: "rect", x: 300, y: 20, w: 60, h: 40, radius: 0, angle: 0 },
      { id: "m2", name: "Hole", op: "cut", kind: "circle", cx: 330, cy: 40, r: 8 },
    ]);
    s.select(["m1", "m2"]);
  });
  // Combine › Cut out: one shape, the hole in it.
  await page.click(".make-more button:has-text('Cut out')");
  let all = await shapesNow();
  const cut = all.find((i) => i.name === "Cut-out shape");
  expect(cut && cut.kind === "shape" && cut.outlines.length === 2 && !all.some((i) => i.id === "m1" || i.id === "m2"), "the circle was cut out of the plate");
  // An outline 3 mm out: a new cut shape round it, 66 × 46.
  await page.click(".make-more button:has-text('Add outline')");
  all = await shapesNow();
  const outline = all.find((i) => i.name === "Outline");
  const ob = await store(() => {
    const s = window.juracutStore.getState();
    const it = s.history.present.items.find((i) => i.name === "Outline");
    let x0 = Infinity, x1 = -Infinity;
    for (const o of it.outlines) for (const g of o.segments) for (const p of [g.from, g.to]) if (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
    return x1 - x0;
  });
  expect(outline && Math.abs(ob - 66) < 0.05, `the outline is 3 mm out (${ob} across)`);
  // Step and repeat: 3 × 2 of the outline = 5 copies.
  const before5 = all.length;
  await page.click(".make-more button:has-text('Make 5 copies')");
  expect((await shapesNow()).length === before5 + 5, "step and repeat made 5 copies");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  expect((await shapesNow()).some((i) => i.id === "m1"), "undo put the plate and hole back");
  await store(() => {
    const s = window.juracutStore.getState();
    s.select(["m1", "m2"]);
    s.deleteSelected();
  });
  // Words bent over the top of a circle.
  await store(() => {
    const s = window.juracutStore.getState();
    s.addItems([{ id: "cw", name: "Round", op: "engrave", kind: "text", text: "ROUND WE GO", x: 400, y: 150, size: 6, font: "inter-bold", align: "left", angle: 0 }], { select: true });
  });
  await page.click("[aria-label='Round a circle'] button:has-text('Over the top')");
  const bent = (await shapesNow()).find((i) => i.id === "cw");
  expect(bent.curve > 0 && bent.align === "centre", "the words are bent over the top of a circle");
  await store(() => window.juracutStore.getState().deleteSelected());

  step = "polygon and star, break apart, round repeat, the toolbar fits";
  expect(await page.evaluate(() => {
    const t = document.querySelector(".toolbar");
    return t.scrollWidth <= t.clientWidth + 1;
  }), "every toolbar button fits at 1280 px");
  await store(() => window.juracutStore.getState().clearSelection());
  await page.keyboard.press("p");
  await drag([450, 150], [450, 170]);
  let poly = await store(() => {
    const s = window.juracutStore.getState();
    return s.history.present.items.find((i) => i.id === s.selection[0]);
  });
  expect(poly && poly.kind === "polygon" && Math.abs(poly.r - 20) < 0.01 && poly.angle === 90, "the Polygon tool drew one 40 mm across, a corner at the top");
  await page.click("[aria-label='Polygon or star'] button:has-text('Star')");
  await page.keyboard.press("v");
  poly = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.kind === "polygon"));
  expect(poly.star > 0, "it's a star now");
  await page.click("[aria-label='Copies in a grid or round a circle'] button:has-text('Round a circle')");
  const n15 = (await shapesNow()).length;
  await page.click(".make-more button:has-text('copies round a circle')");
  expect((await shapesNow()).length === n15 + 7, "8 round a circle = 7 copies");
  await page.keyboard.press("Control+z");
  await page.click("[aria-label='Copies in a grid or round a circle'] button:has-text('In a grid')");
  await store(() => {
    const s = window.juracutStore.getState();
    s.addItems([{ id: "ba", name: "Letters", op: "engrave", kind: "text", text: "OK", x: 450, y: 60, size: 10, font: "inter-bold", align: "left", angle: 0 }], { select: true });
  });
  await page.click(".make-more button:has-text('Break apart')");
  const letters = await store(() => window.juracutStore.getState().history.present.items.filter((i) => i.name.startsWith("Letters ")));
  expect(letters.length === 2 && letters.every((i) => i.kind === "shape"), "the words broke apart into two letters");
  await store(() => {
    const s = window.juracutStore.getState();
    s.select(s.history.present.items.filter((i) => i.name.startsWith("Letters ") || i.kind === "polygon").map((i) => i.id));
    s.deleteSelected();
  });

  step = "holding tabs and copies with different words";
  await store(() => {
    const s = window.juracutStore.getState();
    s.addItems([
      { id: "nt", name: "Tag", op: "cut", kind: "rect", x: 400, y: 200, w: 50, h: 20, radius: 3, angle: 0 },
      { id: "nw", name: "Name", op: "engrave", kind: "text", text: "Name", x: 425, y: 207, size: 6, font: "inter-bold", align: "centre", angle: 0 },
    ]);
    s.select(["nt", "nw"]);
  });
  await page.fill("label:has-text('Tabs on each outline') input", "3");
  await page.keyboard.press("Enter");
  expect(await store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "nt").tabs === 3), "the tag has 3 holding tabs");
  await page.fill("textarea[aria-label='Names, one per line']", "Amy\nBen\nCharlotte");
  const before16 = (await shapesNow()).length;
  await page.click(".make-more button:has-text('Make 2 named copies')");
  all = await shapesNow();
  expect(all.length === before16 + 4, "two more tags, each with its name");
  expect(["Amy", "Ben", "Charlotte"].every((n) => all.some((i) => i.kind === "text" && i.text === n)), "each name is on a tag");
  expect(all.filter((i) => i.name === "Tag").every((i) => i.tabs === 3), "the copies keep their tabs");
  await store(() => {
    const s = window.juracutStore.getState();
    s.select(s.history.present.items.filter((i) => i.name === "Tag" || i.name === "Name").map((i) => i.id));
    s.deleteSelected();
  });

  step = "a QR code: placed with its tool, typed in, exported and drawn right";
  await store(() => {
    const s = window.juracutStore.getState();
    s.clearSelection();
  });
  await page.keyboard.press("q");
  const qp = await bedPoint([500, 180]);
  await page.mouse.click(qp[0], qp[1]);
  await page.fill("textarea[aria-label='What the QR code holds']", "https://gm7dha.github.io/JuraCUT/");
  const qr = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.kind === "qr"));
  expect(qr && qr.text === "https://gm7dha.github.io/JuraCUT/" && qr.op === "engrave", "the QR code holds the address typed");
  expect((await page.textContent(".properties")).includes("29 × 29 squares"), "the panel says how many squares");
  // Exported alone and drawn on a canvas: dark in the middle of each of its three corner squares, light in their rings.
  const hid = await store(() => {
    const s = window.juracutStore.getState();
    const ids = s.history.present.items.filter((i) => i.kind !== "qr" && !i.hidden).map((i) => i.id);
    for (const id of ids) s.updateItem(id, (it) => ({ ...it, hidden: true }));
    return ids;
  });
  await page.click(".primary-button:has-text('Export for laser')");
  await page.waitForSelector(".export-preview svg");
  const [qrDl] = await Promise.all([page.waitForEvent("download"), page.click(".modal button:has-text('Save SVG')")]);
  const qrText = await readFile(await qrDl.path(), "utf8");
  await page.keyboard.press("Escape");
  const finders = await page.evaluate(async (svg) => {
    const img = new Image();
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = 290;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 290, 290);
    g.drawImage(img, 0, 0, 290, 290);
    // 29 squares of 10 px: each corner square's middle (3.5 squares in) and its light ring (1.5 squares in).
    const dark = (x, y) => g.getImageData(x, y, 1, 1).data[0] < 128;
    const at = (sx, sy) => [dark(sx * 10 + 35, sy * 10 + 35), !dark(sx * 10 + 15, sy * 10 + 15)];
    return [at(0, 0), at(22, 0), at(0, 22)];
  }, qrText);
  expect(finders.every(([d, l]) => d && l), `the exported code has its three corner squares (${JSON.stringify(finders)})`);
  await page.evaluate((ids) => {
    const s = window.juracutStore.getState();
    for (const id of ids) s.updateItem(id, (it) => ({ ...it, hidden: false }));
    s.select(s.history.present.items.filter((i) => i.kind === "qr").map((i) => i.id));
    s.deleteSelected();
  }, hid);

  step = "editing points: double-click, drag a corner, add and take out points";
  await store(() => {
    const s = window.juracutStore.getState();
    s.clearSelection();
    s.setTool("select");
    s.addItems([{ id: "ep", name: "Reshape", op: "cut", kind: "rect", x: 300, y: 200, w: 40, h: 30, radius: 0, angle: 0 }]);
  });
  const epMid = await bedPoint([300, 215]);
  await page.mouse.dblclick(epMid[0], epMid[1]);
  let ep = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "ep"));
  expect(ep.kind === "shape" && (await store(() => window.juracutStore.getState().pointsOf)) === "ep", "a double-click starts editing its points");
  await page.keyboard.down("Shift");
  await drag([340, 230], [350, 240]);
  await page.keyboard.up("Shift");
  ep = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "ep"));
  expect(ep.outlines[0].segments.some((g) => Math.abs(g.from[0] - 350) < 0.2 && Math.abs(g.from[1] - 240) < 0.2), "the top-right corner was dragged out");
  // A point added half-way along the bottom, then taken out with Delete.
  const bottom = await bedPoint([320, 200]);
  await page.mouse.dblclick(bottom[0], bottom[1]);
  ep = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "ep"));
  expect(ep.outlines[0].segments.length === 5, "a double-click on a line added a point");
  await page.keyboard.press("Delete");
  ep = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "ep"));
  expect(ep && ep.outlines[0].segments.length === 4, "Delete took the point out, not the shape");
  await page.keyboard.press("Escape");
  expect((await store(() => window.juracutStore.getState().pointsOf)) === null, "Esc finished editing");
  await store(() => {
    const s = window.juracutStore.getState();
    s.select(["ep"]);
    s.deleteSelected();
  });

  step = "snapping to corners, locking, measuring";
  await store(() => {
    const s = window.juracutStore.getState();
    // A fresh design, so nothing left from earlier steps is near enough to snap to.
    s.newDocument();
    s.setTool("select");
    s.addItems([
      { id: "sa", name: "Base", op: "cut", kind: "rect", x: 500, y: 200, w: 40, h: 40, radius: 0, angle: 0 },
      { id: "sb", name: "Mover", op: "cut", kind: "rect", x: 560, y: 200, w: 20, h: 20, radius: 0, angle: 0 },
    ], { select: false });
  });
  // Drag the small square's bottom-left corner near the big one's top-right: it lands exactly on it.
  await drag([565, 205], [545.6, 244.6]);
  const mover = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "sb"));
  expect(Math.abs(mover.x - 540) < 1e-9 && Math.abs(mover.y - 240) < 1e-9, `the corner snapped onto the other's corner (at ${mover.x}, ${mover.y})`);
  // Locked: a click on it picks nothing, and a drag doesn't move it.
  await store(() => window.juracutStore.getState().updateItem("sa", (it) => ({ ...it, locked: true })));
  await store(() => window.juracutStore.getState().clearSelection());
  await drag([510, 210], [530, 220]);
  const base = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "sa"));
  expect(base.x === 500 && base.y === 200, "the locked shape didn't move");
  // Measure corner to corner across the 40 × 40 square: 56.6 mm at 45°.
  await page.keyboard.press("m");
  await drag([500.3, 200.2], [539.8, 239.7]);
  const said = await page.textContent(".bed-readout");
  expect(said.includes("56.6 mm (across 40, up 40) at 45°"), `the measurement says 56.6 mm at 45° (${said})`);
  await page.keyboard.press("v");
  await store(() => {
    const s = window.juracutStore.getState();
    s.updateItem("sa", (it) => ({ ...it, locked: false }));
    s.select(["sa", "sb"]);
    s.deleteSelected();
  });

  step = "a script font joins its letters";
  await store(() => {
    const s = window.juracutStore.getState();
    s.newDocument();
    s.addItems([{ id: "sw", name: "Words", op: "engrave", kind: "text", text: "Wedding", x: 50, y: 150, size: 20, font: "inter-regular", align: "left", angle: 0 }]);
  });
  await page.selectOption(".properties select:near(:text('Font'))", "great-vibes");
  const sw = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "sw"));
  expect(sw.font === "great-vibes" && sw.weld === true, "picking a script font joins its letters");
  expect(await page.isChecked(".properties label:has-text('Join the letters') input"), "the Join box is ticked");

  step = "words along a circle, a round photo with a cut line round it";
  await store(() => {
    const s = window.juracutStore.getState();
    s.newDocument();
    s.addItems([
      { id: "pc", name: "Ring", op: "score", kind: "circle", cx: 150, cy: 150, r: 40 },
      { id: "pt", name: "Words", op: "engrave", kind: "text", text: "ROUND THE TOP", x: 10, y: 10, size: 6, font: "inter-bold", align: "left", angle: 0 },
    ]);
    s.select(["pc", "pt"]);
  });
  await page.click(".make-more button:has-text('Put the words along the shape')");
  const onPath = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "pt"));
  expect(onPath.path && onPath.align === "centre", "the words follow the circle");
  expect((await page.textContent(".properties")).includes("Along a path"), "the panel shows the path settings");
  await page.evaluate((src) => {
    const s = window.juracutStore.getState();
    s.addItems([{ id: "pp", name: "Photo", op: "engrave", kind: "picture", src, cx: 300, cy: 150, w: 60, h: 60, turns: 0, flip: false, mode: "dots", brightness: 0, contrast: 0, invert: false, dpm: 10 }]);
  }, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAADqUlEQVR4nJXX4WfUARzH8R+NRqOjo9FoNBodjY5Go9Ho6Gg0Go1Go9FoNDoaOxodHR0dHY1Go6PR0ehodDQ6OjoaHR2NjkZHR6Ojo/6C14N9Hr+fvB59fYN/WH9//8DAwODgYCQSGRoaikajw8PDIyMj6qenp2dmZmZnZ+fm5ubn5xcWFhKJxOLiovrV1dW1tbV8Pr++vl4oFDY2NorF4ubmpvqdnZ1Go7G7u9tsNlut1t7eXrvd7nQ6wV9MAPUCqBdAPQF/MAHUC6BeAPUE/MYEUC+AegHUE/ALE0C9AOoFUE/AT0wA9QKoF0A9AT8wAdQLoF4A9QR8xwRQL4B6AdQTEARBV1dXd3d3T09PKBQKh8O9vb19fX3fsNHR0bGxsVgsFo/Hx8fHJyYmJicnp6am1CeTyeXl5VQqlU6nM5lMNpvN5XIrKyvqS6XS1tZWuVyuVCrVanV7e7tWq9XrdfUEfMUEUC+AegHUE/AFE0C9AOoFUE/AZ0wA9QKoF0A9AZ8wAdQLoF4A9QR8xARQL4B6AdQT8AETQL0A6gVQT8B7TAD1AqgXQH3wDtMhU69Dpl6HTD0P2VtMAPUCqBdAPQFvMAHUC6BeAPUEvMYEUC+AegHUE/AKE0C9AOoFUE/AS0wA9QKoF0A9AS8wAdQLoF4A9QQ8xwRQL4B6AdTv+x94humQqdchU69Dpp6Ap5gA6gVQL4B6Ap5gAqgXQL0A6gl4jAmgXgD1Aqgn4BEmgHoB1AugnoCHmADqBVAvgHoCHmACqBdAvQDqCbiPCaBeAPUCqA+WMB0y9Tpk6nXI1POQ3cMEUC+AegHUE3AXE0C9AOoFUE/AHUwA9QKoF0A9AbcxAdQLoF4A9QTcwgRQL4B6AdQTcBMTQL0A6gVQT8ANTAD1AqgXQP2+/4HrmA6Zeh0y9Tpk6gm4hgmgXgD1Aqgn4ComgHoB1AugnoArmADqBVAvgHoCLmMCqBdAvQDqCbiECaBeAPUCqCfgIiaAegHUC6CegAuYAOoFUC+A+uA8pkOmXodMvQ6Zeh6yc5gA6gVQL4B6As5iAqgXQL0A6gk4gwmgXgD1Aqgn4DQmgHoB1AugnoBTmADqBVAvgHoCTmICqBdAvQDqCTiBCaBeAPUCqN/3P3Ac0yFTr0OmXodMPQHHMAHUC6BeAPUEHMUEUC+AegHUE3AEE0C9AOoFUE/AYUwA9QKoF0A9AYcwAdQLoF4A9QQcxARQL4B6AdQTcAATQL0A6gVQ/x/jKulaiHLPtQAAAABJRU5ErkJggg==");
  await page.click("[aria-label=\"Photo's shape\"] button:text-is('Round')");
  await page.fill(".properties label:has-text('Left') input", "10");
  await page.keyboard.press("Enter");
  const roundPhoto = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.id === "pp"));
  expect(roundPhoto.mask === "round" && Math.abs(roundPhoto.crop[0] - 0.1) < 1e-9 && Math.abs(roundPhoto.w - 54) < 1e-6, `the photo is round and cropped, keeping its scale (${roundPhoto.w} mm)`);
  await page.click(".properties button:has-text('Add a cut line round it')");
  const edge = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.name === "Photo's edge"));
  expect(edge && edge.op === "cut", "a cut line goes round the photo");

  step = "the Oval tool, and names from a spreadsheet";
  await store(() => {
    const s = window.juracutStore.getState();
    s.newDocument();
    s.setTool("select");
  });
  await page.keyboard.press("e");
  await page.keyboard.down("Shift");
  await drag([100, 100], [160, 130]);
  await page.keyboard.up("Shift");
  const oval = await store(() => window.juracutStore.getState().history.present.items.find((i) => i.kind === "ellipse"));
  expect(oval && Math.abs(oval.rx - 30) < 0.2 && Math.abs(oval.ry - 15) < 0.2, "the Oval tool drew a 60 × 30 oval");
  await page.keyboard.press("v");
  await store(() => {
    const s = window.juracutStore.getState();
    s.addItems([{ id: "cw", name: "Card", op: "engrave", kind: "text", text: "{Name} - table {Table}", x: 200, y: 200, size: 5, font: "inter-regular", align: "left", angle: 0 }]);
  });
  await page.fill("textarea[aria-label='Names, one per line']", "Name,Table\nAmy,3\nBen,5\nCara,7");
  expect((await page.textContent(".make-more")).includes("{Name} {Table}"), "the panel lists the spreadsheet's columns");
  await page.click(".make-more button:has-text('Make 2 named copies')");
  const cards = await store(() => window.juracutStore.getState().history.present.items.filter((i) => i.kind === "text").map((i) => i.text));
  expect(["Amy - table 3", "Ben - table 5", "Cara - table 7"].every((t) => cards.includes(t)), `each card has its row (${cards.join(" / ")})`);

  step = "trimming where lines cross";
  await store(() => {
    const s = window.juracutStore.getState();
    s.newDocument();
    s.addItems(
      [
        { id: "ta", name: "Left", op: "cut", kind: "circle", cx: 200, cy: 150, r: 20 },
        { id: "tb", name: "Right", op: "cut", kind: "circle", cx: 220, cy: 150, r: 20 },
      ],
      { select: false },
    );
  });
  await page.keyboard.press("x");
  // Click the left circle's arc inside the right one, then the right circle's arc inside the left: a figure of 8 → one outline.
  const inA = await bedPoint([220, 150]);
  await page.mouse.click(inA[0], inA[1]);
  const inB = await bedPoint([200, 150]);
  await page.mouse.click(inB[0], inB[1]);
  const two = await store(() => window.juracutStore.getState().history.present.items.map((i) => ({ kind: i.kind, n: i.outlines ? i.outlines.length : 0 })));
  expect(two.length === 2 && two.every((i) => i.kind === "shape" && i.n === 1), `both circles were trimmed (${JSON.stringify(two)})`);
  await page.keyboard.press("Control+z");
  expect((await store(() => window.juracutStore.getState().history.present.items.filter((i) => i.kind === "circle").length)) === 1, "undo puts one trim back");
  await page.keyboard.press("v");

  step = "the cut order, and a photo masked by a star";
  await page.evaluate((src) => {
    const s = window.juracutStore.getState();
    s.newDocument();
    s.addItems([
      { id: "op", name: "Plate", op: "cut", kind: "rect", x: 20, y: 20, w: 60, h: 40, radius: 0, angle: 0 },
      { id: "oh", name: "Hole", op: "cut", kind: "circle", cx: 50, cy: 40, r: 8 },
      { id: "mp", name: "Photo", op: "engrave", kind: "picture", src, cx: 150, cy: 150, w: 60, h: 60, turns: 0, flip: false, mode: "dots", brightness: 0, contrast: 0, invert: false, dpm: 10 },
      { id: "ms", name: "Star", op: "cut", kind: "polygon", cx: 150, cy: 150, r: 28, sides: 5, angle: 90, star: 0.5 },
    ], { select: false });
    s.select(["mp", "ms"]);
  }, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAADqUlEQVR4nJXX4WfUARzH8R+NRqOjo9FoNBodjY5Go9Ho6Gg0Go1Go9FoNDoaOxodHR0dHY1Go6PR0ehodDQ6OjoaHR2NjkZHR6Ojo/6C14N9Hr+fvB59fYN/WH9//8DAwODgYCQSGRoaikajw8PDIyMj6qenp2dmZmZnZ+fm5ubn5xcWFhKJxOLiovrV1dW1tbV8Pr++vl4oFDY2NorF4ubmpvqdnZ1Go7G7u9tsNlut1t7eXrvd7nQ6wV9MAPUCqBdAPQF/MAHUC6BeAPUE/MYEUC+AegHUE/ALE0C9AOoFUE/AT0wA9QKoF0A9AT8wAdQLoF4A9QR8xwRQL4B6AdQTEARBV1dXd3d3T09PKBQKh8O9vb19fX3fsNHR0bGxsVgsFo/Hx8fHJyYmJicnp6am1CeTyeXl5VQqlU6nM5lMNpvN5XIrKyvqS6XS1tZWuVyuVCrVanV7e7tWq9XrdfUEfMUEUC+AegHUE/AFE0C9AOoFUE/AZ0wA9QKoF0A9AZ8wAdQLoF4A9QR8xARQL4B6AdQT8AETQL0A6gVQT8B7TAD1AqgXQH3wDtMhU69Dpl6HTD0P2VtMAPUCqBdAPQFvMAHUC6BeAPUEvMYEUC+AegHUE/AKE0C9AOoFUE/AS0wA9QKoF0A9AS8wAdQLoF4A9QQ8xwRQL4B6AdTv+x94humQqdchU69Dpp6Ap5gA6gVQL4B6Ap5gAqgXQL0A6gl4jAmgXgD1Aqgn4BEmgHoB1AugnoCHmADqBVAvgHoCHmACqBdAvQDqCbiPCaBeAPUCqA+WMB0y9Tpk6nXI1POQ3cMEUC+AegHUE3AXE0C9AOoFUE/AHUwA9QKoF0A9AbcxAdQLoF4A9QTcwgRQL4B6AdQTcBMTQL0A6gVQT8ANTAD1AqgXQP2+/4HrmA6Zeh0y9Tpk6gm4hgmgXgD1Aqgn4ComgHoB1AugnoArmADqBVAvgHoCLmMCqBdAvQDqCbiECaBeAPUCqCfgIiaAegHUC6CegAuYAOoFUC+A+uA8pkOmXodMvQ6Zeh6yc5gA6gVQL4B6As5iAqgXQL0A6gk4gwmgXgD1Aqgn4DQmgHoB1AugnoBTmADqBVAvgHoCTmICqBdAvQDqCTiBCaBeAPUCqN/3P3Ac0yFTr0OmXodMPQHHMAHUC6BeAPUEHMUEUC+AegHUE3AEE0C9AOoFUE/AYUwA9QKoF0A9AYcwAdQLoF4A9QQcxARQL4B6AdQTcAATQL0A6gVQ/x/jKulaiHLPtQAAAABJRU5ErkJggg==");
  await page.click(".make-more button:has-text('Engrave the photo only inside the shape')");
  expect(await store(() => !!window.juracutStore.getState().history.present.items.find((i) => i.id === "mp").clip), "the photo has the star as its mask");
  await store(() => window.juracutStore.getState().clearSelection());
  await page.click(".primary-button:has-text('Export for laser')");
  await page.waitForSelector(".export-preview svg");
  await page.click("button:has-text('Show the cut order')");
  await page.waitForSelector(".cut-order-svg");
  await page.fill(".cut-order-controls input", "0.5");
  const said16 = await page.textContent(".cut-order");
  expect(said16.includes("Step 1 of 3: a hole"), `the first step is the hole (${said16})`);
  await page.keyboard.press("Escape");

  step = "butted pieces' shared edge cut once";
  await store(() => {
    const s = window.juracutStore.getState();
    s.newDocument();
    // No kerf: with it, the two edges move apart and aren't on top of each other any more.
    s.setMaterial({ ...s.history.present.material, kerf: 0 });
    s.addItems([
      { id: "ba", name: "A", op: "cut", kind: "rect", x: 20, y: 20, w: 30, h: 30, radius: 0, angle: 0 },
      { id: "bb", name: "B", op: "cut", kind: "rect", x: 50, y: 20, w: 30, h: 30, radius: 0, angle: 0 },
    ], { select: false });
  });
  await page.click(".primary-button:has-text('Export for laser')");
  await page.waitForSelector(".export-preview svg");
  expect((await page.textContent(".modal")).includes("(30 mm doubled)"), "Export finds the 30 mm edge the squares share");
  const [onceDl] = await Promise.all([page.waitForEvent("download"), page.click(".modal button:has-text('Save SVG')")]);
  const onceText = await readFile(await onceDl.path(), "utf8");
  expect((onceText.match(/<path/g) ?? []).length >= 2, "both squares are in the file");
  await page.keyboard.press("Escape");

  step = "recent designs, and a test card from Materials";
  await store(() => {
    const s = window.juracutStore.getState();
    s.newDocument();
    s.renameDocument("Remember me");
    s.addItems([{ id: "rm", name: "Square", op: "cut", kind: "rect", x: 20, y: 20, w: 30, h: 30, radius: 0, angle: 0 }]);
  });
  page.once("dialog", (d) => d.accept());
  await page.click(".topbar button:has-text('New')");
  await page.waitForFunction(() => window.juracutStore.getState().history.present.items.length === 0);
  await page.click(".recent-button");
  await page.waitForSelector(".recent-list li:has-text('Remember me')");
  await page.click(".recent-open:has-text('Remember me')");
  await page.waitForFunction(() => window.juracutStore.getState().history.present.name === "Remember me");
  expect(await store(() => window.juracutStore.getState().history.present.items.length === 1), "the earlier design came back from Recent");
  await page.click(".settings-button");
  await page.click(".settings-menu button:has-text('Materials')");
  await page.waitForSelector(".materials-table");
  await page.click(".modal button:has-text('Kerf and fit test card')");
  const card = await store(() => window.juracutStore.getState().history.present.items.filter((i) => i.name === "Fit test comb" || i.name === "Kerf test cut").length);
  expect(card === 10, `the test card is on the bed (${card})`);

  step = "tidying a drawing, and the history list";
  await store(() => {
    const s = window.juracutStore.getState();
    s.newDocument();
    const l = (a, b) => ({ segments: [{ kind: "line", from: a, to: b }], closed: false });
    s.addItems([{ id: "gap", name: "Gappy square", op: "cut", kind: "shape", outlines: [l([20, 20], [60, 20]), l([60.1, 20.05], [60, 60]), l([60, 60], [20.05, 60]), l([20, 59.9], [20, 20.1])] }]);
  });
  await page.click(".make-more button:text-is('Tidy up')");
  const tidy = await store(() => window.juracutStore.getState().history.present.items[0]);
  expect(tidy.outlines.length === 1 && tidy.outlines[0].closed, "Tidy up closed the square's gaps");
  await page.click(".history-button");
  await page.waitForSelector(".history-list li.current");
  await page.click(".history-step:has-text('Added \"Gappy square\"')");
  const back = await store(() => window.juracutStore.getState().history);
  expect(back.present.items[0].outlines.length === 4 && back.future.length === 1, "the history list went back one step");
  await page.keyboard.press("Control+y");

  step = "rounding corners and hatch fill";
  await store(() => {
    const s = window.juracutStore.getState();
    s.newDocument();
    s.addItems([{ id: "tri", name: "Triangle", op: "cut", kind: "polygon", cx: 60, cy: 60, r: 30, sides: 3, angle: 90 }]);
  });
  await page.click(".make-more button:text-is('Round corners')");
  const roundTri = await store(() => window.juracutStore.getState().history.present.items[0]);
  expect(roundTri.kind === "shape" && roundTri.outlines[0].segments.filter((g) => g.kind === "arc").length === 3, "the triangle's three corners were rounded");
  await page.click(".make-more button:text-is('Fill with lines')");
  const hatched = await store(() => window.juracutStore.getState().history.present.items);
  expect(hatched.length === 2 && hatched[1].op === "score" && hatched[1].outlines.length > 20, `the triangle was filled with scored lines (${hatched[1]?.outlines?.length})`);

  step = "guide lines from the rulers, and copies along a path";
  await store(() => {
    const s = window.juracutStore.getState();
    s.newDocument();
    s.requestFit("bed");
  });
  // Let the view settle before working out where the bed is on screen.
  await page.waitForFunction(() => {
    const t = document.querySelector(".bed-svg > g")?.getAttribute("transform") ?? "";
    const was = window.__lastBedTransform;
    window.__lastBedTransform = t;
    return t && t === was;
  }, null, { polling: 150 });
  const svgBox = await page.evaluate(() => {
    const r = document.querySelector(".bed-svg").getBoundingClientRect();
    return [r.left, r.top];
  });
  const g100 = await bedPoint([520, 100]);
  const underRuler = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}.${el.getAttribute("class") ?? ""}` : "nothing";
  }, [g100[0], svgBox[1] + 10]);
  await page.mouse.move(g100[0], svgBox[1] + 10);
  await page.mouse.down();
  await page.mouse.move(g100[0], (svgBox[1] + g100[1]) / 2, { steps: 4 });
  await page.mouse.move(g100[0], g100[1], { steps: 4 });
  const during = await page.evaluate(() => document.querySelector(".bed-readout")?.textContent ?? "");
  await page.mouse.up();
  const guideY = await store(() => window.juracutStore.getState().history.present.guides?.ys ?? []);
  expect(guideY.length === 1 && Math.abs(guideY[0] - 100) <= 1, `a level guide pulled out of the top ruler at y = 100 (${guideY}; under the pointer: ${underRuler}; readout: ${during}; at ${g100.map(Math.round)}, bed top ${svgBox.map(Math.round)})`);
  await drag([520, 100], [520, 120]);
  const moved = await store(() => window.juracutStore.getState().history.present.guides?.ys ?? []);
  expect(moved.length === 1 && Math.abs(moved[0] - 120) <= 1, `the guide was moved to y = 120 (${moved})`);
  const g120 = await bedPoint([520, 120]);
  await page.mouse.move(g120[0], g120[1]);
  await page.mouse.down();
  await page.mouse.move(g120[0], (svgBox[1] + g120[1]) / 2);
  await page.mouse.move(g120[0], svgBox[1] + 8);
  await page.mouse.up();
  expect(!(await store(() => window.juracutStore.getState().history.present.guides)), "the guide dropped on the ruler went");
  await store(() => {
    const s = window.juracutStore.getState();
    s.addItems([{ id: "dot", name: "Dot", op: "cut", kind: "circle", cx: 20, cy: 20, r: 3 }, { id: "big", name: "Big circle", op: "score", kind: "circle", cx: 150, cy: 150, r: 80 }]);
  });
  await page.click(".make-more button:text-is('Copy along the path')");
  const along = await store(() => window.juracutStore.getState().history.present.items.length);
  expect(along === 10, `8 copies made along the big circle (${along} shapes)`);

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
  // The Help screen's surprise (as JuraCAD's): the Windows / Mac buttons clicked 10 times within 5 seconds.
  {
    const win = page.getByRole("radio", { name: "Windows" });
    for (let i = 0; i < 10; i++) await win.click();
    await page.locator(".easter-egg img").waitFor({ timeout: 5_000 });
    // The picture itself arrives (it isn't just an empty frame).
    await page.waitForFunction(() => {
      const img = document.querySelector(".easter-egg img");
      return img && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 10_000 });
    await page.locator(".easter-egg").click();
    await page.locator(".easter-egg").waitFor({ state: "detached", timeout: 5_000 });
  }
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
