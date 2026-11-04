import { useEffect, useState } from "react";

import { useDocument, useStore } from "../model/store";
import { SHORT_VERSION } from "../version";
import { Icons } from "./icons";
import { forgetFile, openFromFile, saveToFile } from "./fileActions";
import { browserKind, installApp, installSteps, isInstalledApp, useCanInstall } from "./install";
import { Modal } from "./Modal";
import { setThemeChoice, themeChoice, type ThemeChoice } from "./theme";
import { versionIsNew } from "./WhatsNewDialog";
import { detectPlatform, shortcut } from "./platform";
import { useMaterials } from "./materialsState";
import { findMaterial, materialForDesign } from "../model/materials";

export function TopBar() {
  const doc = useDocument();
  const renameDocument = useStore((s) => s.renameDocument);
  /** A dot on the version until its changes have been looked at. */
  const [fresh, setFresh] = useState(versionIsNew);
  const openDialog = useStore((s) => s.openDialog);
  const newDocument = useStore((s) => s.newDocument);
  const hasShapes = doc.items.length > 0;
  const storageProblem = useStore((s) => s.storageProblem);
  const fileName = useStore((s) => s.fileName);
  const unsaved = useStore((s) => s.savedDoc !== s.history.present && s.history.present.items.length > 0);
  const platform = detectPlatform();
  const canInstall = useCanInstall();
  const [installHelp, setInstallHelp] = useState(false);
  const installed = isInstalledApp();
  const [name, setName] = useState(doc.name);

  useEffect(() => setName(doc.name), [doc.name]);

  return (
    <header className="topbar">
      <div className="brand" title="JuraCUT">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={24} height={24} />
        <span>JuraCUT</span>
      </div>
      <input
        className="doc-name"
        value={name}
        aria-label="Design name"
        title="Click to rename"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => (name.trim() ? renameDocument(name) : setName(doc.name))}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setName(doc.name);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {storageProblem && (
        <button type="button" className="save-state storage-problem" title={storageProblem} onClick={() => useStore.getState().showToast(storageProblem, "error")}>
          Not kept in this browser
        </button>
      )}
      <span
        className={`save-state${unsaved ? " unsaved" : ""}`}
        title={unsaved ? "Your work is kept in this browser, but has changes not yet saved to a file. Click Save to keep a copy on your computer." : fileName ? `Saved to ${fileName}` : ""}
      >
        {unsaved ? (fileName ? "Unsaved changes" : "Not saved to a file") : fileName ? `Saved · ${fileName}` : ""}
      </span>
      <button
        type="button"
        className={`phase-badge${fresh ? " fresh" : ""}`}
        onClick={() => {
          setFresh(false);
          openDialog("whatsNew");
        }}
        title="Your JuraCUT version — click to see what's new"
      >
        {SHORT_VERSION}
        <span className="badge-extra"> preview</span>
        {fresh && <span className="badge-dot" aria-label="(new)" />}
      </button>
      <div className="topbar-spacer" />
      {!installed && (
        <button className="text-button" onClick={() => (canInstall ? void installApp() : setInstallHelp(true))} title="Install JuraCUT as an app on this computer — it then opens in its own window and works offline">
          <Icons.Export size={18} style={{ transform: "rotate(180deg)" }} /> <span className="button-label">Install</span>
        </button>
      )}
      <button
        className="text-button"
        onClick={() => {
          if (!hasShapes || window.confirm("Start a new, empty design? (You can undo this.)")) {
            newDocument();
            forgetFile();
          }
        }}
        title="Start a new, empty design"
      >
        <Icons.New size={18} /> <span className="button-label">New</span>
      </button>
      <button className="text-button" onClick={() => void openFromFile()} title={`Open a .juracut design (${shortcut(platform, "O")}). You can also drag a file onto the window.`}>
        <Icons.Open size={18} /> <span className="button-label">Open</span>
      </button>
      <button className="text-button" onClick={() => void openFromFile(true)} title="Bring an SVG or DXF drawing in as shapes on the bed (from JuraCAD, Inkscape, or anywhere else), or a picture (PNG, JPG…) to trace into outlines">
        <Icons.Import size={18} /> <span className="button-label">Import</span>
      </button>
      <button
        className="text-button"
        onClick={() => void saveToFile()}
        title={`Save to a .juracut file on your computer (${shortcut(platform, "S")}). ${shortcut(platform, "S", { shift: true })} saves a copy under a new name.`}
      >
        <Icons.Save size={18} /> <span className="button-label">Save</span>
      </button>
      <button className="primary-button" onClick={() => openDialog("export")} disabled={!hasShapes} title="Save an SVG or DXF for Bambu Studio's laser mode">
        <Icons.Laser size={18} /> <span className="button-label">Export for laser</span>
      </button>
      <SettingsMenu />
      <button className="icon-button" onClick={() => openDialog("help")} aria-label="Help and shortcuts" title="Help and shortcuts (?)">
        <Icons.Help />
      </button>
      {installHelp && (
        <Modal title="Install JuraCUT as an app" onClose={() => setInstallHelp(false)} width={480}>
          <p>Installed, JuraCUT opens in its own window, has its own icon, and works without an internet connection.</p>
          <ol className="install-steps">
            {installSteps(browserKind()).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Modal>
      )}
    </header>
  );
}

