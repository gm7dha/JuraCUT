/**
 * The Materials window: the library of what you cut, with thickness, kerf and
 * notes. Pick one for this design, add your own, change or remove any.
 * Kept on this computer.
 */
import { useState } from "react";

import { DEFAULT_MATERIALS, freeName, materialForDesign, type LibraryMaterial } from "../model/materials";
import { useDocument, useStore } from "../model/store";
import { Icons } from "./icons";
import { setMaterials, useMaterials } from "./materialsState";
import { Modal } from "./Modal";

export function MaterialsDialog() {
  const openDialog = useStore((s) => s.openDialog);
  const doc = useDocument();
  const list = useMaterials();
  const [editing, setEditing] = useState<number | null>(null);
  const s = useStore.getState;

  const update = (next: LibraryMaterial[]) => {
    if (!setMaterials(next)) s().showToast("The browser wouldn't keep the material list, so it's gone after a reload.", "error");
  };
  const change = (i: number, patch: Partial<LibraryMaterial>) => update(list.map((m, k) => (k === i ? { ...m, ...patch } : m)));
  const use = (m: LibraryMaterial) => {
    s().setMaterial(materialForDesign(m));
    s().showToast(`This design now uses ${m.name} (kerf ${m.kerf} mm).`, "success");
  };
  const add = () => {
    const name = freeName(list, doc.material.name);
    update([...list, { name, thickness: doc.material.thickness, kerf: doc.material.kerf, notes: "" }]);
    setEditing(list.length);
  };
  const remove = (i: number) => {
    if (window.confirm(`Remove "${list[i].name}" from the list?`)) update(list.filter((_, k) => k !== i));
  };
  const reset = () => {
    if (window.confirm("Put the starter list back? Your own materials and notes will be gone.")) update(DEFAULT_MATERIALS.map((m) => ({ ...m })));
  };

  return (
    <Modal title="Materials" onClose={() => openDialog(null)} width={700}>
      <p className="dialog-hint" style={{ marginTop: 0 }}>
        The <strong>kerf</strong> is how wide a cut the beam leaves. With it set, Export for laser can move cut lines out by half of it (and holes in), so pieces come out the size you drew.
        Find yours with a test cut: cut a 20 mm square and measure it — the shortfall is the kerf. The list is kept on this computer.
      </p>
      <table className="materials-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Thickness</th>
            <th>Kerf</th>
            <th>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((m, i) => {
            const current = m.name === doc.material.name;
            const edit = editing === i;
            return (
              <tr key={i} className={current ? "current" : ""}>
                <td>
                  {edit ? (
                    <input value={m.name} aria-label="Name" onChange={(e) => change(i, { name: e.target.value.slice(0, 80) })} onBlur={(e) => !e.target.value.trim() && change(i, { name: freeName(list.filter((_, k) => k !== i), "New material") })} />
                  ) : (
                    <button type="button" className="link-button" onClick={() => setEditing(i)} title="Click to change">
                      {m.name}
                    </button>
                  )}
                </td>
                <td>
                  {edit ? (
                    <input type="number" step="any" min={0} value={m.thickness} aria-label="Thickness (mm)" onChange={(e) => change(i, { thickness: Math.max(0, Number(e.target.value) || 0) })} />
                  ) : (
                    `${m.thickness} mm`
                  )}
                </td>
                <td>
                  {edit ? (
                    <input type="number" step="0.01" min={0} value={m.kerf} aria-label="Kerf (mm)" onChange={(e) => change(i, { kerf: Math.max(0, Number(e.target.value) || 0) })} />
                  ) : (
                    `${m.kerf} mm`
                  )}
                </td>
                <td className="notes-cell">{edit ? <input value={m.notes} aria-label="Notes" onChange={(e) => change(i, { notes: e.target.value.slice(0, 500) })} /> : m.notes}</td>
                <td className="row-actions">
                  {edit ? (
                    <button type="button" className="text-button" onClick={() => setEditing(null)} title="Done changing this material">
                      <Icons.Tick size={16} /> Done
                    </button>
                  ) : (
                    <button type="button" className={current ? "text-button" : "primary-button"} disabled={current} onClick={() => use(m)} title="Use this material for the design on the bed">
                      {current ? "In use" : "Use"}
                    </button>
                  )}
                  <button type="button" className="icon-button small" onClick={() => remove(i)} aria-label={`Remove ${m.name}`} title="Remove from the list">
                    <Icons.Trash size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="modal-actions">
        <button type="button" className="text-button" onClick={reset} title="Put the starter list back">
          Starter list
        </button>
        <div className="topbar-spacer" />
        <button type="button" className="text-button" onClick={add} title="Add a material (starting from this design's settings)">
          <Icons.Plus size={16} /> Add material
        </button>
      </div>
    </Modal>
  );
}
