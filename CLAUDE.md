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
- Groups, line up, space out: `src/model/arrange.ts` (pure). `Item.group` (an id; saved in files): `withGroups` widens
  ids to whole groups (the store's `select` always does, so a click picks the group), `grouped`/`ungrouped`/`tidyGroups`
  (a group of one isn't a group; delete tidies), `piecesOf` (a group is one piece), `aligned` (`AlignAgainst`: "each" — their combined box —,
  "key" — `keyPiece`, the piece holding the first selected id, which stays put — or "bed"; a single piece always the
  bed), `centredOnBed` (the selection moved as it is), `distributed` (equal gaps, outside two fixed — or a set gap),
  `turnedPieces`/`mirroredPieces` (groups turn/flip about their middle). Arrange treats groups (and shapes inside a
  grouped shape) as one piece. Duplicating a group makes a new group.
- The link with JuraCAD (send a flat design either way): `src/link/juraLink.ts` (pure, the SAME file in JuraCAD — keep them
  identical): both apps are pages of gm7dha.github.io, so their tabs talk over a BroadcastChannel ("jura-link.v1"); each
  tab's `LinkEnd` says here/who/bye, `send` posts a `Parcel` to the other app's newest tab or opens it (`siblingUrl`,
  `?link=<id>`, within the click) and hands it over when that tab says "ready"; the receiver answers "got" with what it did.
  App side `src/app/juraLinkApp.ts` (`startLink` in App, after the kept design is back; `receiveParcel` → `importDrawing` of
  JuraCAD's SVG → addItems, selected, fitted; `sendToJuraCAD` — Export's "Send to JuraCAD", a DXF of the chosen shapes, no
  kerf, not mirrored; JuraCAD makes it a sketch on Top). Tests: tests/juraLink; the smoke test plays a JuraCAD tab both ways.
- **The laser library must stay in step with JuraCAD's** (the owner's standing wish): every laser design in JuraCAD
  (`src/library/designs/` with `category: "laser"`, and its finger-joint box and flat-pack stand) has a JuraCUT twin
  with the same id (`name-tag` is `tag`, `coaster` is `coasters`), name, heading, icon, inputs and maths. When JuraCAD
  gains or changes a laser design, port it here in the same way (numbers instead of `Ex`, Items instead of sketches),
  and add its id to the list in tests/library.test.ts ("has every laser design JuraCAD has"). At the start of a session,
  compare the two libraries and say if JuraCUT is behind.
