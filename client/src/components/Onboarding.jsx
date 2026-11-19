import { useEffect, useMemo, useState } from "react";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { account, api, short, store } from "../sealr.js";
import { lockSeed, savedVault, unlockSeed, forgetVault } from "../vault.js";
import { Avatar, Brand, Icon } from "./ui.jsx";
import Intro from "./Intro.jsx";

const SLIDES = [
  ["lock", "Private today. Private after Q-Day.", "Messages and files are sealed with ML-KEM-1024 + X25519, so traffic recorded today stays unreadable when quantum computers arrive."],
  ["wallet", "Your wallet is your identity.", "No phone number, no email. Your qor1 address is who you are, and your keys live on your device."],
  ["coin", "Money moves in the chat.", "Send, request and swap tokens without leaving the conversation. Every transfer is signed with ML-DSA-87."],
  ["spark", "A guide that is always there.", "Sealr AI answers your questions about the app, any time."],
];

export default function Onboarding({ onLogin, notify }) {
  const vault = savedVault();
  const [view, setView] = useState(vault ? "unlock" : store.get("sealr.intro-done", false) ? "home" : "intro");
  const finishIntro = next => { store.set("sealr.intro-done", true); setView(next); };
  const [seed, setSeed] = useState(null);
  const [slide, setSlide] = useState(0);
  useEffect(() => { const t = setInterval(() => setSlide(s => (s + 1) % SLIDES.length), 4200); return () => clearInterval(t); }, []);
  const [ic, title, text] = SLIDES[slide];

  if (view === "intro") return <Intro onCreate={() => finishIntro("create")} onImport={() => finishIntro("import")} onDone={() => finishIntro("home")} />;
  return (
    <div className="onboard">
      <section className="ob-art">
        <div className="orbit" />
        <Brand />
        <div style={{ position: "relative" }}>
          <div className="slide-feat" key={slide} style={{ animation: "pop .4s" }}><span className="ic"><Icon name={ic} /></span></div>
          <h2 key={`t${slide}`} style={{ animation: "pop .4s" }}>{title}</h2>
          <p key={`p${slide}`} style={{ animation: "pop .4s" }}>{text}</p>
          <div className="feature-dots">{SLIDES.map((_, i) => <i key={i} className={i === slide ? "on" : ""} onClick={() => setSlide(i)} />)}</div>
        </div>
      </section>
      <section className="ob-main"><div className="ob-card">
        {view === "home" && <Home setView={setView} onLogin={onLogin} />}
        {view === "create" && <Create back={() => setView("home")} next={m => { setSeed(m); setView("protect"); }} />}
        {view === "import" && <Import back={() => setView("home")} next={m => { setSeed(m); setView("protect"); }} />}
        {view === "protect" && <Protect seed={seed} onLogin={onLogin} notify={notify} />}
        {view === "unlock" && <Unlock vault={vault} onLogin={onLogin} other={() => setView("home")} />}
      </div></section>
    </div>
  );
}

function Home({ setView, onLogin }) {
  const [demo, setDemo] = useState([]);
  useEffect(() => { api("/api/demo").then(setDemo, () => {}); }, []);
  return <>
    <h1>Welcome to Sealr</h1>
    <p className="lead">Quantum-safe chats, files and payments on QoreChain. Set up in under a minute.</p>
    <div className="ob-actions">
      <button className="btn primary" onClick={() => setView("create")}><Icon name="plus" />Create a new wallet</button>
      <button className="btn" onClick={() => setView("import")}><Icon name="key" />I already have a seed phrase</button>
    </div>
    {demo.length > 0 && <div className="demo">
      <div className="eyebrow">Try a demo account</div>
      <div className="demo-list">{demo.map(d => {
        const addr = account(d.mnemonic).address;
        return <button key={d.name} onClick={() => onLogin(d.mnemonic, d.name, demo.map(x => [account(x.mnemonic).address, x.name]))}><Avatar id={addr} name={d.name} size="xs" />{d.name}</button>;
      })}</div>
      <p className="hint">Open a second tab as someone else to chat between them.</p>
    </div>}
    <p className="hint" style={{ marginTop: 26 }}>Runs on QoreChain testnet (qorechain-diana). Test tokens have no value.
      {" "}<button style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12.5 }} onClick={() => setView("intro")}>Watch the intro again</button></p>
  </>;
}