/** Settings: the bed and material (saved with the design) and appearance (kept on this computer). */
function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const doc = useDocument();
  const [choice, setChoice] = useState<ThemeChoice>(themeChoice);
  const materials = useMaterials();
  const inLibrary = findMaterial(materials, doc.material);
  // The menu is placed on the page itself (fixed), so the top bar's edge can't cut it off.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(".settings-menu, .settings-button")) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const s = useStore.getState;
  const numberField = (label: string, value: number, onCommit: (v: number) => void, unit = "mm") => (
    <label className="field">
      <span>{label}</span>
      <span className="field-input">
        <input
          type="number"
          step="any"
          defaultValue={value}
          key={`${label}-${value}`}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 0 && v !== value) onCommit(v);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <span className="unit">{unit}</span>
      </span>
    </label>
  );
  return (
    <div className="settings-wrap">
      <button
        className={`icon-button settings-button${open ? " active" : ""}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
          setOpen(!open);
        }}
        aria-label="Settings"
        aria-expanded={open}
        title="Settings — bed size, material, light or dark"
      >
        <Icons.Settings />
      </button>
      {open && (
        <div className="settings-menu" role="dialog" aria-label="Settings" style={at ? { top: at.top, right: at.right } : undefined}>
          <div className="field-label">Bed (this design)</div>
          <div className="field-row">
            {numberField("Width", doc.bed[0], (w) => w > 0 && s().setBed([w, doc.bed[1]]))}
            {numberField("Depth", doc.bed[1], (h) => h > 0 && s().setBed([doc.bed[0], h]))}
          </div>
          <p className="dialog-hint">The Bambu Lab R1's work area is 600 × 300 mm.</p>
          <div className="field-label settings-gap">Material (this design)</div>
          <label className="field">
            <span>From your list</span>
            <select
              value={inLibrary ? inLibrary.name : "__own__"}
              onChange={(e) => {
                const m = materials.find((x) => x.name === e.target.value);
                if (m) s().setMaterial(materialForDesign(m));
              }}
            >
              {!inLibrary && <option value="__own__">{doc.material.name} (this design's own)</option>}
              {materials.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} — kerf {m.kerf} mm
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            {numberField("Thickness", doc.material.thickness, (thickness) => s().setMaterial({ ...doc.material, thickness }))}
            {numberField("Kerf", doc.material.kerf, (kerf) => s().setMaterial({ ...doc.material, kerf }))}
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setOpen(false);
              useStore.getState().openDialog("material");
            }}
            title="Add, change or remove materials, with notes (kept on this computer)"
          >
            Materials…
          </button>
          <p className="dialog-hint">Kerf is how wide a cut the beam leaves. Export for laser can move cut lines out by half of it, so pieces come out the size you drew.</p>
          <div className="field-label settings-gap">Appearance (this computer)</div>
          <div className="segmented three" role="radiogroup" aria-label="Appearance">
            {(
              [
                ["light", "Light"],
                ["dark", "Dark"],
                ["system", "Automatic"],
              ] as const
            ).map(([c, label]) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={choice === c}
                className={choice === c ? "selected" : ""}
                title={c === "system" ? "Follow your computer's light or dark setting" : undefined}
                onClick={() => {
                  setThemeChoice(c);
                  setChoice(c);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
