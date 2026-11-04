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
  await page.click(".tool-button:has-text('Arrange')");

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

  step = "undo, dark mode, help";
  await page.keyboard.press("Control+z");
  const after = await store(() => window.juracutStore.getState().history.present.items.length);
  expect(after === 0, "undo brought back the empty design");
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
