/**
 * The design library window, laid out like JuraCAD's: a search box and the
 * designs as cards (a small drawing, name and description) under headings;
 * pick one to see its sizes beside a live preview, then put it on the bed.
 */
import { useMemo, useState } from "react";

import { groupDesigns, searchDesigns } from "../library/browse";
import { defaultValues, designProblems, LIBRARY, makeDesign, type DesignInput, type LibraryDesign, type Values } from "../library/designs";
import { pathsBox } from "../geometry/segments";
import { itemOutlines } from "../model/shapes";
import { useDocument, useStore } from "../model/store";
import type { Item } from "../model/types";
import { itemPathData } from "./BedView";
import { Modal } from "./Modal";

/** A design's small drawing (fixed markup written in the code, never user data). */
function DesignIcon({ design, size = 44 }: { design: LibraryDesign; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: design.icon }}
    />
  );
}

function DesignCard({ design, onPick }: { design: LibraryDesign; onPick: (d: LibraryDesign) => void }) {
  return (
    <button type="button" className="library-card" onClick={() => onPick(design)} aria-label={`${design.name}: ${design.description}`}>
      <DesignIcon design={design} />
      <span className="library-card-text">
        <b>{design.name}</b>
        <span className="muted small">{design.description}</span>
      </span>
    </button>
  );
}

