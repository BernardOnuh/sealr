import { useEffect, useRef, useState } from "react";
import { EXPLORER, MAX_FILE, TOKENS, changeGroup, fileToBase64, fromBase, groupEventText, isGroup, sendTo, sendTokens, short, toBase, token } from "../sealr.js";
import { Avatar, Icon, Prompt, Sheet, Spinner, TokenIcon, colorOf, copyText, useApp } from "./ui.jsx";
import { MemberPicker } from "./ChatList.jsx";
import Spy from "./Spy.jsx";

const SAFE_IMG = /^image\/(png|jpeg|gif|webp)$/;
const time = ts => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dayLabel = ts => {
  const d = new Date(ts), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  return d.toDateString() === now.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
};

function eventNote(p, me) {
  const hitsMe = [].concat(p.target || []).includes(me);
  if (p.action === "add") return hitsMe ? " · you see messages from now on" : " · they see messages from now on";
  if (p.action === "remove") return hitsMe ? " · you can't read new messages" : " · nothing new is sealed to them";
  if (p.action === "leave") return " · nothing new is sealed to them";
  return "";
}

export default function Conversation({ id, back }) {
  const { me, msgs, groups, verified, nameOf, poll, refresh, notify } = useApp();
  const group = isGroup(id) ? groups[id] : null;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [attach, setAttach] = useState(false);
  const [sheet, setSheet] = useState(null);
  const box = useRef(), ta = useRef(), photo = useRef(), file = useRef();
  const list = msgs.filter(m => m.peer === id).sort((a, b) => a.ts - b.ts);
  const paidFor = Object.fromEntries(list.filter(m => m.payload.type === "pay" && m.payload.re).map(m => [m.payload.re, m]));

  const toBottom = () => { if (box.current) box.current.scrollTop = box.current.scrollHeight; };
  useEffect(toBottom, [list.length, id]);
  useEffect(() => { const t = ta.current; if (t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; } }, [text]);

  const run = async (label, fn) => {
    setBusy(label);
    try { await fn(); await poll(); return true; } catch (e) { notify(e.message, 5000); return false; } finally { setBusy(""); }
  };
  const send = body => sendTo(me, id, body, groups);
  const sendText = async () => {
    const t = text.trim(); if (!t || busy) return;
    setText("");
    if (!(await run("Sealing and signing…", () => send({ type: "text", text: t })))) setText(t);
  };
  const sendFile = async f => {
    setAttach(false);
    if (!f) return;
    if (f.size > MAX_FILE) return notify("Files up to 2 MB for now");
    const data = await fileToBase64(f);
    await run(`Encrypting ${f.name}…`, () => send({ type: "file", file: { name: f.name, mime: f.type, size: f.size, data } }));
  };
  const pay = async ({ to, denom, amount, re }) => {
    const t = token(denom), base = toBase(amount, t.dec);
    if (base <= 0n) throw new Error("Enter an amount");
    return run("Signing the transfer with ML-DSA-87…", async () => {
      const tx = await sendTokens(me, to, denom, base);
      await send({ type: "pay", amount: String(amount), sym: t.sym, denom, tx, payee: to, re });
      refresh();
    });
  };

  const left = group?.left;
  const sub = group ? `${group.members.length} members · sealed per message` : "Quantum-safe · verified";

  return <>
    <div className="conv-head">
      <button className="icon-btn back" aria-label="Back" onClick={back}><Icon name="back" /></button>
      <Avatar id={id} name={nameOf(id)} size="sm" />
      <div className="who" onClick={() => setSheet("info")}>
        <b>{nameOf(id)}</b>
        <div className="sub"><Icon name="shield" />{sub}</div>
      </div>
      <button className="icon-btn" title="What an eavesdropper sees" onClick={() => setSheet("spy")}><Icon name="eye" /></button>
      <button className="icon-btn" title="Info" onClick={() => setSheet("info")}><Icon name="info" /></button>
    </div>

    <div className="msgs" ref={box}>
      {!list.length && <div className="welcome-card"><div className="big-ic"><Icon name="lock" /></div>
        <h3>Sealed end to end</h3>Only {group ? "the members of this group" : `you and ${nameOf(id)}`} can read this chat, today and after Q-Day. Say hello.</div>}
      {list.map((m, i) => {
        const prev = list[i - 1], next = list[i + 1];
        const day = (!prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString()) && <div className="day">{dayLabel(m.ts)}</div>;
        if (m.payload.type === "group") return <div key={m.id} style={{ display: "contents" }}>{day}
          <div className="sys"><Icon name="key" />{groupEventText(m.payload, a => a === me.address ? "You" : nameOf(a))}{eventNote(m.payload, me.address)}</div></div>;
        const sameAsPrev = prev && prev.payload.from === m.payload.from && prev.payload.type !== "group" && m.ts - prev.ts < 5 * 60e3 && !day;
        const sameAsNext = next && next.payload.from === m.payload.from && next.payload.type !== "group" && next.ts - m.ts < 5 * 60e3 && new Date(next.ts).toDateString() === new Date(m.ts).toDateString();
        const v = verified[m.id];
        const showAv = group && !m.mine;
        return <div key={m.id} style={{ display: "contents" }}>{day}
          <div className={`row${m.mine ? " mine" : ""}${sameAsPrev ? "" : " first"}${sameAsNext ? "" : " last"}`}>
            {showAv && (sameAsNext ? <span className="av-gap" /> : <Avatar id={m.payload.from} name={nameOf(m.payload.from)} size="xs" />)}
            <div className="bubble">
              {showAv && !sameAsPrev && <div className="from" style={{ color: colorOf(m.payload.from) }}>{nameOf(m.payload.from)}</div>}
              <Content m={m} me={me} nameOf={nameOf} paidFor={paidFor} onMedia={toBottom} onPay={req => setSheet({ pay: req })} />
              <div className="meta">{time(m.ts)}
                {v === true && <span className="ok" title="Signature verified against the sender's ML-DSA-87 key on QoreChain"><Icon name="check" /></span>}
                {v === false && <span className="no" title="Signature did not verify: do not trust this message"><Icon name="alert" /></span>}
              </div>
            </div>
          </div></div>;
      })}
    </div>

    {busy && <div className="busy"><Spinner />{busy}</div>}
    {left ? <div className="locked-bar">You are no longer a member of this group. New messages are not sealed to you.</div> : <>
      {attach && <div className="attach">
        <button onClick={() => photo.current.click()}><span className="ic" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="image" /></span>Photo</button>
        <button onClick={() => file.current.click()}><span className="ic" style={{ background: "var(--ai-soft)", color: "var(--ai)" }}><Icon name="file" /></span>File</button>
        <button onClick={() => { setAttach(false); setSheet("money"); }}><span className="ic" style={{ background: "var(--money-soft)", color: "var(--money)" }}><Icon name="coin" /></span>Money</button>
      </div>}
      <div className="composer">
        <button className={`plus${attach ? " open" : ""}`} aria-label="Attach" onClick={() => setAttach(a => !a)}><Icon name="plus" /></button>
        <input type="file" accept="image/*" ref={photo} hidden onChange={e => { const f = e.target.files[0]; e.target.value = ""; sendFile(f); }} />
        <input type="file" ref={file} hidden onChange={e => { const f = e.target.files[0]; e.target.value = ""; sendFile(f); }} />
        <textarea ref={ta} className="field" rows={1} placeholder="Message" value={text} onFocus={() => setAttach(false)} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(max-width:820px)").matches) { e.preventDefault(); sendText(); } }} />
        <button className="send" aria-label="Send" disabled={!text.trim() || !!busy} onClick={sendText}><Icon name="send" /></button>
      </div>
    </>}

    {sheet === "spy" && <Spy close={() => setSheet(null)} />}
    {sheet === "info" && (group ? <GroupInfo group={group} close={() => setSheet(null)} /> : <ContactInfo id={id} close={() => setSheet(null)} />)}
    {sheet === "money" && <MoneySheet group={group} peer={id} close={() => setSheet(null)}
      onSend={async v => { setSheet(null); await pay(v); }}
      onRequest={async v => { setSheet(null); await run("Sending the request…", () => send({ type: "request", ...v })); }} />}
    {sheet?.pay && <PayRequest req={sheet.pay} close={() => setSheet(null)} onPay={async () => {
      const r = sheet.pay; setSheet(null); await pay({ to: r.payload.from, denom: r.payload.denom || "uqor", amount: r.payload.amount, re: r.id });
    }} />}
  </>;
}