function Create({ back, next }) {
  const mnemonic = useMemo(() => generateMnemonic(wordlist, 256), []);
  const [ok, setOk] = useState(false);
  return <>
    <button className="btn ghost sm" onClick={back} style={{ marginLeft: -10 }}><Icon name="back" className="i sm" />Back</button>
    <h1 style={{ marginTop: 10 }}>Write down your seed phrase</h1>
    <p className="lead">These 24 words are your wallet, your identity and your message keys. Keep them on paper, offline. Anyone with them can read your chats and move your tokens.</p>
    <div className="seed">{mnemonic.split(" ").map((w, i) => <span key={i}><i>{i + 1}</i>{w}</span>)}</div>
    <label className="pick" style={{ padding: "8px 0", cursor: "pointer" }} onClick={() => setOk(v => !v)}>
      <span className={`box${ok ? "" : ""}`} style={ok ? { background: "var(--accent)", borderColor: "var(--accent)", color: "var(--accent-ink)" } : {}}><Icon name="check" /></span>
      <span style={{ fontSize: 14 }}>I have written down all 24 words</span><span />
    </label>
    <div className="ob-actions" style={{ marginTop: 12 }}><button className="btn primary" disabled={!ok} onClick={() => next(mnemonic)}>Continue</button></div>
  </>;
}

function Import({ back, next }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const go = () => {
    const m = text.trim().toLowerCase().split(/\s+/).join(" ");
    validateMnemonic(m, wordlist) ? next(m) : setErr("That is not a valid 12 or 24 word seed phrase.");
  };
  return <>
    <button className="btn ghost sm" onClick={back} style={{ marginLeft: -10 }}><Icon name="back" className="i sm" />Back</button>
    <h1 style={{ marginTop: 10 }}>Import your wallet</h1>
    <p className="lead">Paste your 12 or 24 word QoreChain seed phrase. It never leaves this device.</p>
    <textarea className="field" rows={4} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="word1 word2 word3 …" value={text} onChange={e => setText(e.target.value)} />
    {err && <div className="err">{err}</div>}
    <div className="ob-actions" style={{ marginTop: 16 }}><button className="btn primary" onClick={go}>Continue</button></div>
  </>;
}

function Protect({ seed, onLogin, notify }) {
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState("");
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const addr = account(seed).address;
  const go = async () => {
    if (pw !== pw2) return setErr("The passwords do not match");
    setBusy(true);
    try { await lockSeed(seed, addr, pw); notify("Wallet saved on this device"); onLogin(seed); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return <>
    <h1>Lock it with a password</h1>
    <p className="lead">Sealr keeps your wallet on this device, encrypted with your password, so you only need the password to come back.</p>
    <div className="copy-line" style={{ marginBottom: 6 }}><Avatar id={addr} name={addr} size="xs" /><span className="mono">{short(addr)}</span></div>
    <label className="label">Password</label>
    <input className="field" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
    <label className="label">Repeat password</label>
    <input className="field" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />
    {err && <div className="err">{err}</div>}
    <div className="ob-actions" style={{ marginTop: 18 }}>
      <button className="btn primary" disabled={busy || !pw} onClick={go}>{busy ? "Encrypting…" : "Save and continue"}</button>
      <button className="btn ghost" onClick={() => onLogin(seed)}>Skip: don't remember this device</button>
    </div>
  </>;
}

function Unlock({ vault, onLogin, other }) {
  const [pw, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { onLogin(await unlockSeed(pw)); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return <>
    <div style={{ textAlign: "center", marginBottom: 20 }}>
      <Avatar id={vault.address} name={vault.address} size="lg" />
      <h1 style={{ margin: "14px 0 4px" }}>Welcome back</h1>
      <span className="mono dim">{short(vault.address)}</span>
    </div>
    <label className="label">Password</label>
    <input className="field" type="password" autoFocus autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />
    {err && <div className="err">{err}</div>}
    <div className="ob-actions" style={{ marginTop: 16 }}>
      <button className="btn primary" disabled={busy || !pw} onClick={go}><Icon name="lock" />{busy ? "Unlocking…" : "Unlock"}</button>
      <button className="btn ghost" onClick={other}>Use another wallet</button>
    </div>
    <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>Forgot the password? Choose "Use another wallet" and import your seed phrase.
      {" "}<button style={{ color: "var(--bad)", fontSize: 12.5 }} onClick={() => { forgetVault(); other(); }}>Remove saved wallet</button></p>
  </>;
}
