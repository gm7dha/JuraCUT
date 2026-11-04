# JuraCUT versions

Each version is a safe point to go back to. To roll back, ask for "go back to vX.Y" — the change is made as a
pull request that undoes everything after that point (your `.juracut` files aren't touched, but designs that use
newer tools won't open in an older version until those tools are back).

The point in the history for each version is the commit shown (see https://github.com/gm7dha/JuraCUT/commits/main).

## v0.1 — First preview: draw, import, lay out and export for the laser

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
