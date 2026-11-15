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
  (JuraCAD's maths for pieces held between two slotted sides; `assemblyItems` lays them out flat);
  `laserSet5.ts`: bird box (Garden; RSPB/BTO sizes — the inside climbing lines are a score shape grouped with the front),
  earring stand, box with drawers, honeycomb desk pot (Desk), sunburst mirror frame, tablet/book stand (Desk), coaster
  holder, tissue box cover — over `boxPanels.ts` (JuraCAD's: a finger box as separate panels standing `upright`,
  `upsideDown` or `onBack` — `panelPlace`; `boxItems` lays each panel out as JuraCAD's sketch draws it, with its holes —
  circles, polygons, slots (`holeOutline`: two half circles) — and score `lines`; `plateItem`, `panelAreas`, `panelsFit`).
  JuraCAD's "Kerf allowance" inputs are left out here, as if 0: pieces and holes are true size (no `drawnHole`), and
  Export's kerf does what JuraCAD's allowance does; thickness defaults come from the material (the bird box's at least 6);
  values are kept inside their limits (`cleanValues`) rather than refused as JuraCAD does);
  `cleanValues`, `makeDesign`. `browse.ts` — `groupDesigns` (headings in `GROUP_ORDER`: Boxes and stands, Signs and
  stamps, Home, Workshop, Toys and gifts, Garden, Desk — JuraCAD's laser tab's order) and `searchDesigns` (as JuraCAD's). `fingers.ts` is JuraCAD's
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
- Mountain puzzle: there is none here. A layered laser version lived here in v0.8–v0.11.1 and was taken out at the
  owner's request (v0.12); the mountain puzzle is JuraCAD's, 3D printed only. Don't bring it back unless asked.
- Handles, clipboard, menu (v0.13): `src/model/resize.ts` (pure: `scaledItem` — rects stay rects when square to the bed
  or scaled evenly, circles/text/pictures when even, else the outline stretched, curves → Béziers by `asBeziers`;
  `dragScale`/`anchorOf`/`handlePoint`, `canStretch`, `MIN_SIZE`). BedView draws `.handles` round the selection box
  (corners, edges when > 40 px, a round turn handle `TURN_PX` above), hit-tested in screen px before `itemAt`; gestures
  "resize" (1 mm grid, Shift or all circles/words = even) and "turn" (`rotatedItemAbout` the box middle, 15° steps, Shift
  free), both one undo step via dragStart/Update/End. `src/model/clipboard.ts` (pure: `clipText` JSON "juracut-shapes" v1,
  `whatIsPasted` → shapes checked by `parseDocument` / svg / words; `copiesOf` — new ids and groups) and
  `src/app/clipboardApp.ts` (document copy/cut/paste events, not in text boxes or popups; menu Paste reads the clipboard or
  this tab's last copy). `src/app/BedMenu.tsx`: right-click (no menu after a right-drag pan). Store `pasteItems`,
  `selectOp`, `setOpHidden`, `orderSelected`, `requestFit("selection")` (`fitTarget`; Shift+F). SidePanel `OpChips`.
- Outline / combine / repeat / curved words (v0.14): `src/geometry/boolean.ts` (pure, own maths — no library: even–odd
  rings, edges split where they cross or run along each other on a grid, each piece kept when the wanted area is on one
  side only, oriented inside-left, chained taking the leftmost turn so shapes touching at a corner stay apart;
  `booleanRings`, `loopsToRings`/`ringsToLoops`, `outsidesOnly`). `src/model/combine.ts` (`outlineRings` — outsides
  offset by `offsetLoop`, lines as round-ended strips, unioned, gaps filled; `combinedRings` join/cutOut (biggest minus
  the rest)/overlap; `ringsShape`, `canCombine`); `src/model/repeat.ts` (`repeatedItems`, `MOST_COPIES`). Store
  `combineSelected`, `outlineSelected`, `repeatSelected`. UI `src/app/MakeMore.tsx` under the selection's settings
  (sizes in localStorage `juracut.makeMore`, shared with BedMenu). `TextItem.curve` (radius; + over the top, − under;
  missing = straight): `textOutline(…, curve)` turns each glyph rigidly onto the circle (centre `curve` below the anchor);
  resize scales it; SidePanel's "Round a circle".
- v0.15: `PolygonItem` (kind "polygon": cx, cy, r to a corner, sides 3–100, angle of the first corner, `star` = inner
  corners' share of r; `polygonPoints`, `makePolygon`, `polygonName`; turns keep it, flips set angle 180 − a, only even
  resizes keep it). Tool "polygon" (P; drag centre → corner, 15° steps; last sides/star in localStorage `juracut.polygon`,
  `src/app/polygonStyle.ts`), SidePanel `PolygonFields`. `src/model/breakApart.ts` (`piecesOfOutlines`: outsides with
  their direct holes, open lines alone; `brokenApart`), store `breakApartSelected`. `combine.ts` `insetRings` (outsides in,
  holes out, ∩ the shape) → `outlineSelected(d, fill, inside)`. `repeat.ts` `roundItems` (clockwise from the top round a
  centre `radius` below, turned or moved) → `repeatRoundSelected`. `src/model/measure.ts` (`pathLength`, `itemLength`,
  `itemArea`, text helpers): SidePanel `Measures`, Export's line length per layer. Undo/Redo `.icon-only`; under 1440 px
  the toolbar's buttons close up — the smoke test checks it fits at 1280 px.
- v0.16: holding tabs — `Item.tabs`/`tabWidth` (base fields, saved, kept by `baseOf` in shapes.ts whenever a shape
  becomes an outline), `src/laser/tabs.ts` (pure: `tabPlaces` — evenly spaced, slid off corners turning > 20°;
  `withTabs` → the open runs between them, flattened). `laserPaths` keeps a Map by segments array through `sortLoops`,
  kerf one-for-one (`kerfEach`), and swaps a tabbed loop for its runs (same layer, same place in the order; gap = width +
  kerf). BedView draws `.tab-mark` circles; SidePanel `TabFields` (one or several). Copies with different words —
  `src/model/names.ts` (`namesFrom`, `numberNames`, `namedText` — "#" replaced else the whole words, shrunk to the
  original's width keeping its middle — `namedCopies` in Step and repeat's grid); store `nameCopiesSelected`; MakeMore's
  `NamedCopies` (list kept in localStorage `juracut.names`).
- v0.17 QR codes: `src/geometry/qrcodegen.ts` is Nayuki's MIT generator unchanged but for `export namespace` (keep it
  so); `src/geometry/qr.ts` (`qrModules` cached, null when it doesn't fit or > `MOST_QR_TEXT`; `qrLoops` — traceBitmap of
  the squares, straight runs merged, mm y up). `QrItem` (kind "qr": x, y bottom-left, size, text, ecc L/M/Q/H; engraved;
  turned or flipped it becomes a shape; only even resizes, `canStretch` false). Tool "qr" (Q, click to place, panel focused),
  SidePanel `QrFields`; `namedCopies` replaces "#" in a QR's text too. The smoke test places one, exports it alone and
  checks the rendered SVG's three corner squares.
- v0.18 Edit points: `src/model/nodes.ts` (pure: `editable` — curves → Béziers via `asBeziers`; `NodeRef` {outline, index}
  — index = the piece it starts, or segments.length for an open line's end; `nodesOf`, `handlesOf`, `movedNode` (handles
  go along), `movedHandle`, `nearestOn`, `pieceAt`, `addedNode` (de Casteljau, shape unchanged), `removedNode` (null when
  too few), `curved`/`straightened`). Store `pointsOf`/`pickedNode`, `editPoints` (converts to a shape: one undo step),
  `stopEditingPoints` (also when the selection drops it), `pickNode`, `changePoints`. BedView: `editing`, `pointAt` (handles
  of the picked point first, then points, screen px), gestures "node"/"handle" (one drag = one step, grid snap unless
  Shift), double-click adds a point (else, off editing: words/QR focus their text, others start editing), `.nodes`
  drawing, no resize handles or dashed boxes meanwhile. App: Esc stops, Delete removes the picked point. SidePanel
  `PointsBar`.
- v0.19: snap.ts `shapePoints` (corners/ends/line middles, circle centre + quadrants, polygon centre; none for words/QR),
  `SnapLines.points` (≤ `MOST_SNAP_POINTS`), `snapPoint` (points win over lines → `point`), `snapPointsMove` (the moving
  shapes' points, ≤ 300 in BedView's `ownPoints`, onto others'; before the box-edge snap). Node drags snap too (other
  shapes + the shape's other points). `.snap-point` ring. `Item.locked` (base field, `baseOf`): BedView picks from
  `pickable` (not locked) for clicks, box select and double-click; `selectAll` and `moveSelected` skip them; padlock in
  the shapes list. Tool "measure" (M): gesture "measure", `measured` stays until the next click/tool change, readout
  `measureText`. Smoke steps that need exact positions start from `newDocument()` and add with `{ select: false }`.
- v0.20 fonts: nine more OFL fonts from github.com/google/fonts (`ofl/…`), made with scripts/make-fonts.py (`python3 -I`):
  great-vibes, allura, pacifico, caveat, amatic-sc (Bold), bebas-neue, anton, dm-serif-display, saira-stencil. Never add
  one under a Reserved Font Name (its OFL.txt): Dancing Script, Lobster, Playfair, Stardos, Sacramento… were left out
  for that reason, and lora-regular's label is "Book serif". `JOINED_FONTS` (scripts) tick `TextItem.weld` when picked.
  `textOutline` returns `letterLoops` (loops per letter); `weldedText` (shapes.ts, cached) = `unionOfSets` of each
  letter's even–odd rings. boolean.ts `combineSets` is the general maths (`booleanRings` and `unionOfSets` over it);
  combine.ts's `unionAll` uses `unionOfSets`. Script capitals may reach below the baseline (tests/text allows it).
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
  imports the SVG → saves and opens a .juracut → puts a stencil and a box on the bed from the Library (and a bird box found by searching: 7 pieces + score lines, undone) → groups,
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
