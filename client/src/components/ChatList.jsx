import { useState } from "react";
import { ADDR, AI, FAUCET, createGroup, groupEventText, hasCard, isGroup, preview, short, when } from "../sealr.js";
import { Avatar, Icon, Sheet, copyText, useApp } from "./ui.jsx";

export default function ChatList({ active, setActive }) {
  const { me, msgs, groups, status, welcome, nameOf, unread, activate, refresh, notify } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sheet, setSheet] = useState(null);

  const latest = {};
  for (const m of msgs) if (m.peer !== AI && (!latest[m.peer] || latest[m.peer].ts < m.ts)) latest[m.peer] = m;
  for (const g of Object.keys(groups)) latest[g] ??= { peer: g, ts: 0, payload: { type: "text", text: "" } };
  let rows = Object.values(latest).sort((a, b) => b.ts - a.ts);
  if (filter === "people") rows = rows.filter(r => !isGroup(r.peer));
  if (filter === "groups") rows = rows.filter(r => isGroup(r.peer));
  if (q.trim()) rows = rows.filter(r => `${nameOf(r.peer)} ${r.peer}`.toLowerCase().includes(q.trim().toLowerCase()));
  const aiLast = msgs.filter(m => m.peer === AI).sort((a, b) => b.ts - a.ts)[0];
  const lastText = r => {
    if (!r.payload.text && r.payload.type === "text" && !r.ts) return "Group created";
    if (r.payload.type === "group") return groupEventText(r.payload, a => a === me.address ? "You" : nameOf(a));
    const who = r.mine ? "You: " : isGroup(r.peer) ? `${nameOf(r.payload.from).split(" ")[0]}: ` : "";
    return who + preview(r.payload);
  };

  return <>
    <div className="list-head">
      <h1>Chats</h1>
      <button className="icon-btn" title="New" onClick={() => setSheet("menu")}><Icon name="edit" /></button>
    </div>
    <div className="search"><Icon name="search" className="i sm" /><input className="field" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="filters">
      {[["all", "All"], ["people", "People"], ["groups", "Groups"]].map(([id, label]) =>
        <button key={id} className={`chip${filter === id ? " on" : ""}`} onClick={() => setFilter(id)}>{label}</button>)}
    </div>

    <div className="chats">
      {status && !status.ready && <Setup status={status} me={me} activate={activate} refresh={refresh} notify={notify} openAI={() => setActive(AI)} />}

      {!q && filter === "all" && <button className={`chat-row${active === AI ? " on" : ""}`} onClick={() => setActive(AI)}>
        <Avatar id={AI} />
        <span style={{ minWidth: 0 }}><span className="name"><span>Sealr AI</span><span className="tag">Guide</span></span>
          <span className="last">{aiLast ? `${aiLast.mine ? "You: " : ""}${aiLast.payload.text}` : welcome ? "Welcome to Sealr! Let me show you around 👋" : "Ask me anything about Sealr"}</span></span>
        <span className="meta"><span className="when">{aiLast ? when(aiLast.ts) : welcome ? when(welcome.ts) : ""}</span>
          {welcome && !welcome.read && active !== AI && <><br /><span className="badge" style={{ background: "var(--ai)", color: "#fff" }}>1</span></>}</span>
      </button>}

      {rows.map(r => {
        const n = unread(r.peer);
        return (
          <button key={r.peer} className={`chat-row${active === r.peer ? " on" : ""}`} onClick={() => setActive(r.peer)}>
            <Avatar id={r.peer} name={nameOf(r.peer)} />
            <span style={{ minWidth: 0 }}><span className="name"><span>{nameOf(r.peer)}</span></span><span className="last">{lastText(r)}</span></span>
            <span className="meta"><span className="when">{r.ts ? when(r.ts) : ""}</span>{n > 0 && active !== r.peer && <><br /><span className="badge">{n}</span></>}</span>
          </button>
        );
      })}

      {!rows.length && <div className="empty"><div className="big-ic"><Icon name={filter === "groups" ? "users" : "chat"} /></div>
        {q ? "No chats match your search." : filter === "groups" ? "No groups yet. Create one with the + button." : "No chats yet. Tap + to start one."}</div>}
    </div>

    <button className="fab" aria-label="New chat" onClick={() => setSheet("menu")}><Icon name="plus" /></button>

    {sheet === "menu" && <Sheet title="Start something" onClose={() => setSheet(null)}>
      <div className="menu-list">
        <MenuItem icon="chat" title="New chat" text="Message someone by their qor1 address" onClick={() => setSheet("chat")} />
        <MenuItem icon="users" title="New group" text="Private group with automatic member control" onClick={() => setSheet("group")} />
        <MenuItem icon="spark" title="Ask Sealr AI" text="Get help using the app" ai onClick={() => { setSheet(null); setActive(AI); }} />
      </div>
    </Sheet>}
    {sheet === "chat" && <NewChat close={() => setSheet(null)} onDone={a => { setSheet(null); setActive(a); }} />}
    {sheet === "group" && <NewGroup close={() => setSheet(null)} onDone={g => { setSheet(null); setActive(g); }} />}
  </>;
}

const MenuItem = ({ icon, title, text, onClick, ai }) => (
  <button className="menu-item" onClick={onClick}>
    <span className="ic" style={ai ? { background: "var(--ai-soft)", color: "var(--ai)" } : undefined}><Icon name={icon} /></span>
    <span><b>{title}</b><small>{text}</small></span><Icon name="chev" className="i sm" />
  </button>
);