function Content({ m, me, nameOf, paidFor, onMedia, onPay }) {
  const p = m.payload;
  if (p.type === "file") {
    const img = SAFE_IMG.test(p.file.mime);
    const url = `data:${img ? p.file.mime : "application/octet-stream"};base64,${p.file.data}`;
    return img ? <img src={url} alt={p.file.name} onLoad={onMedia} />
      : <a className="file" href={url} download={p.file.name}><span className="fi"><Icon name="file" /></span>
          <span><b>{p.file.name}</b><span className="faint" style={{ fontSize: 12 }}>{(p.file.size / 1024).toFixed(1)} KB · sealed</span></span></a>;
  }
  if (p.type === "pay") return (
    <div className="money-card"><div className="top"><span className="coin"><Icon name="up" /></span>
      <span><div className="amt">{p.amount} {p.sym || "QOR"}</div>
        <div className="what">{m.mine ? `You sent${p.payee ? ` to ${nameOf(p.payee)}` : ""}` : p.payee === me.address ? "Sent to you" : `Sent to ${nameOf(p.payee)}`}</div></span></div>
      <div className="act"><a href={`${EXPLORER}/tx/${p.tx}`} target="_blank" rel="noopener">View on explorer ↗</a></div></div>
  );
  if (p.type === "request") {
    const paid = paidFor[m.id];
    return (
      <div className="money-card"><div className="top"><span className="coin"><Icon name="hand" /></span>
        <span><div className="amt">{p.amount} {p.sym || "QOR"}</div><div className="what">{m.mine ? "You requested" : `${nameOf(p.from)} requests`}</div></span></div>
        {p.note && <div className="note">{p.note}</div>}
        {paid ? <div className="paid"><Icon name="check" className="i sm" />Paid by {paid.mine ? "you" : nameOf(paid.payload.from)}</div>
          : !m.mine && <div className="act"><button className="btn money sm" onClick={() => onPay(m)}>Pay {p.amount} {p.sym || "QOR"}</button></div>}
      </div>
    );
  }
  return <div className="text">{p.text}</div>;
}

