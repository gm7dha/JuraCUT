/**
 * JuraCUT's end of the link with JuraCAD (src/link/juraLink.ts): started once by App; designs JuraCAD sends (SVG, its
 * laser layers as colours) are put on the bed like an import; `sendToJuraCAD` hands a design to JuraCAD as a DXF,
 * which it makes into a sketch.
 */
import { importDrawing } from "../model/importFile";
import { useStore } from "../model/store";
import { APP_LABEL, LINK_CHANNEL, LinkEnd, siblingUrl, type Parcel, type Received } from "../link/juraLink";

let link: LinkEnd | null = null;
let opened: string | null | undefined;

/** The parcel this tab was opened for (`?link=`), read once and then taken out of the address (React may start twice). */
function openedFor(): string | null {
  if (opened !== undefined) return opened;
  const url = new URL(window.location.href);
  opened = url.searchParams.get("link");
  if (opened) {
    url.searchParams.delete("link");
    window.history.replaceState(null, "", url.toString());
  }
  return opened;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A design from JuraCAD onto the bed: one shape per op, selected, the view fitted. */
export function receiveParcel(p: Parcel): Received {
  const s = useStore.getState();
  const doc = s.history.present;
  const file = `${p.name || "From JuraCAD"}.${p.kind}`;
  const made = importDrawing(p.content, file, doc.items.map((it) => it.id), { bed: doc.bed });
  if (s.dialog) s.openDialog(null);
  s.setTool("select");
  s.addItems(made.items, { select: true });
  s.requestFit();
  s.showToast(`From ${APP_LABEL[p.from]}: ${made.summary.replace(file, p.name || "the design")}`, "success");
  return { ok: true, message: `"${p.name}" is on JuraCUT's bed.` };
}

/** Open the link (once). Does nothing where the browser has no BroadcastChannel. */
export function startLink(): () => void {
  if (link || typeof BroadcastChannel === "undefined") return () => undefined;
  const waitingFor = openedFor();
  link = new LinkEnd({
    app: "juracut",
    waitingFor,
    receive: receiveParcel,
    env: {
      channel: new BroadcastChannel(LINK_CHANNEL),
      now: () => Date.now(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (t) => window.clearTimeout(t as number),
      openTab: (to, id) => window.open(siblingUrl(import.meta.env.BASE_URL, window.location.origin, to, id), "_blank"),
      newId: randomId,
    },
  });
  const shown = () => document.visibilityState === "visible" && link?.wake();
  const bye = () => link?.close();
  document.addEventListener("visibilitychange", shown);
  window.addEventListener("pagehide", bye);
  return () => {
    document.removeEventListener("visibilitychange", shown);
    window.removeEventListener("pagehide", bye);
    link?.close();
    link = null;
  };
}

/** Send a design (DXF text) to JuraCAD: into a tab of it that's open, or a new one. Call straight from the click. */
export async function sendToJuraCAD(name: string, dxf: string): Promise<boolean> {
  const s = useStore.getState();
  if (!link) {
    s.showToast("This browser can't pass designs between JuraCUT and JuraCAD. Save a DXF and insert it into a sketch in JuraCAD instead.", "error");
    return false;
  }
  const r = await link.send("juracad", name, "dxf", dxf);
  useStore.getState().showToast(r.ok ? `Sent to JuraCAD. ${r.message}` : r.message, r.ok ? "success" : "error");
  return r.ok;
}
