import { useEffect, useRef, useState } from "react";
import { store } from "../sealr.js";
import { Brand, Icon } from "./ui.jsx";

// The first-visit walkthrough: why Sealr matters, what to know, how to use it, then sign up.
const SLIDES = [
  {
    kicker: "Why it matters", title: "Your private messages are being recorded.",
    text: "Attackers copy encrypted traffic today and store it. When quantum computers arrive (\"Q-Day\"), the encryption most apps use can be broken, and everything stored becomes readable. This is called harvest now, decrypt later.",
    art: <HarvestArt />,
  },
  {
    kicker: "Why Sealr", title: "Sealr seals messages for the quantum era.",
    text: "Every message, photo and payment is protected with new post-quantum cryptography standardised by NIST, alongside today's proven encryption. A spy who records your chat today still cannot read it after Q-Day.",
    art: <SealArt />,
  },
  {
    kicker: "What to know", title: "A few things that make Sealr different.",
    art: <Facts />,
  },
  {
    kicker: "How to use it", title: "Everything happens in four tabs.",
    art: <HowTo />,
  },
];

export default function Intro({ onDone, onCreate, onImport, inApp }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length;
  // Narration (ElevenLabs, voice Sarah): one clip per screen; when a clip ends the tour moves on by itself.
  const audio = useRef(null);
  const [sound, setSound] = useState(() => store.get("sealr.intro-sound", true));
  const [blocked, setBlocked] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const a = audio.current ||= new Audio();
    a.onended = () => setTimeout(() => setI(n => n < SLIDES.length ? n + 1 : n), 700);
    a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    return () => { a.pause(); a.onended = null; };
  }, []);
  useEffect(() => {
    const a = audio.current;
    a.pause(); setProgress(0);
    if (!sound) return;
    a.src = `/voice/intro-${i + 1}.mp3`;
    a.play().then(() => setBlocked(false), () => setBlocked(true)); // browsers block sound until the first tap
  }, [i, sound]);
  const toggleSound = () => { const v = !sound; setSound(v); store.set("sealr.intro-sound", v); setBlocked(false); };
  const listen = () => { setBlocked(false); audio.current.play().catch(() => {}); };
  // Browsers only allow sound after the visitor's first touch or keypress, so the very first one anywhere starts the
  // voice. play() runs inside the event handler itself, which is what iPhone Safari requires.
  useEffect(() => {
    if (!sound || !blocked) return;
    const unlock = () => { const a = audio.current; if (a.paused && a.src) a.play().then(() => setBlocked(false), () => {}); };
    const evs = ["pointerdown", "touchend", "keydown"];
    evs.forEach(e => addEventListener(e, unlock, true));
    return () => evs.forEach(e => removeEventListener(e, unlock, true));
  }, [sound, blocked]);
  // Swipe left or right between screens on phones.
  const touch = useRef(null);
  const onTouchStart = e => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = e => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current; touch.current = null;
    if (Math.abs(dx) > 50) setI(n => Math.max(0, Math.min(SLIDES.length, n + (dx < 0 ? 1 : -1))));
  };
  useEffect(() => {
    const key = e => { if (e.key === "ArrowRight") setI(n => Math.min(n + 1, SLIDES.length)); if (e.key === "ArrowLeft") setI(n => Math.max(n - 1, 0)); };
    addEventListener("keydown", key); return () => removeEventListener("keydown", key);
  }, []);
  const s = SLIDES[i];

  return (
    <div className="intro" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="intro-top">
        <Brand size={30} />
        <span className="spacer" />
        <button className="btn ghost sm" aria-label={sound ? "Mute narration" : "Play narration"} onClick={toggleSound}><Icon name={sound ? "volume" : "mute"} className="i sm" />{sound ? "Sound on" : "Sound off"}</button>
        {inApp ? <button className="btn ghost sm" onClick={onDone}>Close</button> : !last && <button className="btn ghost sm" onClick={() => setI(SLIDES.length)}>Skip</button>}
      </div>

      {sound && blocked && <button className="listen" onClick={listen}><Icon name="volume" className="i sm" />Touch anywhere for sound</button>}
      <div className="intro-body" key={i}>
        {!last ? <>
          <div className="intro-art">{s.art}</div>
          <div className="intro-copy">
            <div className="eyebrow accent">{s.kicker} · {i + 1} of {SLIDES.length}</div>
            <h1>{s.title}</h1>
            {s.text && <p>{s.text}</p>}
          </div>
        </> : <div className="intro-cta">
          <div className="cta-mark"><svg><use href="#i-logo" /></svg></div>
          <h1>{inApp ? "That's the tour." : "Ready to talk privately?"}</h1>
          <p>{inApp ? "Sealr AI is in your chat list whenever you need a hand." : "Create your Sealr account. It takes under a minute, needs no phone number or email, and is free on testnet."}</p>
          {inApp ? <div className="ob-actions"><button className="btn primary" onClick={onDone}>Back to Sealr</button></div> : <div className="ob-actions">
            <button className="btn primary" onClick={onCreate}><Icon name="plus" />Create my account</button>
            <button className="btn" onClick={onImport}><Icon name="key" />I already have a seed phrase</button>
            <button className="btn ghost" onClick={onDone}>Just look around with a demo account</button>
          </div>}
        </div>}
      </div>

      <div className="intro-nav">
        <div className="feature-dots">{[...SLIDES, null].map((_, n) => <i key={n} className={n === i ? "on" : n < i ? "done" : ""} onClick={() => setI(n)}>
          {n === i && sound && !blocked && <b style={{ width: `${progress * 100}%` }} />}</i>)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {i > 0 && <button className="btn" onClick={() => setI(i - 1)}><Icon name="back" className="i sm" />Back</button>}
          {!last && <button className="btn primary" onClick={() => setI(i + 1)}>{i === SLIDES.length - 1 ? "Get started" : "Next"}<Icon name="chev" className="i sm" /></button>}
        </div>
      </div>
    </div>
  );
}