function Setup({ status, me, activate, refresh, notify, openAI }) {
  const [busy, setBusy] = useState(false);
  const funded = (status.bal.uqor || 0n) > 0n;
  const steps = [["Create your wallet", true], ["Get free test tokens", funded], ["Activate quantum-safe keys", status.ready]];
  const done = steps.filter(s => s[1]).length;
  return (
    <div className="setup">
      <div className="setup-top"><b>Get started</b><span className="faint" style={{ fontSize: 13 }}>{done} of {steps.length}</span></div>
      <div className="progress"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      {steps.map(([label, ok], i) => (
        <div key={i} className={`step${ok ? " done" : ""}`}><span className="ck"><Icon name="check" /></span><span>{label}</span>
          {i === 1 && !ok && <span style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" onClick={() => copyText(me.address, notify)}>Copy address</button>
            <a className="btn sm primary" href={FAUCET} target="_blank" rel="noopener">Faucet</a></span>}
          {i === 2 && !ok && funded && <button className="btn sm primary" disabled={busy} onClick={async () => { setBusy(true); await activate(); setBusy(false); }}>{busy ? "Registering…" : "Activate"}</button>}
          {!(i === 1 && !ok) && !(i === 2 && !ok && funded) && <span />}
        </div>
      ))}
      {!funded && <p className="hint" style={{ margin: "6px 0 0" }}>Claim tokens for your address at the faucet, then <button style={{ color: "var(--accent)", fontWeight: 600 }} onClick={refresh}>check again</button>. Stuck? <button style={{ color: "var(--ai)", fontWeight: 600 }} onClick={openAI}>Ask Sealr AI</button></p>}
    </div>
  );
}

function NewChat({ close, onDone }) {
  const { me, setName } = useApp();
  const [addr, setAddr] = useState(""), [name, setNm] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => {
    const a = addr.trim();
    if (!ADDR.test(a)) return setErr("Paste a full qor1… address");
    if (a === me.address) return setErr("That is your own address");
    setBusy(true);
    if (!(await hasCard(a))) { setBusy(false); return setErr("That address has not activated Sealr yet. Ask them to open Sealr and tap Activate."); }
    if (name.trim()) setName(a, name.trim().slice(0, 40));
    onDone(a);
  };
  return (
    <Sheet title="New chat" onClose={close}>
      <p className="lead">Chats are end-to-end encrypted to the keys your contact registered on QoreChain.</p>
      <label className="label">Their address</label>
      <input className="field mono" autoFocus placeholder="qor1…" autoCapitalize="none" spellCheck={false} value={addr} onChange={e => { setAddr(e.target.value); setErr(""); }} />
      <label className="label">Name (optional, only you see it)</label>
      <input className="field" placeholder="e.g. Amaka" value={name} onChange={e => setNm(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />
      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn primary" disabled={busy} onClick={go}>{busy ? "Checking…" : "Start chat"}</button></div>
    </Sheet>
  );
}

// Contacts are everyone you have a 1-to-1 chat with or have named.
export function useContacts() {
  const { me, msgs, names } = useApp();
  const set = new Set([...msgs.filter(m => !isGroup(m.peer) && m.peer !== AI).map(m => m.peer), ...Object.keys(names)]);
  set.delete(me.address);
  return [...set].filter(a => ADDR.test(a));
}

export function MemberPicker({ picked, setPicked, exclude = [] }) {
  const { nameOf } = useApp();
  const contacts = useContacts().filter(a => !exclude.includes(a));
  const [addr, setAddr] = useState(""), [err, setErr] = useState("");
  const toggle = a => setPicked(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a]);
  const add = async () => {
    const a = addr.trim();
    if (!ADDR.test(a)) return setErr("Paste a full qor1… address");
    if (!(await hasCard(a))) return setErr("That address has not activated Sealr yet");
    if (!picked.includes(a)) setPicked(p => [...p, a]);
    setAddr(""); setErr("");
  };
  const all = [...new Set([...contacts, ...picked])].filter(a => !exclude.includes(a));
  return <>
    {all.length > 0 && <div className="picker">{all.map(a => (
      <button key={a} className={`pick${picked.includes(a) ? " on" : ""}`} onClick={() => toggle(a)}>
        <Avatar id={a} name={nameOf(a)} size="sm" /><span><b style={{ fontWeight: 600 }}>{nameOf(a)}</b><br /><span className="mono faint">{short(a)}</span></span>
        <span className="box"><Icon name="check" /></span>
      </button>
    ))}</div>}
    <label className="label">Add by address</label>
    <div className="addr-in"><input className="field mono" placeholder="qor1…" autoCapitalize="none" spellCheck={false} value={addr} onChange={e => { setAddr(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && add()} />
      <button className="btn" onClick={add}>Add</button></div>
    {err && <div className="err">{err}</div>}
  </>;
}

function NewGroup({ close, onDone }) {
  const { me, poll, notify } = useApp();
  const [name, setName] = useState(""), [picked, setPicked] = useState([]), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const go = async () => {
    if (!name.trim()) return setErr("Give the group a name");
    if (!picked.length) return setErr("Add at least one member");
    setBusy(true);
    try { const id = await createGroup(me, name.trim().slice(0, 60), picked); await poll(); notify("Group created"); onDone(id); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Sheet title="New group" onClose={close}>
      <p className="lead">Every message gets a fresh key, sealed to each current member. People you remove cannot read anything sent after.</p>
      <label className="label">Group name</label>
      <input className="field" autoFocus placeholder="e.g. Hackathon team" value={name} onChange={e => setName(e.target.value)} />
      <label className="label">Members ({picked.length} selected)</label>
      <MemberPicker picked={picked} setPicked={setPicked} />
      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn primary" disabled={busy} onClick={go}><Icon name="users" />{busy ? "Creating…" : "Create group"}</button></div>
    </Sheet>
  );
}