- Design library: `src/library/` (pure). `kit.ts` — what designs share (`LibraryDesign`: id, name, description,
  `group` heading, `icon` 48×48 SVG markup, `inputs(material)`, `problems`, `make(values, ids)` → ordinary Items (+
  notes), placed 10 mm in from the bed's corner; helpers `n`, `str`, `font`, `fontChoice`, `take`, `loopOf`, `placed`, `inRows` — pieces laid out flat in rows —
  `wordsAt`, `mm`, `r6`).
  `designs.ts` — finger-joint box, name tag, coasters (round, square, six-sided), stencil, and `LIBRARY` (with
  `stands.ts`: flat-pack phone stand, rubber stamp; `workshop.ts`: living hinge, gear, picture frame, ruler;
  `boxes3.ts`: sliding-lid box, tray with dividers, bookend; `laserHome3.ts`: clock face, cord winders, tealight holder;
  `toys3.ts`: jigsaw — `puzzle.ts` is JuraCAD's unchanged, cuts between pieces one open run each — and ornament;
  `laserSet4.ts`: living-hinge box, card deck box, business card holder, spice rack, tealight lantern, key rack, dice
  tower, name puzzle — over JuraCAD's pure `outlines.ts` and `patterns.ts` (copied unchanged) and `sidePanels.ts`
  (JuraCAD's maths for pieces held between two slotted sides; `assemblyItems` lays them out flat));
  `cleanValues`, `makeDesign`. `browse.ts` — `groupDesigns` (headings in `GROUP_ORDER`: Boxes and stands, Signs and
  stamps, Home, Workshop, Toys and gifts) and `searchDesigns` (as JuraCAD's). `fingers.ts` is JuraCAD's
  finger maths unchanged, over a numbers-only `ex.ts` (JuraCUT's boxes have no kerf allowance of their own — Export's
  kerf does it). `bridges.ts` is JuraCAD's stencil bridge planner unchanged; `stencilCut.ts` turns letters + bridges
  into cut lines (outlines minus what lies in a bridge, plus the bridges' long sides where they cross a stroke — the
  even–odd parity of the outlines), chained into loops. UI `src/app/LibraryDialog.tsx`, laid out as JuraCAD's: search
  + cards under headings, then a design's inputs beside a preview (Usual sizes, Back, Put on the bed); library styles
  are JuraCAD's `.library-*` rules.
- Tracing: `src/geometry/trace.ts` (pure, RGBA in): `greyscale` (see-through = white), `otsuThreshold`, `binarize`,
  `traceBitmap` (pixel-edge loops, dark on the right, turn right at saddles so corner-touching pixels stay apart),
  `simplifyLoop` (corners of the staircase, then Douglas–Peucker split at the first and furthest points),
  `smoothLoop` (Catmull–Rom Béziers; turns over 60° stay corners), `tracePicture` (mm, y up, specks by area). UI
  `src/app/TraceDialog.tsx`: pictures from Import/drop (`isPictureFile` in importFile.ts → `store.openTrace(name,
  dataURL)` → dialog "trace"), read into a canvas at ≤ 1000 px a side; threshold slider (Otsu by default), invert,
  detail (tolerance 0.4/0.8/1.6 px), smooth, width mm, specks in mm², op; one `shape` item placed 10 mm in.
- Photos: `PictureItem` (kind "picture": `src` data URL — kept ≤ 1600 px as JPEG on white, `keepableSource` — centre
  cx/cy, unturned size w × h mm, `turns` quarter turns anticlockwise then `flip` left-right outermost, `mode`
  dots/black/greys, `brightness`, `contrast`, `invert`, `dpm` dots per mm; always engraved, `setOp` skips it). Its
  outline is its frame (picking, boxes, Arrange, Pack); turning by other than quarter turns leaves it; `transformedItem`
  maps its centre and works out turns/flip from the matrix. Pure processing `src/geometry/photo.ts`: `adjustGreys`,
  `ditherFloydSteinberg`, `processPhoto`, `withPngDpi`/`pngDotsPerMm` (pHYs). Browser side `src/app/pictures.ts`:
  `renderPicture(item, dpm, mirrored)` (canvas, turned/flipped, ≤ 6000 px a side, PNG with its dpm),
  `usePicturePreview` (≈4 dots/mm, cached). BedView draws it (`PictureOnBed`, flipped back inside the y-up group).
  `laserPaths` leaves pictures out; `makeSheet` returns `pictures` (box on the sheet, mirrored); `laserSvg({ images })`
  writes them as `<image>` in an "Engrave (photos)" layer; Export also has Save photos as PNG. The Picture window
  (`TraceDialog.tsx`) has two tabs, Trace into outlines / Engrave as a photo (`PhotoTab.tsx`; last tab in
  localStorage `juracut.pictureHow`); SidePanel has `PictureFields`.
- Tight packing: `src/geometry/pack.ts` (pure). Pieces drawn on a grid (1 mm cells; `rasterize`: cells the outlines
  pass through plus cells whose middle is inside, even–odd, so big holes stay free; grown by ceil(gap/2) cells),
  biggest first, each allowed quarter turn tried at every place, the one reaching least far back (then leftmost) wins.
  `Bed` keeps, per row, the last taken cell at or before each cell, so a clash jumps straight past what's in the way.
  `store.packAll(gap, turns)` builds pieces like Arrange (`bedPieces`: groups and shapes inside others together),
  turns them with `rotatedItemAbout`, and puts what doesn't fit beside the bed. UI: `src/app/ArrangeMenu.tsx` (the
  toolbar's Arrange opens Pack tightly / In rows, gap and "may be turned", kept in localStorage `juracut.arrange`).
- Mountain puzzle (toolbar "Mountain", dialog "mountain", `src/app/MountainDialog.tsx`): a real mountain as stacked
  sheets, each cut into jigsaw pieces. `src/terrain/osGrid.ts`, `elevation.ts`, `peaks.ts` and `src/app/mountainTiles.ts`
  are JuraCAD's files unchanged (its 3D printed cube puzzle uses them; keep them in step; tests there). Pure
  `contourPuzzle.ts`: heights sampled ~0.4–1.2 mm apart over the puzzle; sheet 0 = the rectangle, sheet L = where
  height ≥ low + L·(relief / layers) (`contourLoops`: marching squares, padded with low ground so loops close along the
  edge, saddles by the cell's middle, anticlockwise outsides; `simplifyLoop` 0.05 mm; islands < `SMALL_ISLAND` and holes
  < `SMALL_HOLE` dropped). Joins: `makePuzzle` (tab `TAB` 0.25, neck ≥ `LEAST_NECK` 3 mm for any sheet → `smallestPiece` 27 mm), every other
  sheet's pattern one piece bigger and shifted half a piece (stagger); each edge clipped to the sheet (`Region`: bucketed
  edges, ray-cast inside, distances), cut straight where the tab isn't wholly inside by max(2, 1.5t), dropped where it meets
  the edge at < `MIN_CROSSING`; ends on the puzzle's border stretched 0.5 mm so they cross cleanly. `mergeSmall`: the sheet
  rasterised (row fill), cuts drawn as 8-connected lines, pieces flood-filled 4-connected; each piece < `smallPiece` drops
  the cut it touches most (all at once per pass), then `withoutDeadEnds` (a join's inside grid corner must meet another).
  Names "sheet-piece" (rows from the back) at the roomiest spot hidden under the next sheet (`chamfer` distances), else
  the roomiest; `LABEL_SIZE` 3. `contourItems.ts`: `bedSheets` (rows of sheets per bed), `sheetItems` (outline + cuts cut,
  next outline score, names as one engrave shape from `textOutline`), group ids start `MOUNTAIN_GROUP`; the dialog's "Bed
  n" buttons call `store.replaceItems` (drops earlier mountain shapes, adds, selects, fits — one undo step). The dialog's
  Height (mm) sets the sheet count (≤ `MAX_SHEETS` 100) and shows the stretch; sheet 3 or 5 mm; defaults 150 mm wide, 200 mm, 30 mm pieces. Tests: tests/mountain.test.ts.
- Laser files: `src/laser/sheet.ts` (`laserPaths`: engrave, score, open cuts, then holes before outlines via
  `sortLoops`; `makeSheet` with `mirror`, `wholeBed` and `kerf`) and `src/laser/files.ts` (JuraCAD's `laserFiles.ts`:
  `laserSvg` — mm width/height + viewBox, one `<g>` per layer with Inkscape labels, engraving as one even–odd fill;
  `laserDxf` — R12 POLYLINEs with bulges).
- State: `src/model/store.ts`. Every design change goes through `commit` (an undo step, up to 100); drags use
  `dragStart`/`dragUpdate`/`dragEnd` so a whole drag is one step. Zustand selectors must not return a fresh
  array/object each call (use a shared constant), or React loops. Keep pure logic out of React and covered by Vitest.
- UI (`src/app/`): `TopBar.tsx` (name, save state, version badge, Install, New/Open/Import/Save, Export for laser,
  Settings — bed, material, appearance — Help), `Toolbar.tsx` (tools, undo/redo, Cut/Score/Engrave, turn/flip/copy/
  delete, Group/Ungroup, Library, Align menu — `AlignMenu.tsx` over `AlignControls.tsx`, shared with the side panel: against each other / key shape / bed,
  `store.alignAgainst` kept in localStorage `juracut.alignAgainst`, the key piece outlined on the bed (`.key-box`),
  centre on the bed, space out; Alt/⌥ + A D W S H V (line up), C (centre), Shift+H/V (space out), read by `e.code` —
  Arrange menu, Fit), `SidePanel.tsx` (shapes list with eye and order buttons; the selected
  shape's settings, or for several: op, position, line up and space out;
  `NumberBox` applies on blur/Enter), `BedView.tsx` (gestures: click/drag select and move, rubber band, drawing tools
  with 1 mm snapping — 0.5 mm zoomed in, Shift = no snap — wheel zoom to pointer, middle/right/Space pan, two-finger
  pan and pinch; `fitRequest` in the store asks it to zoom to fit), `ExportDialog.tsx` (preview, colour key, Save
  SVG/DXF), `HelpDialog.tsx`, `WhatsNewDialog.tsx` (reads CHANGELOG.md), `App.tsx` (shortcuts via `popupGuard.ts`,
  keeping in the browser, file drop, toasts). Light/dark: `theme.ts` sets `data-theme` (CSS variables in styles.css;
  use variables, never fixed colours).
- Offline/installable: `public/manifest.webmanifest` + `public/sw.js` (registered in main.tsx, production only);
  bump `CACHE` in sw.js if its caching rules change.
- Every change: `npm run typecheck && npm test && npm run build && npm run smoke`. CI runs the same and publishes
  `main` to GitHub Pages at https://gm7dha.github.io/JuraCUT/ (deploy-pages has a 30-minute timeout: Pages has been
  slow; if a publish still fails with "Timeout reached" or "Deployment cancelled", re-run the failed job). The base path comes from the repository's name
  (`BASE_PATH` in the workflow, read by vite.config.ts and the smoke test).
- `npm run smoke` (`scripts/smoke-test.mjs`) drives the built app in headless Chromium (`?smoke` exposes
  `window.juracutStore`): draws a rectangle, a circle, a scored line and words → Arrange → exports SVG and DXF →
  imports the SVG → saves and opens a .juracut → puts a stencil and a box on the bed from the Library → groups,
  ungroups, lines up and spaces the panels, lines them up against the key shape from the Align menu (it stays put) and
  centres them with Alt+C → takes a design from a pretend JuraCAD tab and sends one back → traces a PNG it makes itself (a ring and a bar) → engraves it as a photo (bed, SVG image, PNG with pHYs, style
  changed in the panel) → packs tightly → picks a material and exports with the kerf → undo/redo, dark mode, help. The browser's own file pickers are turned off
  for it. `SMOKE_DIST` points it at a build somewhere else; `SMOKE_SCREENSHOT=1` saves smoke.png.
- If the npm registry is unreachable from your environment: the pure code can be typechecked and tested with
  `tsc` and `tsx` and a tiny vitest/zustand stand-in, and the app bundled with esbuild (React from any local copy)
  and smoke-tested with a local Playwright + Chromium — then push to a branch with an open PR and let CI do the real
  install, test and build. CI failures are reported as check-run annotations.
- Versions: bump `version` in package.json and add a CHANGELOG.md entry (with the merge commit) at the end of each
  phase. This session type can't create GitHub releases or push tags, so CHANGELOG.md is the record.
- No `package-lock.json` is committed yet (it couldn't be generated in the first session); add one when a session can
  run `npm install`.
