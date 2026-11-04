import { useStore } from "../model/store";
import { Modal } from "./Modal";
import { detectPlatform, helpRows } from "./platform";

export function HelpDialog() {
  const openDialog = useStore((s) => s.openDialog);
  const rows = helpRows(detectPlatform());
  return (
    <Modal title="Help and shortcuts" onClose={() => openDialog(null)} width={620}>
      <p>
        JuraCUT lays out what you'll cut, score and engrave on your laser's bed. Draw shapes with the tools, or bring in an SVG or DXF drawing (from JuraCAD, Inkscape or anywhere else), set what
        the laser should do with each one in the panel, then <strong>Export for laser</strong> to get an SVG for Bambu Studio's laser mode.
      </p>
      <h3 className="help-heading">What the laser does</h3>
      <ul className="help-list">
        <li>
          <strong>Cut</strong> (red and blue in the file) — right through. Holes inside a shape are worked out for you and cut first (blue), the outside last (red).
        </li>
        <li>
          <strong>Score</strong> (green) — a light pass that marks without cutting through: fold lines, decoration.
        </li>
        <li>
          <strong>Engrave</strong> (black) — the area is filled in: lettering and pictures.
        </li>
      </ul>
      <h3 className="help-heading">Mouse and touch</h3>
      <table className="help-table">
        <tbody>
          {rows.mouse.map(([a, b]) => (
            <tr key={a}>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="help-heading">Keys</h3>
      <table className="help-table">
        <tbody>
          {rows.keys.map(([a, b]) => (
            <tr key={a}>
              <td>
                <kbd>{a}</kbd>
              </td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Your design is kept in this browser as you work, and saved to a <code>.juracut</code> file with Save. JuraCUT is free and open source (MIT):{" "}
        <a href="https://github.com/gm7dha/JuraCUT" target="_blank" rel="noreferrer">
          github.com/gm7dha/JuraCUT
        </a>
        . Its sister program for 3D parts is{" "}
        <a href="https://gm7dha.github.io/JuraCAD/" target="_blank" rel="noreferrer">
          JuraCAD
        </a>
        .
      </p>
    </Modal>
  );
}