function HarvestArt() {
  return (
    <div className="art harvest">
      <div className="h-msgs">
        {["Meet at 6, bring the contract", "My PIN is in the drawer", "Transfer approved ✔"].map((t, n) => (
          <div key={n} className="h-msg" style={{ animationDelay: `${n * .25}s` }}><Icon name="lock" className="i sm" /><span>{t}</span></div>
        ))}
      </div>
      <div className="h-arrow"><span>recorded today</span><Icon name="down" /></div>
      <div className="h-vault"><Icon name="eye" /><b>Attacker's archive</b><small>waiting for Q-Day…</small></div>
      <div className="h-crack"><Icon name="zap" className="i sm" />2030s: classic encryption broken</div>
    </div>
  );
}

function SealArt() {
  return (
    <div className="art seal">
      <div className="s-bubble"><span>Meet at 6, bring the contract</span><span className="s-ok"><Icon name="check" className="i sm" /></span></div>
      <div className="s-layers">
        <div><Icon name="lock" className="i sm" /><b>ML-KEM-1024</b><small>post-quantum encryption · NIST FIPS 203</small></div>
        <div><Icon name="lock" className="i sm" /><b>X25519</b><small>today's proven encryption</small></div>
        <div><Icon name="shield" className="i sm" /><b>ML-DSA-87</b><small>post-quantum signature · nobody can fake the sender</small></div>
      </div>
      <div className="s-result"><Icon name="check" className="i sm" />To read it, an attacker must break both locks</div>
    </div>
  );
}

function Facts() {
  const items = [
    ["wallet", "Your wallet is your account", "No phone number, no email. You get a qor1… address; that is how people reach you."],
    ["key", "24 words are everything", "Your seed phrase restores your account. Write it on paper. Never share it, not even with Sealr AI."],
    ["drop", "Free to try", "Sealr runs on QoreChain testnet. You claim free test tokens; they have no real value."],
    ["eye", "Private, with honest limits", "Content is sealed. Who talks to whom, and payment amounts, are visible on the network."],
  ];
  return <div className="art facts">{items.map(([ic, t, d]) => (
    <div key={t} className="fact"><span className="fact-ic"><Icon name={ic} /></span><span><b>{t}</b><small>{d}</small></span></div>
  ))}</div>;
}

function HowTo() {
  const items = [
    ["chat", "Chats", "Message anyone by address, create groups, share photos and files. Tap + to start."],
    ["wallet", "Wallet", "Send, receive and swap tokens. Request money inside any chat."],
    ["spark", "Sealr AI", "Your guide. Ask how anything works, any time."],
    ["eye", "The eye icon", "In any chat: see what a spy captures, and run the Q-Day simulator."],
  ];
  return <div className="art howto-art">
    <div className="phone">
      <div className="phone-screen">
        <div className="ph-bar"><b>Chats</b><span className="ph-plus"><Icon name="plus" className="i sm" /></span></div>
        {["Sealr AI", "Amaka", "Hackathon team"].map((n, k) => <div key={n} className="ph-row"><i style={{ background: ["#8b6cff", "#2bb59c", "#3a4a52"][k] }} /><span><b>{n}</b><small>{["Welcome! Let me show you around", "You: Sent 5 QOR", "Tolu: see you at 6"][k]}</small></span></div>)}
        <div className="ph-tabs">{["chat", "wallet", "spark", "gear"].map((ic, k) => <span key={ic} className={k === 0 ? "on" : ""}><Icon name={ic} className="i sm" /></span>)}</div>
      </div>
    </div>
    <div className="howto-list">{items.map(([ic, t, d]) => (
      <div key={t} className="fact"><span className="fact-ic"><Icon name={ic} /></span><span><b>{t}</b><small>{d}</small></span></div>
    ))}</div>
  </div>;
}
