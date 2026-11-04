# JuraCUT

**Free, open-source, browser-based design and layout for laser cutting — made for the Bambu Lab R1 and Bambu Studio's laser mode.** Sister program to [JuraCAD](https://github.com/gm7dha/JuraCAD).

▶ **Use it:** https://gm7dha.github.io/JuraCUT/ (Chrome or Edge recommended)

JuraCUT runs entirely in your browser. Your designs never leave your computer, there's no account, and it's free.

> **Status: v0.2 preview.** Draw shapes and words, bring in SVG or DXF drawings, say what the laser does with each
> (cut, score or engrave), lay everything out on the bed and export an SVG for Bambu Studio. See the
> [roadmap](docs/DESIGN.md#roadmap).

## What you can do today

- **The bed**: the R1's 600 × 300 mm work area to scale, with a millimetre grid. Zoom with the wheel or a pinch;
  pan with the middle button, right button, Space, or two fingers.
- **Draw** rectangles (with rounded corners), circles, lines and **words** in five fonts, sized by the height of a
  capital letter. Everything snaps to the millimetre (hold Shift not to).
- **Import** SVG and DXF drawings at true size — from JuraCAD's *Export for laser*, Inkscape, or anywhere else. Their
  colours are read as cut, score or engrave.
- **Cut, score or engrave**: pick what the laser does with each shape. Holes inside a shape are found for you and cut
  before the outside round them, so pieces don't move before their holes are done.
- **Move, turn, flip, copy, delete, hide** shapes; nudge with the arrow keys; **Arrange** lays every piece out on the
  bed (a hole stays with its plate).
- **Export for laser**: an SVG (or DXF) at true size with each colour as a layer, the way Bambu Studio's laser mode
  wants it — with a preview and a colour key. Mirror for engraving on the back. **Kerf compensation** moves cut lines
  out by half your material's kerf (holes in), so pieces come out the size you drew.
- **Materials**: a list of what you cut, with thickness, kerf and your notes, kept on your computer.
- **Rulers** and **snapping**: edges and middles line up with other shapes and the bed as you draw or move.
- **Save** to a `.juracut` file and open it later (or drag it onto the window). Your latest work is also kept in the
  browser. **Install it as an app** (Chrome/Edge) so it opens in its own window and works offline. Light and dark.

## In Bambu Studio

1. Laser mode › choose your material › Import the SVG. It comes in at true size.
2. Each colour is a layer: red and blue lines **cut**, green lines **score**, black areas **engrave**.
3. Blue holes are listed before red outlines, so cut them in that order.

## How it's built

- **TypeScript + React + Vite**, state in **Zustand**. The bed is an SVG; the geometry (curves kept exact — lines,
  arcs, circles, Béziers — joined into loops, holes told from outlines, pieces laid out) is JuraCAD's laser code.
- Every change runs automated tests and a browser smoke test on GitHub Actions and, once merged to `main`, publishes
  to GitHub Pages.

See [docs/DESIGN.md](docs/DESIGN.md) for the design, decisions and roadmap.

### Developing

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run build      # production build into dist/
npm run smoke      # drives the build in headless Chromium
```

## Licence

JuraCUT is MIT licensed (see [LICENSE](LICENSE)). It ships outline data made from the Inter, Poppins and Lora fonts
(SIL Open Font License, see [src/geometry/fonts/LICENSE.md](src/geometry/fonts/LICENSE.md)), and uses
[React](https://react.dev) (MIT) and [Zustand](https://github.com/pmndrs/zustand) (MIT).
