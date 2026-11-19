import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AI, isGroup, token } from "../sealr.js";

// Everything most screens need: the signed-in account, names, groups, toasts and the data actions.
export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const Icon = ({ name, className = "i", style }) => <svg className={className} style={style}><use href={`#i-${name}`} /></svg>;

const COLORS = [["#2bb59c", "#1a7f6d"], ["#ff8a65", "#e0573a"], ["#7c74ff", "#5148d6"], ["#f2b84b", "#d08d1b"], ["#4ca6ff", "#2a73d6"], ["#ff6f9c", "#d6416f"], ["#5fc46a", "#368f42"], ["#b77cff", "#8248d6"]];
export const colorOf = id => COLORS[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length][0];

export function Avatar({ id, name, size = "" }) {
  if (id === AI) return <div className={`av ai ${size}`}><svg><use href="#i-spark" /></svg></div>;
  if (isGroup(id)) return <div className={`av group ${size}`}><svg><use href="#i-users" /></svg></div>;
  const [a, b] = COLORS[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
  const n = name || "";
  const ini = n.startsWith("qor1") ? n.slice(4, 6).toUpperCase() : n.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return <div className={`av ${size}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>{ini || "?"}</div>;
}

export const Brand = ({ size = 34 }) => <div className="brand"><svg style={{ width: size, height: size }}><use href="#i-logo" /></svg>Sealr</div>;

export function TokenIcon({ denom }) {
  const t = token(denom);
  return <span className="tok-ic" style={{ background: t?.color || "#888" }}>{(t?.sym || "?").slice(0, 4)}</span>;
}

// A bottom sheet on phones, a dialog on wider screens.
export function Sheet({ title, onClose, children, wide, icon }) {
  useEffect(() => {
    const esc = e => e.key === "Escape" && onClose();
    addEventListener("keydown", esc); return () => removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="sheet-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${wide ? " wide" : ""}`} role="dialog" aria-label={title}>
        <div className="grab" />
        <div className="sheet-head">{icon}<h3>{title}</h3><button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button></div>
        {children}
      </div>
    </div>
  );
}

// A one-field sheet. onOk may throw; its message is shown instead of closing.
export function Prompt({ title, lead, label, initial = "", ok = "Save", inputMode = "text", type = "text", onOk, onClose }) {
  const [value, setValue] = useState(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef();
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const go = async () => { setBusy(true); try { await onOk(value); onClose(); } catch (e) { setErr(e.message); } setBusy(false); };
  return (
    <Sheet title={title} onClose={onClose}>
      {lead && <p className="lead">{lead}</p>}
      {label && <label className="label">{label}</label>}
      <input ref={input} className="field" type={type} value={value} inputMode={inputMode} autoComplete="off"
        onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />
      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={go}>{ok}</button></div>
    </Sheet>
  );
}

export async function copyText(text, notify) {
  try { await navigator.clipboard.writeText(text); notify("Copied"); }
  catch {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.append(ta); ta.select();
    try { document.execCommand("copy"); notify("Copied"); } catch { notify(text, 7000); }
    ta.remove();
  }
}

export const Spinner = () => <span className="typing"><i /><i /><i /></span>;
