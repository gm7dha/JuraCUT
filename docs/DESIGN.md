# JuraCUT — Design

JuraCUT is a free, open-source, browser-based **design-and-cut program for a desktop laser** — the owner's Bambu Lab
R1 (55 W CO2, 600 × 300 mm bed) driven from Bambu Studio's laser mode. It is the sister program of
[JuraCAD](https://github.com/gm7dha/JuraCAD): the same stack, look, install flow and ways of working, with JuraCAD's
laser export code at its heart, so files from either program look the same to Bambu Studio.

**Who it's for:** a hobbyist making real things — signs, tags, boxes, stencils, engraved plates — who wants to draw or
bring in a design, say what the laser does with each part of it, lay the pieces out on the bed and send a file to
Bambu Studio. Every trade-off favours simplicity over professional CAM depth.

## Goals

- Draw simple shapes and words, and bring in SVG/DXF drawings from JuraCAD, Inkscape and others, at true size.
- For every shape: cut, score or engrave. Holes are found automatically and cut before the outline round them.
- Lay pieces out on the bed, by hand or automatically.
- Export an SVG (and DXF) that Bambu Studio's laser mode opens at true size with each colour as a layer.
- Bambu Studio is the reference for features. Sending jobs over WiFi / Bambu Cloud is optional; exporting a file to
  Bambu Studio is always fine.

**Not goals (for now):** driving the laser directly; raster photo processing beyond black-and-white; real-time
collaboration or cloud storage.

## Key decisions

| Area | Decision | Why |
| --- | --- | --- |
| Language and build | TypeScript, Vite | As JuraCAD; widely used |
| UI | React + Zustand | As JuraCAD |
| The bed | An SVG with a y-up group | Exact curves straight from the model, crisp at any zoom, no WebGL |
| Geometry | JuraCAD's laser code (`src/geometry/segments.ts`), curves kept exact | One set of rules for both programs |
| Fonts | Outline data made from OFL fonts, shipped in the app | Letters as real curves; works offline; no three.js |
| Importers | Own XML/SVG and DXF readers, pure TypeScript | Testable without a browser; no big dependencies |
| Units | Millimetres, y up, origin at the bed's front-left corner | The same as the exported files |
| Files | `.juracut` JSON, read carefully with fallbacks | Hand-editable, never breaks the app |
| Delivery | PWA on GitHub Pages | Installs on Windows and macOS, offline, free |
| Licence | MIT; fonts under the OFL | Simple |

## Architecture

```
src/geometry   segments.ts (curves, loops, holes, layout), text.ts + fonts/, svgImport.ts, dxfImport.ts
src/model      types.ts, shapes.ts (items → outlines, edits, hit tests), document.ts, keep.ts, importFile.ts, store.ts
src/laser      sheet.ts (design → laser paths and sheet), files.ts (SVG and DXF writers)
src/app        React: TopBar, Toolbar, SidePanel, BedView, ExportDialog, HelpDialog, WhatsNewDialog, App
tests          Vitest, pure code only;  scripts/smoke-test.mjs drives the built app in headless Chromium
```

Everything outside `src/app` is pure and tested. The app keeps the design in the browser as you work and in
`.juracut` files when you Save.

## Roadmap

- **v0.1 (done)** — the bed, drawing tools, words, SVG/DXF import, cut/score/engrave, arrange, export for laser,
  save/open, install, light/dark.
- **v0.2 (done)** — kerf compensation, a material library with notes, rulers, snapping to other shapes.
- **v0.3** — grouping and multi-shape editing in the panel, align and distribute, image tracing (a photo or scan to outlines or a black-and-white engraving), nesting that packs pieces
  more tightly, a library of ready designs (boxes with finger joints, tags, stencils, coasters…) like JuraCAD's.
- **Later** — a link to JuraCAD (send a flat design across and back), a Claude connection like JuraCAD's (an MCP
  extension with Live editing), the R1's camera as a bed background to line jobs up on material, Bambu material QR
  codes, sending jobs to the laser, rotary attachment helpers, a living hinge and box generator.