function MoneySheet({ group, peer, close, onSend, onRequest }) {
  const { me, status, nameOf } = useApp();
  const [mode, setMode] = useState("send");
  const [denom, setDenom] = useState("uqor");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [to, setTo] = useState(group ? group.members.find(a => a !== me.address) : peer);
  const [err, setErr] = useState("");
  const t = token(denom), bal = status?.bal?.[denom] || 0n;
  const go = async () => {
    try {
      const base = toBase(amount, t.dec);
      if (base <= 0n) throw new Error("Enter an amount");
      if (mode === "send" && base > bal) throw new Error(`You have ${fromBase(bal, t.dec)} ${t.sym}`);
      mode === "send" ? await onSend({ to, denom, amount: amount.trim() }) : await onRequest({ denom, sym: t.sym, amount: amount.trim(), note: note.trim().slice(0, 140) });
    } catch (e) { setErr(e.message); }
  };
  return (
    <Sheet title={mode === "send" ? "Send money" : "Request money"} onClose={close}>
      <div className="filters" style={{ padding: 0, margin: "4px 0 10px" }}>
        <button className={`chip${mode === "send" ? " on" : ""}`} onClick={() => setMode("send")}>Send</button>
        <button className={`chip${mode === "request" ? " on" : ""}`} onClick={() => setMode("request")}>Request</button>
      </div>
      {mode === "send" && group && <><label className="label">To</label>
        <select className="field" value={to} onChange={e => setTo(e.target.value)}>{group.members.filter(a => a !== me.address).map(a => <option key={a} value={a}>{nameOf(a)}</option>)}</select></>}
      <div className="swap-box" style={{ marginTop: 12 }}>
        <div className="top"><span>Amount</span>{mode === "send" && <button onClick={() => setAmount(fromBase(bal, t.dec, t.dec).replace(/,/g, ""))}>Balance {fromBase(bal, t.dec, 4)}</button>}</div>
        <div className="line"><input autoFocus inputMode="decimal" placeholder="0" value={amount} onChange={e => { setAmount(e.target.value.replace(",", ".")); setErr(""); }} />
          <TokenSelect value={denom} onChange={setDenom} /></div>
      </div>
      {mode === "request" && <><label className="label">What is it for? (optional)</label><input className="field" placeholder="Dinner on Friday" value={note} onChange={e => setNote(e.target.value)} /></>}
      <p className="hint">{mode === "send" ? "A real QoreChain transfer, signed with secp256k1 + ML-DSA-87. The amount is public on chain; the chat stays private." : "Sends a payment request into the chat. They can pay it with one tap."}</p>
      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn money" onClick={go}><Icon name={mode === "send" ? "up" : "hand"} />{mode === "send" ? `Send ${t.sym}` : "Send request"}</button></div>
    </Sheet>
  );
}

