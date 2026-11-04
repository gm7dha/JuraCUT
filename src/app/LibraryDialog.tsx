/**
 * The design library window: pick a design on the left, fill in its sizes,
 * see a preview, and put it on the bed.
 */
import { useMemo, useState } from "react";

import { pathsBox } from "../geometry/segments";
import { defaultValues, designProblems, LIBRARY, makeDesign, type DesignInput, type LibraryDesign, type Values } from "../library/designs";
import { itemOutlines } from "../model/shapes";
import { useDocument, useStore } from "../model/store";
import { OP_INFO } from "../model/types";
import { itemPathData } from "./BedView";
import { Icons } from "./icons";
import { Modal } from "./Modal";

const TAB_KEY = "juracut.libraryDesign";

function rememberedDesign(): LibraryDesign {
  try {
    const id = localStorage.getItem(TAB_KEY);
    return LIBRARY.find((d) => d.id === id) ?? LIBRARY[0];
  } catch {
    return LIBRARY[0];
  }
}

export function LibraryDialog() {
  const doc = useDocument();
  const openDialog = useStore((s) => s.openDialog);
  const [design, setDesign] = useState<LibraryDesign>(rememberedDesign);
  const [values, setValues] = useState<Values>(() => defaultValues(rememberedDesign(), doc.material));
  const inputs = design.inputs(doc.material);
  const problems = designProblems(design, doc.material, values);
  const made = useMemo(() => (problems.length ? null : makeDesign(design, doc.material, values, doc.items.map((it) => it.id))), [design, values, doc.material, doc.items, problems.length]);

  const pick = (d: LibraryDesign) => {
    setDesign(d);
    setValues(defaultValues(d, doc.material));
    try {
      localStorage.setItem(TAB_KEY, d.id);
    } catch {
      // Not remembered; fine.
    }
  };

  const insert = () => {
    if (!made || !made.items.length) return;
    const s = useStore.getState();
    s.addItems(made.items);
    s.openDialog(null);
    s.requestFit();
    s.showToast(`Put ${design.name.toLowerCase()} on the bed (${made.items.length} ${made.items.length === 1 ? "shape" : "shapes"}).${made.notes.length ? ` ${made.notes.join(" ")}` : ""}`, "success");
  };

  return (
    <Modal title="Design library" onClose={() => openDialog(null)} width={860}>
      <div className="library-layout">
        <nav className="library-list" aria-label="Designs">
          {LIBRARY.map((d) => (
            <button key={d.id} type="button" className={`library-item${d.id === design.id ? " selected" : ""}`} onClick={() => pick(d)} aria-pressed={d.id === design.id}>
              <strong>{d.name}</strong>
              <span className="muted small">{d.description}</span>
            </button>
          ))}
        </nav>
        <div className="library-form">
          {inputs.map((i) => (
            <InputField key={`${design.id}-${i.key}`} input={i} value={values[i.key]} onChange={(v) => setValues({ ...values, [i.key]: v })} />
          ))}
        </div>
        <div className="library-side">
          <Preview made={made?.items ?? []} />
          {problems.map((p) => (
            <p key={p} className="dialog-hint attention">
              <Icons.Warning size={16} /> {p}
            </p>
          ))}
          {made?.notes.map((note) => (
            <p key={note} className="dialog-hint">
              {note}
            </p>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="text-button" onClick={() => setValues(defaultValues(design, doc.material))}>
          Back to the usual sizes
        </button>
        <div className="topbar-spacer" />
        <button type="button" className="primary-button" disabled={!made || !made.items.length} onClick={insert}>
          <Icons.Plus size={18} /> Put on the bed
        </button>
      </div>
    </Modal>
  );
}

function InputField({ input, value, onChange }: { input: DesignInput; value: Values[string]; onChange: (v: Values[string]) => void }) {
  const id = `lib-${input.key}`;
  if (input.kind === "toggle") {
    return (
      <div className="library-input">
        <label className="check-row" htmlFor={id}>
          <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {input.label}
        </label>
        {input.help && <p className="dialog-hint field-hint">{input.help}</p>}
      </div>
    );
  }
  return (
    <div className="library-input">
      <label htmlFor={id} className="field-label">
        {input.label}
      </label>
      {input.kind === "text" ? (
        input.multiline ? (
          <textarea id={id} className="text-box" rows={2} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input id={id} className="text-box" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
        )
      ) : input.kind === "choice" || input.kind === "font" ? (
        <select id={id} className="text-box" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {input.choices?.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="field-input">
          <input
            id={id}
            className="text-box"
            type="number"
            step={input.kind === "count" ? 1 : "any"}
            min={input.min}
            max={input.max}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
          {input.unit && <span className="unit">{input.unit}</span>}
        </span>
      )}
      {input.help && <p className="dialog-hint field-hint">{input.help}</p>}
    </div>
  );
}

/** What the design will put on the bed, drawn to fit the box. */
function Preview({ made }: { made: ReturnType<typeof makeDesign>["items"] }) {
  const box = pathsBox(made.flatMap((it) => itemOutlines(it).map((o) => ({ layer: "outer" as const, ...o }))));
  if (!box) return <div className="library-preview empty muted small">Nothing to show yet.</div>;
  const pad = Math.max(box[2] - box[0], box[3] - box[1]) * 0.04 + 1;
  const vb = `${box[0] - pad} ${-(box[3] + pad)} ${box[2] - box[0] + 2 * pad} ${box[3] - box[1] + 2 * pad}`;
  return (
    <svg className="library-preview" viewBox={vb} preserveAspectRatio="xMidYMid meet" aria-label="Preview">
      <g transform="scale(1 -1)">
        {made.map((it) => (
          <path
            key={it.id}
            d={itemPathData(it)}
            fill={it.op === "engrave" ? "var(--ink)" : "none"}
            fillRule="evenodd"
            stroke={it.op === "engrave" ? "none" : it.op === "score" ? "#15a33a" : OP_INFO.cut.colour}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}
