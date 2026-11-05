# JuraCUT versions

Each version is a safe point to go back to. To roll back, ask for "go back to vX.Y" — the change is made as a
pull request that undoes everything after that point (your `.juracut` files aren't touched, but designs that use
newer tools won't open in an older version until those tools are back).

The point in the history for each version is the commit shown (see https://github.com/gm7dha/JuraCUT/commits/main).

## v0.6.1 — Eight more laser designs from JuraCAD

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