export function TokenSelect({ value, onChange, options = TOKENS }) {
  const t = token(value);
  return <span className="tok-select"><TokenIcon denom={value} />{t.sym}<Icon name="down" className="i sm" />
    <select value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.denom} value={o.denom}>{o.sym}</option>)}</select></span>;
}

function PayRequest({ req, close, onPay }) {
  const { nameOf } = useApp();
  const p = req.payload;
  return (
    <Sheet title="Pay request" onClose={close}>
      <div className="hero-av"><Avatar id={p.from} name={nameOf(p.from)} size="lg" /><b>{p.amount} {p.sym || "QOR"}</b><span className="dim" style={{ display: "block" }}>to {nameOf(p.from)}</span></div>
      {p.note && <p className="lead" style={{ textAlign: "center" }}>"{p.note}"</p>}
      <p className="hint" style={{ textAlign: "center" }}>Sent as a hybrid-signed QoreChain transfer to {short(p.from)}.</p>
      <div className="actions"><button className="btn" onClick={close}>Cancel</button><button className="btn money" onClick={onPay}>Pay now</button></div>
    </Sheet>
  );
}

function ContactInfo({ id, close }) {
  const { names, setName, notify } = useApp();
  const [edit, setEdit] = useState(false);
  return <>
    <Sheet title="Contact" onClose={close}>
      <div className="hero-av"><Avatar id={id} name={names[id] || id} size="lg" /><b>{names[id] || "Unnamed contact"}</b><span className="mono">{id}</span></div>
      <div className="menu-list">
        <button className="menu-item" onClick={() => setEdit(true)}><span className="ic"><Icon name="edit" /></span><span><b>{names[id] ? "Rename" : "Add a name"}</b><small>Only you see it</small></span><Icon name="chev" className="i sm" /></button>
        <button className="menu-item" onClick={() => copyText(id, notify)}><span className="ic"><Icon name="copy" /></span><span><b>Copy address</b><small>To send them tokens or share the contact</small></span><Icon name="chev" className="i sm" /></button>
        <a className="menu-item" href={`${EXPLORER}/account/${id}`} target="_blank" rel="noopener" style={{ textDecoration: "none" }}><span className="ic"><Icon name="key" /></span><span><b>Their keys on QoreChain</b><small>ML-DSA-87 signing and ML-KEM-1024 encryption keys</small></span><Icon name="ext" className="i sm" /></a>
      </div>
    </Sheet>
    {edit && <Prompt title="Contact name" label="Name" initial={names[id] || ""} onOk={v => setName(id, v.trim().slice(0, 40))} onClose={() => setEdit(false)} />}
  </>;
}

