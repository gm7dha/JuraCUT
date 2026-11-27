# JuraCUT versions

Each version is a safe point to go back to. To roll back, ask for "go back to vX.Y" — the change is made as a
pull request that undoes everything after that point (your `.juracut` files aren't touched, but designs that use
newer tools won't open in an older version until those tools are back).

The point in the history for each version is the commit shown (see https://github.com/gm7dha/JuraCUT/commits/main).

## v0.30.1 — Island reliefs export quickly

- Exporting an island relief (or showing one on the bed) could take minutes and seem to do nothing, especially with
  several on the bed: keeping the carving inside the coastline checked every dot of the picture against every point
  of the coast. It now works a row at a time — the same result, in a fraction of a second. Photos masked to any shape
  are quicker too.

## v0.30 — Island relief: a real island carved by the laser · commit `6905b15`

- **Island relief** (in the Design library, under Maps): pick an island — Arran, Skye, Mull, Wight, Anglesey, the Isle
  of Man and more, or any area of Great Britain by its grid reference — and JuraCUT fetches its real heights and makes
  it a carving. Not layers: the R1 burns the land away in greys, deeper the lower it is, so the summits stay at the
  board's surface and the coast is the deepest — a 3D relief in one board.
- You set **how thick the board is** and **how deep to carve**; JuraCUT keeps at least 1 mm under the carving and says
  how much is left. Smooth or **terraced** (flat steps, like a contour model), a slider to lift the low ground or
  sharpen the peaks, and contour lines scored every so many metres if you like.
- It's cut out round its coast **in one piece**, or as a **jigsaw**: classic tabs, small tabs, wavy or straight, as many
  pieces across as you choose, and a pattern number for another arrangement. Cuts stop at the coast, and small pieces
  along the shore are pointed out.
- An optional **frame** (the sea) cut from the same board for the island to drop back into, with the island's name
  engraved along the bottom.
- A **depth test strip** — six squares from no burn to full depth, labelled — to find the power and passes on scrap
  first, and step-by-step notes for Bambu Studio's Grayscale mode.

## v0.29 — Guide lines, and copies along a path · commit `c901ce5`

- **Guide lines**: drag out of the top ruler for a level guide, or out of the left ruler for an upright one, as in
  Inkscape and LightBurn. Shapes snap to guides while you draw and move them, so lining things up across the bed is
  easy. Drag a guide to move it (it snaps to shapes' edges and middles; Shift for anywhere), or drop it back on a ruler
  to remove it; "Remove all guide lines" is in the right-click menu. Guides are saved with the design, can be undone,
  and are never cut.
- **Copies along a path** (in the selection's settings and the right-click menu), like LightBurn's Copy Along Path:
  pick a shape and the shape to follow (the biggest one picked is the path). Copies are spaced evenly all the way round
  a closed shape, or end to end along a line, and can turn to follow it — holes round a curved edge, a border of stars
  round a sign.

## v0.28 — Round corners, and hatch fill · commit `8ffb90e`

- **Round corners** (under a shape's settings, and in the right-click menu), like LightBurn's corner fillet: every sharp
  corner where two straight lines meet becomes a curve of the radius you choose — on polygons, stars, imported and
  traced outlines, and shapes you've edited point by point. Where the sides are too short for the whole radius, the
  corner gets the biggest curve that fits. A rectangle just gets a corner radius, so it stays a rectangle.
- **Hatch fill**: fills a closed shape with parallel lines, scored — it shades an area much faster than engraving it.
  Choose how far apart the lines are, their angle, and cross-hatch for a second set across the first. Holes are left
  empty, the lines go back and forth so the laser hardly travels, and they're grouped with their shape so the two move
  together.

## v0.27 — History you can click back through, and tidying imported drawings · commit `11b822d`

- **History** (the clock button beside Undo and Redo): every change you've made, newest at the top, each said in a few
  words — "Added "Rectangle 1"", "Moved 3 shapes", "Set "Logo" to be engraved". Click one to go straight back to it,
  as LightBurn's Undo list does. Later steps stay (greyed) until you change something, so you can go forward again.
- **Tidy up lines** (under a drawn or imported shape's settings, and in the right-click menu): drawings from other
  programs often have lines that nearly meet but don't, or the same line drawn twice. Tidy up joins ends closer than
  the distance you pick (0.05 to 1 mm), closing outlines up so they cut as an outside or a hole, keeps doubled lines
  once so the laser doesn't go round twice, and takes out lines of no length. It says what it did.
- When an imported SVG or DXF has such gaps or doubled lines, the message after Import says so.

## v0.26 — Recent designs, and a kerf and fit test card · commit `3183ff2`

- **Recent** (top bar): the designs you've worked on in this browser, newest first, each with a small picture. Every
  design is kept as you work, so pressing New or opening a file never loses the last one — pick it from Recent to carry
  on. The newest 12 are kept (× forgets one). They live in this browser only: Save still makes a file.
- **Kerf and fit test card** (Settings › Materials): puts a small card on the bed to cut from your sheet —
  - a **kerf test**: ten 10 mm squares in a window; push them to one end and the gap ÷ 10 is the kerf to put in
    Materials;
  - a **fit test**: a comb of slots from 0.3 mm narrower to 0.2 mm wider than the sheet, each labelled; the one an
    offcut fits snugly is the slot width for joints.

## v0.25 — Shared edges cut once · commit `5216218`

- **Cut lines lying on top of each other once** (in Export for laser, on unless you untick it), like LightBurn's
  Remove overlapping lines: pieces butted together — easy now that corners snap to corners — share an edge, and cut
  twice it burns and takes longer. The box says how much doubled line it found. With the kerf allowance on, the lines
  move apart by the kerf, so they're no longer on top of each other and both are cut.

## v0.24 — Cut order, and photos masked by any shape · commit `bd0b878`

- **Show the cut order** (in Export for laser), like LightBurn's Preview: press Play, or drag the slider, to watch the
  lines go in the order they're in the file — engraving, scoring, then holes before the outlines round them — with what
  each step is, how long, and dashed lines where the head moves with the laser off. It totals the line length and the
  travel too.
- **Engrave a photo only inside a shape** (like LightBurn's Apply Mask to Image): pick a photo and any closed shape — a
  heart, a star, words — and press the button (in the panel or the right-click menu). The mask moves, turns and flips
  with the photo; **Take the mask shape off** in the photo's panel undoes it. Keep the shape to cut round it.
- Fixed: the Export window's settings column could be pushed partly out of sight.

## v0.23 — Trim · commit `3da10ea`

- **Trim tool** (X), like LightBurn's Trim Shapes: click a stretch of line between two places where it crosses other
  lines (or itself) and it's taken away; a line nothing crosses goes altogether. Handy for tidying overlapping shapes
  into one cut line — two overlapping circles become a figure of eight with two clicks. Each click is one undo step.
  The trimmed line is followed as straight pieces (within 0.01 mm); the shape's other outlines keep their curves.
- Help lists the E (Oval) and X (Trim) keys.

## v0.22 — Ovals, and names from a spreadsheet · commit `759479f`

- **Oval tool** (E): drag a box and the oval fills it. Set its width, height and angle in the panel; it stays an oval
  when turned, flipped or stretched square to the bed.
- **Names from a spreadsheet** (like LightBurn's CSV merge): put **{Heading}** places in the words — say
  "{Name} – table {Table}" — then paste a spreadsheet (headings on the first line) into Copies with different words, or
  **Open a spreadsheet (.csv)** saved from Excel, Numbers or Google Sheets. Each row makes one copy with its own words;
  QR codes can have {Heading} places too. Plain lists of names work as before (commas in them are fine).
- On screens narrower than 1440 pixels the Turn, Flip, Group, Ungroup, Copy and Delete buttons show just their icons, so
  the toolbar has room to grow (hover for their names).

## v0.21 — Words along any shape, photo shapes and crops · commit `9d77879`

- **Words along a shape** (like LightBurn's Apply Path to Text): pick some words and one other shape — a curve, a
  wave, a circle, any outline — and press **Put the words along the shape** (in the panel or the right-click menu). The
  words centre on the shape's top (or a line's middle) and read left to right; **Slide along it** moves them, **Other
  side** puts them on the other side. They move, turn and resize with their path; the shape itself stays as it was
  (hide it or score it if it's only a guide). **Back to a straight line** undoes it.
- **Photo shapes**: a photo can be a **Rectangle**, **Rounded** or **Round** (an oval filling its frame) — only that
  part is engraved. **Crop off** trims a share from each side, keeping the photo's scale. **Add a cut line round it**
  adds a cut outline the same shape — a photo coaster in two clicks.
- Fixed: ellipses (from imported drawings, or the new round photos' cut lines) were written with one number too many
  in the SVG files and on the bed, so they could go missing. A test now checks every arc.

## v0.20 — Nine more fonts, and joined letters · commit `0f30881`

- **New fonts** for signs, gifts and weddings: **Great Vibes**, **Allura** and **Pacifico** (scripts), **Caveat**
  (handwriting), **Amatic SC** (hand-drawn capitals), **Bebas Neue** and **Anton** (tall, bold capitals), **DM Serif
  Display**, and **Saira Stencil One** — a stencil font whose letters already have their bridges, so the middles of
  A, O and R don't fall out.
- **Join the letters into one shape** (in a words' panel): letters that touch or overlap become one shape, so a script
  word engraves solid (with no gaps where letters overlap) and cuts out as one piece. It's ticked for you when you pick
  a script font.
- The font called Lora is now listed as **Book serif** (the same letters; its licence asks that converted copies use
  another name).
- Join in Combine is faster with many shapes.

## v0.19 — Snapping to corners, locking, measuring · commit `12d96d2`

- **Snap to points**: drawing, moving and editing points now snap onto other shapes' corners, line ends and middles,
  and circles' centres and edges (a small ring shows the point). Moving a shape snaps its corners onto others' —
  handy for butting pieces together. Shift: no snapping.
- **Lock**: the padlock in the shapes list locks a shape so it can't be picked or moved on the bed (a background, or a
  jig outline to line things up with). It stays editable from the list.
- **Measure tool** (M): drag between two points to see the distance, how far across and up, and the angle. It snaps
  to shapes' points too.
- Help lists the new keys (P, Q, M) and the double-click to edit points.

## v0.18 — Edit points · commit `43a904f`

- **Edit points** (like LightBurn's Edit Nodes): double-click a shape (or press **Edit points** in the panel) to
  reshape it point by point. Drag a point — its curve handles come with it — or pick a point and drag its curve's
  handles. **Double-click a line** to add a point there (the shape doesn't change until you move it); **Delete** takes
  the picked point out. "Make the next piece a curve / straight" changes the piece after the picked point. Points snap
  to the grid (Shift: no snapping). **Esc** or **Done** when finished; each change is one undo step.
- The shape becomes a free shape of lines and curves when you start (circles and arcs become curves, exactly enough to
  cut). Words and QR codes still open their text on double-click; Edit points is in their panel.

## v0.17 — QR codes · commit `5e551f2`

- **QR code tool** (Q): click on the bed, then type a web address or any words in the panel. Change its size and how
  sturdy it is (how much can be scratched or burnt and still read: more sturdy means more, smaller squares). The panel
  says how big each square comes out and warns when they're too small to engrave cleanly. Engraved by default; the dark
  squares are joined into clean outlines.
- QR codes work with **Copies with different words**: put **#** in the address and each copy gets its own
  (`https://example.org/table/#`).
- Made with Nayuki's QR Code generator (MIT licence), included in JuraCUT.

## v0.16 — Holding tabs and copies with different words · commit `252a646`

- **Holding tabs**: a cut shape can have small uncut gaps in its outline (set how many and how wide in the panel, for
  one shape or several). Pieces stay held in the sheet until you snap them out, so they can't drop through the
  honeycomb or tip up into the head. Tabs are spread evenly and kept off sharp corners, and show as small circles on
  the bed. With the kerf on, the gaps widen by the kerf so the bridge left is still the width you set.
- **Copies with different words** (like LightBurn's variable text): pick a name tag (the words and the tag), type a
  list of names — or fill it with numbers — and get one tag per name, laid out in a grid. Put **#** in the words to
  keep the rest ("Table #" → "Table 1", "Table 2"…). Long names can be made smaller so they still fit.

## v0.15 — Polygons and stars, break apart, more ways to repeat · commit `117b251`

- **Polygon tool** (P): drag from the middle out to a corner. In the panel choose how many sides, or make it a
  **star** (with how deep its points go), its size across the corners and its angle. The tool remembers your last
  choice.
- **Outline inside**: Outline now goes **round** the shapes or **inside** them, following their edges in (a frame's
  inner line, an inlay).
- **Step and repeat round a circle**: copies spaced evenly round a circle below the selection, each turned with the
  circle or not — petals, clock marks, a ring of tags.
- **Break apart**: splits a shape made of separate pieces (a traced picture, an imported drawing, words) into one
  shape per piece; letters keep their holes.
- **Measuring**: the panel shows a shape's line length (how far the laser travels) and its area; Export shows how much
  line each colour has.
- The toolbar closes up a little on narrower screens so everything fits; Undo and Redo are icons only.

## v0.14 — Outline, combine, words round a circle, step and repeat · commit `07dab0a`

New under the selected shapes' settings (**Make more**), and in the right-click menu:

- **Outline**: a new cut shape round the selection, a set distance out — a border round words, or a backing piece to
  glue them on. "Fill gaps inside" makes it one solid piece (the spaces between letters filled).
- **Combine** two or more shapes: **Join** them into one, **Cut out** the smaller ones from the biggest, or keep only
  where they **Overlap**. The result is one shape of straight lines (curves are followed to within 0.01 mm).
- **Step and repeat**: copies in a grid, so many across and so many up, a gap apart — handy for a sheet of coasters or
  tags.
- **Words round a circle**: a words shape can go **Over the top** of a circle (reading clockwise, like the top of a
  badge) or **Under** it (letters upright along the bottom), with the circle's size to set. Each letter keeps its
  exact curves.

## v0.13 — Handles, copy and paste, right-click menu · commit `b1d5348`

- **Resize by dragging**: a selected shape (or several) has small square handles round it. Drag a corner to make it
  bigger or smaller both ways, or an edge to stretch it one way. Hold **Shift** to keep its proportions. Circles and
  words always keep theirs (stretched, they'd stop being circles and words). A rectangle stays a rectangle; anything
  else stretched one way becomes an outline. The size shows by the pointer as you drag.
- **Turn by dragging**: the round handle above the selection turns it about its middle, in steps of 15° (Shift: any
  angle).
- **Copy, cut and paste** with Ctrl/⌘ + C, X and V. A paste lands a little beside the original (further each time).
  You can paste into another JuraCUT tab, and paste an SVG drawing, a picture (it opens the Picture window) or plain
  words from other programs.
- **Right-click menu** on the bed (Control-click on a Mac): copy, cut, paste, duplicate, delete, cut/score/engrave,
  turn, flip, group, bring to front or send to back, zoom to the selection, and select every shape of a colour.
- **By colour**: above the shapes list, a chip for each colour on the bed. Click it to select every cut, score or
  engrave shape; its eye hides or shows them all.
- **Zoom to selection**: Shift + F (F still fits the whole bed).

## v0.12 — Mountain puzzle taken out · commit `332f4e5`

- The **Mountain** tool has been taken out of JuraCUT. The mountain puzzle is now 3D printing only, in JuraCAD's
  Mountain tool. Nothing else changes.

## v0.11.1 — Mountain puzzle: map names on flat ground · commit `452d333`

- Map names now go on the flattest ground near their place, crossing at most 3 sheets. On a steep slope each sheet shows
  only a thin strip, so a name spread over many sheets was cut into slivers you couldn't read. A name with no flat
  enough spot within 30 mm is left off, and the window says how many.

## v0.11 — Mountain puzzle: OpenStreetMap files · commit `05ffa98`

- **Mountain puzzle:** a new way to choose the mountain, **An OpenStreetMap file**. On openstreetmap.org, zoom to the
  mountain, press Export and save the .osm file; the puzzle takes its area from the file. The heights still come from the
  height data (OpenStreetMap has none).
- **From the map** chooses how much of the map goes onto the sheets:
  - **Just the area**;
  - **Paths, rivers and lochs:** footpaths, tracks, rivers and streams are scored, each stretch on the sheet it crosses
    (so a path climbs the mountain sheet by sheet), and lochs are engraved on the sheet of their shore;
  - **Everything:** roads (scored), buildings (engraved) and names — summits with their heights, huts, lochs and places —
    engraved too. On a hillside a name crosses several sheets: it's engraved on each of them in the same place, so it
    reads whole from above. Pieces' own names keep clear of map names.
- The sheet preview shows the map's lines (green dashes), lochs and names.

## v0.10 — Bird box and seven more designs · commit `1cdfa48`

- Eight more designs in the **Library**, the same as JuraCAD's newest laser designs:
  - **Bird box** (under a new **Garden** heading): a nest box for blue tits, great tits or house sparrows, following the
    RSPB's and BTO's advice where a laser can — the right hole for the bird, at least 125 mm above the floor, drainage
    holes, a lift-off roof, and score lines inside the front so the young can climb out (put the scored side inward).
    They advise 15 mm timber walls, so thinner plywood is a compromise: use at least 6 mm exterior plywood and hang it
    out of full sun, facing north to east.
  - **Earring stand**: two plates that slot together into a cross, with holes for earrings.
  - **Box with drawers**: a finger-jointed case with shelves and 1–6 sliding drawers.
  - **Honeycomb desk pot** (under a new **Desk** heading): a pen pot with a pattern cut in its walls and optional dividers.
  - **Sunburst mirror frame**: a sun of rays round a round craft mirror, with a keyhole hanger hidden behind it.
  - **Tablet or book stand** (Desk): a slot-together stand that leans back at the angle you choose.
  - **Coaster holder**: holds a set of the library's coasters standing on edge.
  - **Tissue box cover**: drops over a box of tissues, with a rounded slot in the top.
- As with the other boxes, tick "Allow for the kerf" when you export so the joints fit snugly.

## v0.9 — Mountain puzzle sizes · commit `fafc153`

- **Mountain puzzle:** choose the finished **height** in mm (it works out the number of sheets and shows how much the
  heights are stretched), and **3 mm or 5 mm** sheet. Up to 100 sheets.
- Smaller pieces: 30 mm pieces now work in both 3 mm and 5 mm sheet (tab necks are kept at least 3 mm wide, whatever the
  thickness).
- Starts at 150 mm wide, 200 mm tall, with 30 mm pieces, over a 5 × 5 km area.

## v0.8 — Mountain puzzles · commit `247108b`

- **Mountain puzzle** (toolbar, next to Library): turn a real mountain into a layered laser-cut puzzle. Pick a famous
  peak, type an OS grid reference, or type the corners of your OS map, and the heights come free from open height data
  (the same as JuraCAD's Mountain puzzle). Each sheet is one band of height, and each sheet is cut into jigsaw pieces;
  every other sheet's joins are offset by half a piece, like brickwork, so the sheet above bridges the joins below.
- **Sturdy pieces:** tabs are only cut where they fit inside the sheet, joins that would meet the edge at a slant are
  left out, tiny pieces are joined to a neighbour, and piece sizes too small for the sheet's thickness are refused.
- **Easy to put together:** each sheet has the next sheet's outline scored on it, and every piece has its name
  engraved (sheet-piece, like 3-7), hidden under the sheet above wherever there's room.
- Choose the width, sheet thickness, height stretch (which sets the number of sheets) and piece size, look through the
  sheets one by one, then put each bed's worth of sheets on the bed in turn to export and cut.

## v0.7 — Send designs to and from JuraCAD

- **Send to JuraCAD** (Export for laser): the outlines open in JuraCAD as a new sketch on the Top plane, ready to
  extrude into a part — in JuraCAD's open tab, or a new one.
- **From JuraCAD:** its Export for laser panel has "Send to JuraCUT", which puts the outlines straight onto this bed,
  each colour as cut, score or engrave.
- Both apps are on the same website, so designs pass between their tabs inside your browser: nothing is uploaded.

## v0.6.1 — Eight more laser designs from JuraCAD · commit `62cf618`

- **Boxes and stands:** a **living-hinge box** (round corners; the four walls are one strip that bends round them), a
  **card deck box** sized from your cards (thumb notches, lift-off lid) and a **business card holder**.
- **Home:** a **spice or bottle rack** sized from your jars, a **tealight lantern** with circles, diamonds, a honeycomb
  or stars cut in its walls, and a **key rack** with engraved words and slot-in hooks.
- **Toys and gifts:** a **dice tower** and a child's **name puzzle** (each letter a piece that drops into its own hole).

## v0.6 — An Align menu · commit `a1d3167`

- **Align** (toolbar, beside Arrange): line the selected shapes up — left edges, middles, right edges, tops, middles
  or bottoms — against **each other**, a **key shape** (the one you picked first: it stays put and is outlined on the
  bed, and the others line up with it), or **the bed**. The choice is remembered, and the side panel has the same
  controls.
- **Centre on the bed** in one click: the selection moves, as it is, to the middle of the bed.
- **Shortcuts** (Alt, or ⌥ Option on a Mac): A / D left / right edges, W / S tops / bottoms, H / V middles across /
  up and down, C centre on the bed, and with Shift, H / V space out evenly.

## v0.5.1 — Eight more laser designs from JuraCAD · commit `f3cc590`

- **Boxes and stands:** a **sliding-lid box** (the lid runs in grooves made from slotted rails, as a laser can't cut
  a groove part-way), a **tray with dividers** that slot together into rows × columns of compartments, and a
  three-piece **bookend** that needs no glue.
- **Home:** a **clock face** for a quartz movement (numbers, and engraved or scored hour marks), **cord winders** and a
  layered **tealight holder**.
- **Toys and gifts** (a new heading): a **jigsaw puzzle** with round locking tabs (the pattern number picks the
  arrangement — the same number gives the same puzzle as in JuraCAD) and an **ornament or keyring** — star, heart,
  circle or snowflake with a name engraved on it.

## v0.5 — Photo engraving, every JuraCAD laser design, a new Library window · commit `16e25df`

- **Engrave a photo:** Import (or drop) a picture and choose **Engrave as a photo**. Dots (the usual way to laser a
  photo), black & white, or greys; lighter or darker, contrast, light parts for slate; size and detail (dots per mm).
  The photo shows on the bed as it'll engrave, and turns, flips, moves and packs like any shape. Export puts it in the
  SVG at true size, and **Save photos as PNG** saves each one at true size too, for Bambu Studio's own engraving.
- **The Library window now looks like JuraCAD's:** design cards with little drawings, under headings, a search box,
  and each design's sizes beside a preview.
- **Every one of JuraCAD's laser designs:** new are the **flat-pack phone stand**, **rubber stamp** (mirrored words,
  background engraved away), **living hinge panel**, **gear**, **picture frame** and **ruler**, and coasters can be
  six-sided. From now on, laser designs added to JuraCAD come to JuraCUT too.

## v0.4 — Trace pictures, pack tightly · commit `8e66cd1`

- **Trace a picture:** Import (or drop) a PNG, JPG, GIF, WebP or BMP and the Trace window turns it into outlines —
  a logo, a drawing, a scanned sketch. Slide between dark and light (or let it choose), trace the light parts
  instead, pick the detail, smooth curves with sharp corners kept, leave out specks, set the size in mm, and choose
  engrave, cut or score. A preview shows the outlines over the picture.
- **Pack tightly** (Arrange › Pack tightly): pieces are fitted together by their real shapes, not their boxes —
  into each other's corners and into big holes — and turned where that helps (or not, for wood grain). The gap
  between pieces is yours to set. **In rows** is the old Arrange.

## v0.3 — Design library, groups, line up and space out · commit `6745917`

- **Design library** (toolbar › Library): fill in the sizes, see a preview, put it on the bed.
  - **Finger-jointed box** — six panels (five without a lid) whose edges interlock; tick "Allow for the kerf" when you
    export and they fit snugly.
  - **Name or key tag** — rounded corners, a ring hole and engraved words (made smaller to fit if need be).
  - **Coasters** — round or square sets, with engraved words and a scored ring.
  - **Stencil** — words cut out of a sheet, with bridges added so the middles of O, A, R and friends don't fall out.
- **Groups:** select shapes and press Group (Ctrl/⌘ + G) to keep them together — clicking one picks them all, and they
  move, turn and flip as one. Ungroup with Ctrl/⌘ + Shift + G.
- **Line up and space out:** with several shapes selected, the panel lines up their left edges, middles, right
  edges, tops or bottoms, spaces them out evenly, or sets them a chosen gap apart in a row or column. A single shape
  lines up with the bed. Type a position for a whole selection at once.

## v0.2 — Kerf, materials, rulers and snapping · commit `18b9cc6`

- **Kerf compensation:** Export for laser can move cut lines out by half the material's kerf (and holes in), so
  pieces and holes come out the size you drew. Corners that open up get a round join; a circle stays a circle.
- **Materials:** a list of what you cut (thickness, kerf, notes), kept on this computer, with a starter list for
  plywood, MDF, acrylic, card and leather. Pick one in Settings, or open Materials… to add your own and keep notes
  (the power and speed that worked, say). The kerf you measure with a test cut goes here.
- **Rulers** in millimetres along the top and left of the bed, with the pointer marked.
- **Snapping to other shapes:** while drawing or moving, edges and middles line up with the other shapes and the
  bed when they come close — a guide line shows what you've lined up with. Hold Shift to move freely.

## v0.1 — First preview: draw, import, lay out and export for the laser · commit `ce7edde`

- **The bed:** the Bambu Lab R1's 600 × 300 mm work area to scale, with a millimetre grid. Zoom with the wheel or a
  pinch, pan with the middle button, right button, Space, or two fingers.
- **Draw:** rectangles (with rounded corners), circles, lines and **words** in five fonts (Inter, Inter Bold, Poppins,
  Poppins Bold, Lora), sized by the height of a capital letter.
- **Import** SVG and DXF drawings — from JuraCAD's Export for laser, Inkscape, or anywhere else — at true size, with
  their colours read as cut, score or engrave.
- **Cut, score or engrave:** choose what the laser does with each shape. Holes inside a shape are found for you and
  cut before the outside round them.
- **Move, turn, flip, copy, delete, hide**, nudge with the arrow keys, and **Arrange** every shape onto the bed.
- **Export for laser:** an SVG (or DXF) at true size with each colour as a layer, the way Bambu Studio's laser mode
  wants it, with a preview and a colour key. Mirror for engraving on the back.
- **Save** to a `.juracut` file and open it again; your work is also kept in the browser. Install as an app; works
  offline; light and dark.