/** What the design will put on the bed, drawn to fit. */
function Preview({ items, name }: { items: Item[] | null; name: string }) {
  if (!items || !items.length) return <div className="library-preview empty muted small">The preview shows once the sizes work.</div>;
  const box = pathsBox(items.flatMap((it) => itemOutlines(it).map((o) => ({ layer: "outer" as const, ...o }))));
  if (!box) return <div className="library-preview empty muted small">Nothing to show yet.</div>;
  const pad = Math.max(box[2] - box[0], box[3] - box[1]) * 0.05 + 1;
  const vb = `${box[0] - pad} ${-(box[3] + pad)} ${box[2] - box[0] + 2 * pad} ${box[3] - box[1] + 2 * pad}`;
  return (
    <svg className="library-preview" viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Preview of the ${name.toLowerCase()}`}>
      <g transform="scale(1 -1)">
        {items.map((it) => (
          <path key={it.id} d={itemPathData(it)} className={`preview-${it.op}`} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}

function InputRow({ input, value, onChange }: { input: DesignInput; value: Values[string]; onChange: (v: Values[string]) => void }) {
  const id = `lib-${input.key}`;
  return (
    <div className="library-input">
      {input.kind === "toggle" ? (
        <label className="library-toggle">
          <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {input.label}
        </label>
      ) : (
        <>
          <label htmlFor={id}>{input.label}</label>
          {input.kind === "text" ? (
            input.multiline ? (
              <textarea id={id} className="library-words" rows={Math.min(4, Math.max(2, String(value ?? "").split("\n").length))} value={String(value ?? "")} maxLength={200} onChange={(e) => onChange(e.target.value)} />
            ) : (
              <input id={id} className="library-words" value={String(value ?? "")} maxLength={200} onChange={(e) => onChange(e.target.value)} />
            )
          ) : input.kind === "choice" || input.kind === "font" ? (
            <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
              {input.choices?.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="library-number">
              <input id={id} inputMode="decimal" value={String(value ?? "")} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
              {input.unit && <span className="muted">{input.unit}</span>}
            </span>
          )}
        </>
      )}
      {input.help && <p className="muted small">{input.help}</p>}
    </div>
  );
}

export function LibraryDialog() {
  const doc = useDocument();
  const openDialog = useStore((s) => s.openDialog);
  const [search, setSearch] = useState("");
  const [design, setDesign] = useState<LibraryDesign | null>(null);
  const [values, setValues] = useState<Values>({});
  const found = useMemo(() => searchDesigns(search), [search]);
  const groups = useMemo(() => groupDesigns(LIBRARY), []);

  const problems = design ? designProblems(design, doc.material, values) : [];
  // Numbers are kept as typed ("1." on the way to "1.5"); a box left empty or not a number is a problem, not a 0.
  const isNumber = (i: DesignInput) => i.kind === "number" || i.kind === "count";
  const unfinished = design ? design.inputs(doc.material).filter((i) => isNumber(i) && (String(values[i.key] ?? "").trim() === "" || !Number.isFinite(Number(values[i.key])))) : [];
  const ok = !!design && !problems.length && !unfinished.length;
  const made = useMemo(() => (design && ok ? makeDesign(design, doc.material, values, doc.items.map((it) => it.id)) : null), [design, ok, values, doc.material, doc.items]);

  const close = () => openDialog(null);
  const pick = (d: LibraryDesign) => {
    setDesign(d);
    setValues(defaultValues(d, doc.material));
  };
  const insert = () => {
    if (!design || !made || !made.items.length) return;
    const s = useStore.getState();
    s.addItems(made.items);
    close();
    s.requestFit();
    s.showToast(`Put ${design.name.toLowerCase()} on the bed (${made.items.length} ${made.items.length === 1 ? "shape" : "shapes"}).${made.notes.length ? ` ${made.notes.join(" ")}` : ""}`, "success");
  };

  if (!design) {
    return (
      <Modal title="Design library" onClose={close} width={720}>
        <p className="small">Ready-made designs you can size to suit. Each is put on the bed as ordinary shapes, so you can move, change or export them like anything you'd drawn yourself.</p>
        <input className="library-search" type="search" placeholder="Search the library (box, gear, stencil…)" aria-label="Search the library" value={search} spellCheck={false} onChange={(e) => setSearch(e.target.value)} />
        {search.trim() ? (
          <section aria-live="polite">
            <h3 className="library-heading">{found.length === 0 ? "Nothing found" : `Found ${found.length} design${found.length > 1 ? "s" : ""}`}</h3>
            {found.length === 0 ? (
              <p className="muted small">Try another word, or clear the search to see every design.</p>
            ) : (
              <div className="library-grid">
                {found.map((d) => (
                  <DesignCard key={d.id} design={d} onPick={pick} />
                ))}
              </div>
            )}
          </section>
        ) : (
          groups.map((g) => (
            <div key={g.group}>
              <h4 className="library-group">{g.group}</h4>
              <div className="library-grid">
                {g.designs.map((d) => (
                  <DesignCard key={d.id} design={d} onPick={pick} />
                ))}
              </div>
            </div>
          ))
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title={design.name}
      onClose={close}
      width={760}
      footer={
        <>
          <button type="button" className="text-button" onClick={() => setValues(defaultValues(design, doc.material))} style={{ marginRight: "auto" }}>
            Usual sizes
          </button>
          <button type="button" className="text-button" onClick={() => setDesign(null)}>
            Back
          </button>
          <button type="button" className="primary-button" onClick={insert} disabled={!made || !made.items.length} title={ok ? undefined : "Fix the sizes shown in red first"}>
            Put on the bed
          </button>
        </>
      }
    >
      <p className="small">{design.description}</p>
      <div className="library-form">
        <div className="library-inputs">
          {design.inputs(doc.material).map((i) => (
            <InputRow key={`${design.id}-${i.key}`} input={i} value={values[i.key]} onChange={(v) => setValues({ ...values, [i.key]: v })} />
          ))}
        </div>
        <div className="library-side">
          <Preview items={made?.items ?? null} name={design.name} />
          {made?.notes.map((note) => (
            <p key={note} className="small">
              {note}
            </p>
          ))}
          {unfinished.map((i) => (
            <p key={i.key} className="error-text small">
              {i.label}: type a number.
            </p>
          ))}
          {problems.map((p) => (
            <p key={p} className="error-text small">
              {p}
            </p>
          ))}
        </div>
      </div>
    </Modal>
  );
}
