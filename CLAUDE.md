# Notes for Claude working on JuraCUT

- The owner is a hobbyist with no coding background who directs the work. Explain changes in plain English
  in pull requests, and keep the app's wording friendly and jargon-free.
- The owner has said to merge PRs without asking once CI passes (squash merge), then tell them what changed so
  they can try it on the live site.
- JuraCUT is the sister app of JuraCAD (github.com/gm7dha/JuraCAD): the same stack, look, install flow and ways of
  working. When something exists in JuraCAD (a dialog, a helper, a test pattern), copy how it's done there.
  Design and roadmap: `docs/DESIGN.md`. The look follows JuraCAD, which follows Onshape.
- Stack: TypeScript, React 18, Vite 5, Zustand 5. No geometry kernel: everything is 2D maths of its own.
- Coordinates: millimetres on the bed, x right, y up, (0, 0) the bed's front-left corner — the same way round as the
  files JuraCUT writes. The bed view (`src/app/BedView.tsx`, an SVG) flips y in one `<g>` so paths are written in
  bed millimetres as they are (`svgPathData(path, null)`); files flip y with the sheet height (`svgPathData(path, H)`).
- The design (`src/model/types.ts`): `JuraCUTDocument` = name, `bed` [w, h], `material`, `items`. Each `Item` is a
  rectangle, circle, line, text or free `shape` (outlines brought in from SVG/DXF, or a shape that was turned or flipped
  when it couldn't keep its settings) with an `op`: cut, score or engrave. `src/model/shapes.ts` (pure) turns items into
  outlines (`itemOutlines`), measures (`itemBox`), moves/turns/flips (`movedItem`, `rotatedItem`, `rotatedItemAbout`,
  `mirroredItem`, `transformedItem`), finds what's under a click (`itemAt`, `itemsInBox`) and which shapes sit inside
  another (`pieceOf`, used by Arrange so a hole travels with its plate). `src/model/document.ts` reads files carefully
  (every value checked, odd ones fall back) and writes them; `src/model/keep.ts` keeps the design in localStorage
  (`juracut.document.v1`); `src/model/importFile.ts` brings SVG/DXF in as one shape per op, placed 10 mm in from the
  bed's corner.
- Geometry, all pure, in `src/geometry/`: `segments.ts` is JuraCAD's `src/laser/laser.ts` plus `arrangeOnBed` from its
  printCheck.ts — `Segment` (line, 3-point arc, circle, cubic Bézier, ellipse, ellipse arc), `chainEdges`, `sortLoops`
  (holes before the outline round them, deepest first), `pathsBox`, `movePaths`, `layoutPieces`, `LASER_LAYERS`. Keep
  it in step with JuraCAD's so files from either look the same to Bambu Studio. `text.ts` makes letters from the fonts
  in `fonts/*.json` (compact outlines made by `scripts/make-fonts.py` from OFL fonts — Inter, Poppins, Lora; see
  `fonts/LICENSE.md`), sized by capital height, curves kept as Béziers. `svgImport.ts` has its own small XML reader
  (so tests need no browser), path data (arcs → Béziers), transforms, units (viewBox + mm/in width; else 96 px/in),
  and reads colours as ops (green stroke = score, filled with no stroke = engrave, else cut). `dxfImport.ts` is
  JuraCAD's DXF reader plus `dxfOutlines` (layer names SCORE/ENGRAVE → ops; bulges → arcs; splines sampled).
- Kerf: `src/geometry/offset.ts` (`offsetLoop`: a loop moved out or in — a circle stays a circle, otherwise the loop
  is walked as straight pieces with exact round joins where corners open and intersections where they close; null when
  it's moved in past its own middle; `nestingDepths`). `sheet.ts` `withKerf` moves outsides and islands (even depth)
  out and holes (odd) in by kerf/2; the Export dialog's checkbox is on when the material's kerf is > 0.
- Materials: `src/model/materials.ts` (pure: `DEFAULT_MATERIALS`, read/write of the list in localStorage
  `juracut.materials.v1`, `freeName`, `findMaterial`), `src/app/materialsState.ts` (the list, shared with
  useSyncExternalStore), `src/app/MaterialsDialog.tsx` (table: use, change, remove, add, starter list). The design
  keeps a copy of its material (`doc.material`); Settings' drop-down picks from the list.
- Snapping and rulers: `src/model/snap.ts` (pure: `snapLines` — other shapes' box edges and middles plus the bed;
  `snapPoint` for drawing, `snapBoxMove` for moving the selection's box; `rulerStep`). BedView keeps the lines in
  `linesRef` from pointer-down, draws `.snap-guide` lines while snapped, and `Rulers` along the top and left (`RULER`
  px, screen coordinates, pointer marked); Fit leaves room for them. Shift = no snapping.
- Laser files: `src/laser/sheet.ts` (`laserPaths`: engrave, score, open cuts, then holes before outlines via
  `sortLoops`; `makeSheet` with `mirror`, `wholeBed` and `kerf`) and `src/laser/files.ts` (JuraCAD's `laserFiles.ts`:
  `laserSvg` — mm width/height + viewBox, one `<g>` per layer with Inkscape labels, engraving as one even–odd fill;
  `laserDxf` — R12 POLYLINEs with bulges).
- State: `src/model/store.ts`. Every design change goes through `commit` (an undo step, up to 100); drags use
  `dragStart`/`dragUpdate`/`dragEnd` so a whole drag is one step. Zustand selectors must not return a fresh
  array/object each call (use a shared constant), or React loops. Keep pure logic out of React and covered by Vitest.
- UI (`src/app/`): `TopBar.tsx` (name, save state, version badge, Install, New/Open/Import/Save, Export for laser,
  Settings — bed, material, appearance — Help), `Toolbar.tsx` (tools, undo/redo, Cut/Score/Engrave, turn/flip/copy/
  delete, Arrange, Fit), `SidePanel.tsx` (shapes list with eye and order buttons; the selected shape's settings;
  `NumberBox` applies on blur/Enter), `BedView.tsx` (gestures: click/drag select and move, rubber band, drawing tools
  with 1 mm snapping — 0.5 mm zoomed in, Shift = no snap — wheel zoom to pointer, middle/right/Space pan, two-finger
  pan and pinch; `fitRequest` in the store asks it to zoom to fit), `ExportDialog.tsx` (preview, colour key, Save
  SVG/DXF), `HelpDialog.tsx`, `WhatsNewDialog.tsx` (reads CHANGELOG.md), `App.tsx` (shortcuts via `popupGuard.ts`,
  keeping in the browser, file drop, toasts). Light/dark: `theme.ts` sets `data-theme` (CSS variables in styles.css;
  use variables, never fixed colours).
- Offline/installable: `public/manifest.webmanifest` + `public/sw.js` (registered in main.tsx, production only);
  bump `CACHE` in sw.js if its caching rules change.
- Every change: `npm run typecheck && npm test && npm run build && npm run smoke`. CI runs the same and publishes
  `main` to GitHub Pages at https://gm7dha.github.io/JuraCUT/. The base path comes from the repository's name
  (`BASE_PATH` in the workflow, read by vite.config.ts and the smoke test).
- `npm run smoke` (`scripts/smoke-test.mjs`) drives the built app in headless Chromium (`?smoke` exposes
  `window.juracutStore`): draws a rectangle, a circle, a scored line and words → Arrange → exports SVG and DXF →
  imports the SVG → saves and opens a .juracut → picks a material and exports with the kerf → undo, dark mode, help. The browser's own file pickers are turned off
  for it. `SMOKE_DIST` points it at a build somewhere else; `SMOKE_SCREENSHOT=1` saves smoke.png.
- If the npm registry is unreachable from your environment: the pure code can be typechecked and tested with
  `tsc` and `tsx` and a tiny vitest/zustand stand-in, and the app bundled with esbuild (React from any local copy)
  and smoke-tested with a local Playwright + Chromium — then push to a branch with an open PR and let CI do the real
  install, test and build. CI failures are reported as check-run annotations.
- Versions: bump `version` in package.json and add a CHANGELOG.md entry (with the merge commit) at the end of each
  phase. This session type can't create GitHub releases or push tags, so CHANGELOG.md is the record.
- No `package-lock.json` is committed yet (it couldn't be generated in the first session); add one when a session can
  run `npm install`.