function GroupInfo({ group, close }) {
  const { me, nameOf, poll, notify } = useApp();
  const [view, setView] = useState("main");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const admin = group.admin === me.address;
  const act = async (action, opts, done) => {
    setBusy(true);
    try { await changeGroup(me, group, action, opts); await poll(); notify(done); } catch (e) { notify(e.message, 5000); }
    setBusy(false);
  };
  if (view === "rename") return <Prompt title="Rename group" label="Group name" initial={group.name} onClose={() => setView("main")}
    onOk={v => { if (!v.trim()) throw new Error("Enter a name"); return act("rename", { name: v.trim().slice(0, 60) }, "Group renamed"); }} />;
  if (view === "add") return (
    <Sheet title="Add members" onClose={() => setView("main")}>
      <p className="lead">New members can read messages sent from now on, not earlier ones.</p>
      <MemberPicker picked={picked} setPicked={setPicked} exclude={group.members} />
      <div className="actions"><button className="btn primary" disabled={busy || !picked.length} onClick={async () => {
        await act("add", { target: picked }, `${picked.length === 1 ? nameOf(picked[0]) : `${picked.length} people`} added`);
        setPicked([]); setView("main");
      }}>{busy ? "Adding…" : `Add ${picked.length || ""}`}</button></div>
    </Sheet>
  );
  return (
    <Sheet title="Group" onClose={close}>
      <div className="hero-av"><Avatar id={group.id} size="lg" /><b>{group.name}</b><span className="dim" style={{ display: "block" }}>{group.members.length} members · admin {nameOf(group.admin)}</span></div>
      <div className="note-bar" style={{ textAlign: "left", padding: "0 0 8px" }}>Each message is sealed with a fresh key for every current member (ML-KEM-1024 + X25519). Removed members cannot read anything sent after.</div>
      {admin && !group.left && <div className="menu-list" style={{ marginBottom: 10 }}>
        <button className="menu-item" onClick={() => setView("add")}><span className="ic"><Icon name="user-plus" /></span><span><b>Add members</b><small>From your contacts or by address</small></span><Icon name="chev" className="i sm" /></button>
        <button className="menu-item" onClick={() => setView("rename")}><span className="ic"><Icon name="edit" /></span><span><b>Rename group</b><small>{group.name}</small></span><Icon name="chev" className="i sm" /></button>
      </div>}
      <div className="eyebrow" style={{ marginTop: 8 }}>Members</div>
      <div className="members">{group.members.map(a => (
        <div key={a} className="member"><Avatar id={a} name={nameOf(a)} size="sm" />
          <span><b style={{ fontWeight: 600 }}>{nameOf(a)}</b>{a === group.admin && <span className="tag" style={{ color: "var(--accent)", background: "var(--accent-soft)" }}>Admin</span>}<small className="mono">{short(a)}</small></span>
          {admin && a !== me.address && !group.left ? <button className="icon-btn" title="Remove" disabled={busy} onClick={() => act("remove", { target: a }, `${nameOf(a)} removed · new messages are not sealed to them`)}><Icon name="user-x" /></button> : <span />}
        </div>
      ))}</div>
      {!group.left && !admin && <div className="actions"><button className="btn danger block" disabled={busy} onClick={async () => { await act("leave", {}, "You left the group"); close(); }}><Icon name="out" />Leave group</button></div>}
    </Sheet>
  );
}
