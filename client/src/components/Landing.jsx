import { useEffect, useState } from "react";
import "../landing.css";

// The public home page at "/". The app itself lives at /app; this page imports nothing from the crypto code so it loads fast.
const APP = "/app";
const EXPLORER = "https://explore.qore.network";
const SWAP_TX = "4EB34A4AEC642CB6356F86AEF89D49BDD8AA06E1CB7C6CC614EDC0EF12352552";

const I = ({ name }) => <svg className="i"><use href={`#i-${name}`} /></svg>;

const FEATURES = [
  ["chat", "Private chats", "One-to-one messages sealed per recipient with ML-KEM-1024 + X25519. The relay stores envelopes it cannot open."],
  ["users", "Groups that really lock", "Remove someone and the next message is sealed without them. They see the group go dark, not the conversation."],
  ["image", "Files and photos", "Attachments travel inside the same sealed envelope as the message, never as a separate link."],
  ["coin", "Pay in the chat", "Request and send QOR without leaving the conversation. The receipt lands in the thread with a link to the explorer."],
  ["swap", "Swap tokens", "Quote and swap on QoreChain's pools from the wallet tab, hybrid-signed like every other transaction."],
  ["spark", "Sealr AI", "A built-in guide that explains the app and walks new people through their first chat and payment."],
];

const STEPS = [
  ["wallet", "Create a wallet", "Twelve words, generated on your device. No phone number, no email. Your qor1 address is your identity."],
  ["key", "Put your keys on chain", "One tap registers your ML-DSA-87 signing key and ML-KEM-1024 encryption key on QoreChain, so anyone can check them."],
  ["send", "Talk and pay", "Every message is sealed for its recipients and signed by you. Money moves in the same thread."],
];

const SPEC = [
  ["Message encryption", "ML-KEM-1024 + X25519 hybrid, fresh key per message", "pq"],
  ["Authorship", "ML-DSA-87 + secp256k1 hybrid signatures (proves who sent it, hides nothing)", "pq"],
  ["Key directory", "Public keys registered on QoreChain testnet, checked by every sender", "pq"],
  ["Stored on the relay", "Only the sealed envelopes, exactly as sent", "pq"],
  ["On your device", "Only the seed phrase, locked with your password (scrypt + AES-256-GCM)", "ok"],
  ["Push notifications", "Classical Web Push; carries only \"new message from 0xab…\", never content", "gap"],
  ["Sealr AI requests", "Sent to the model over ordinary TLS; AI history is sealed at rest", "gap"],
];

export default function Landing() {
  const returning = (() => { try { return !!localStorage.getItem("sealr.vault"); } catch { return false; } })();
  const cta = returning ? "Open Sealr" : "Get started";
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [person, setPerson] = useState(true);
  useEffect(() => { document.title = "Sealr · Talk. Pay. Stay private."; }, []);
  // Cards and headings fade up as they scroll into view.
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))), { threshold: .15 });
    document.querySelectorAll(".landing .rv").forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing" onScroll={e => setScrolled(e.currentTarget.scrollTop > 12)}>
      <header className={`ln-nav${scrolled ? " solid" : ""}`}>
        <a className="brand" href="/"><svg><use href="#i-logo" /></svg>Sealr</a>
        <nav className={menu ? "open" : ""} onClick={() => setMenu(false)}>
          <a href="#why">Why</a><a href="#features">Features</a><a href="#qday">Q-Day</a><a href="#security">Security</a>
        </nav>
        <a className="ln-dark sm" href={APP}>{cta}<I name="ext" /></a>
        <button className="ln-burger" aria-label="Menu" onClick={() => setMenu(m => !m)}><I name={menu ? "x" : "chev"} /></button>
      </header>

      <section className="ln-hero">
        <h1>Private today.<br /><em>Private after Q-Day.</em></h1>
        <p className="ln-sub">Sealr lets you chat, share files and send money in one place, sealed with post-quantum encryption, so what's recorded today stays unreadable tomorrow.</p>
        <div className="ln-cta center">
          <a className="ln-dark" href={APP}>{cta === "Get started" ? "Get started free" : cta}<span className="arr">→</span></a>
          <a className="ln-light" href="#qday"><span className="play"><I name="zap" /></span>Try the Q-Day test</a>
        </div>

        <div className="ln-stage">
          <svg className="ln-wires" viewBox="0 0 1200 520" preserveAspectRatio="none" aria-hidden="true">
            <path d="M190 40 C 170 260, 330 300, 470 250" /><path d="M1010 120 C 1040 300, 900 330, 740 300" />
          </svg>
          <div className="ln-side left"><span className="ln-sic"><I name="lock" /></span><b>Talk and pay<br />in one place.</b><small>Messages, files and money, all sealed.</small></div>
          <div className="ln-side right">
            <div className="ln-avs"><i style={{ background: "#3EB489" }}>A</i><i style={{ background: "#5B8DEF" }}>B</i><i style={{ background: "#E07A5F" }}>C</i><span>+</span></div>
            <b>No phone.<br />No email.</b><small>Your wallet is your identity.</small>
          </div>
          <Badge />

          <div className="ln-orbit">
            {/* Drop a portrait at client/public/landing/hero-person.png to put a person in the centre; until then the phone shows. */}
            {person
              ? <img className="ln-person" src="/landing/hero-person.png" alt="" onError={() => setPerson(false)} />
              : <Phone src="/landing/c05-alice-photo.jpg" alt="Alice sends a sealed photo in Sealr" className="hero" eager />}
            <div className="ln-ring">
              <Glass a={-40} y={-170} ic="lock" t="Sealed" s="ML-KEM-1024 + X25519" />
              <Glass a={-27} y={70} ic="coin" t="5 QOR paid" s="Settled on QoreChain" tone="money" />
              <Glass a={30} y={-100} ic="key" t="Signed" s="ML-DSA-87, by Alice" tone="ai" />
              <Glass a={42} y={110} ic="users" t="Carol removed" s="Locked out of the group" />
              <Tile a={-58} y={-40} src="/landing/w04-swapped.jpg" />
              <Tile a={60} y={-10} src="/landing/g08-carol-locked.jpg" />
            </div>
          </div>

          <div className="ln-corner left"><i className="rule" /><span>Live on QoreChain<br />testnet today.</span>
            <a href={`${EXPLORER}/tx/${SWAP_TX}`} target="_blank" rel="noopener">See a real transaction ↗</a></div>
          <div className="ln-corner right"><span className="star">✦</span><span><i className="rule" />Recorded today.<br />Still sealed tomorrow.</span></div>
        </div>
      </section>

      <section className="ln-sec" id="why">
        <Head eyebrow="The problem" a="Encrypted today" b="is not private tomorrow." />
        <div className="ln-fan">
          <svg className="ln-wires" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><path d="M180 150 C 380 40, 420 260, 600 150 S 820 40, 1020 150" /></svg>
          <Card n="01" ic="eye" h="Harvest now" t="Attackers copy encrypted traffic and breach dumps today, and simply keep them." tilt={-4} />
          <Card n="02" ic="zap" h="Decrypt later" t="A large enough quantum computer breaks the RSA and elliptic-curve keys most apps rely on." tilt={0} lift />
          <Card n="03" ic="phone" h="Too many apps" t="People chat in one app and pay in another, copying wallet addresses between them." tilt={4} />
        </div>
        <Note left rule="Harvest now, decrypt later." sub="It's already happening." />
      </section>

      <section className="ln-sec" id="features">
        <Head eyebrow="What you get" a="Everything a messenger does," b="sealed for the quantum era." />
        <div className="ln-features">
          {FEATURES.map(([ic, h, t], i) => <Card key={h} ic={ic} h={h} t={t} delay={i * 70} />)}
        </div>
      </section>

      <section className="ln-sec" id="how">
        <Head eyebrow="How it works" a="Up and running" b="in under a minute." />
        <div className="ln-steps">
          <svg className="ln-wires" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true"><path d="M120 120 C 300 10, 420 10, 600 110 S 900 210, 1080 90" /></svg>
          {STEPS.map(([ic, h, t], i) => <Card key={h} n={`0${i + 1}`} ic={ic} h={h} t={t} tilt={[-3, 2, -2][i]} delay={i * 120} />)}
        </div>
      </section>

      <section className="ln-sec" id="qday">
        <div className="ln-split">
          <div>
            <Head left eyebrow="Try it here" a="What a spy sees" b="on Q-Day." />
            <p className="ln-lead">The same message, captured off the wire in two apps. Press the button to give the attacker a quantum computer.</p>
            <QDay />
            <p className="ln-note">An illustration. The app has a live version that runs on real messages you send.</p>
          </div>
          <Orbit src="/landing/q07-qday-sealr.jpg" alt="The Q-Day simulator inside Sealr" items={[
            { a: -38, y: -130, ic: "eye", t: "Captured", s: "1,767 sealed bytes" },
            { a: 36, y: -20, ic: "zap", t: "Q-Day", s: "RSA and ECDH broken", tone: "bad" },
            { a: -30, y: 130, ic: "lock", t: "Still sealed", s: "ML-KEM-1024 holds" },
          ]} />
        </div>
      </section>

      <section className="ln-sec">
        <div className="ln-split rev">
          <Orbit src="/landing/g08-carol-locked.jpg" alt="Carol is removed and locked out of the group" items={[
            { a: -36, y: -110, ic: "users", t: "Weekend plans", s: "Sealed for 2 members" },
            { a: 38, y: 10, ic: "user-x", t: "Carol removed", s: "No key for new messages", tone: "bad" },
            { a: -32, y: 140, ic: "shield", t: "No shared key", s: "Each message sealed per member", tone: "ai" },
          ]} />
          <div>
            <Head left eyebrow="Groups" a="Remove someone," b="and they're really out." />
            <p className="ln-lead">Each group message is sealed separately for every current member. When Alice removed Carol on testnet, Carol's app showed the next message as locked. There was no shared group key left for her to keep.</p>
            <a className="ln-light" href={`${EXPLORER}/tx/${SWAP_TX}`} target="_blank" rel="noopener" style={{ marginTop: 26 }}><span className="play"><I name="ext" /></span>See a real Sealr transaction</a>
            <p className="ln-note">Switch the explorer to Testnet if it opens on Mainnet.</p>
          </div>
        </div>
      </section>

      <section className="ln-sec" id="security">
        <Head eyebrow="Security, stated plainly" a="What is post-quantum," b="and what is not yet." />
        <div className="ln-spec rv">
          {SPEC.map(([k, v, s]) => <div className={`row ${s}`} key={k}><span className="k">{k}</span><span className="v">{v}</span>
            <span className="s">{s === "pq" ? "Post-quantum" : s === "ok" ? "Quantum-resistant" : "Classical"}</span></div>)}
        </div>
        <Note rule="AES-256 keeps about 128-bit strength against quantum search." sub="So the password is the weak point there, not the cipher. The two classical paths are on the roadmap." />
      </section>

      <section className="ln-sec ln-final">
        <Badge />
        <div className="ln-side left rv"><span className="ln-sic"><I name="drop" /></span><b>Free test QOR.</b><small>Claim from the faucet and try it.</small></div>
        <div className="ln-side right rv"><span className="ln-sic"><I name="phone" /></span><b>Add to home screen.</b><small>Works like an app on your phone.</small></div>
        <h2 className="ln-big rv">Private chats.<br /><em>Seamless payments.</em><br />One identity.</h2>
        <p className="ln-sub rv">Free on QoreChain testnet. Claim test QOR from the faucet and send your first sealed message.</p>
        <div className="ln-cta center rv">
          <a className="ln-dark" href={APP}>{cta === "Get started" ? "Get started free" : cta}<span className="arr">→</span></a>
          <a className="ln-light" href="https://dashboard.qorechain.io/faucet" target="_blank" rel="noopener"><span className="play"><I name="drop" /></span>Testnet faucet</a>
        </div>
      </section>

      <footer className="ln-foot">
        <a className="brand" href="/"><svg><use href="#i-logo" /></svg>Sealr</a>
        <span className="star">✦</span>
        <span>Built for QoreChain Build Before Q-Day · Testnet only, do not use real funds.</span>
      </footer>
    </div>
  );
}

const Phone = ({ src, alt, className = "", eager }) => <figure className={`ln-phone ${className}`}><img src={src} alt={alt} loading={eager ? "eager" : "lazy"} /></figure>;
// Cards that hang on a curved ring around the hero phone: `a` is the angle around it, `y` the height.
const Glass = ({ a, y, ic, t, s, tone = "" }) => (
  <div className={`ln-glass ${tone}`} style={{ "--a": `${a}deg`, "--y": `${y}px` }}><span className="gi"><I name={ic} /></span><span><b>{t}</b><small>{s}</small></span></div>
);
const Tile = ({ a, y, src }) => <div className="ln-glass tile" style={{ "--a": `${a}deg`, "--y": `${y}px` }}><img src={src} alt="" /></div>;
const Badge = () => (
  <svg className="ln-badge" viewBox="0 0 120 120" aria-hidden="true">
    <defs><path id="ln-circle" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0" /></defs>
    <g className="spin"><text><textPath href="#ln-circle">QUANTUM-SAFE · TODAY AND AFTER Q-DAY ·</textPath></text></g>
    <path className="st" d="M60 44 L63 57 L76 60 L63 63 L60 76 L57 63 L44 60 L57 57 Z" />
  </svg>
);
const Head = ({ eyebrow, a, b, left }) => (
  <div className={`ln-head rv${left ? " left" : ""}`}><div className="ln-eyebrow"><i className="rule" />{eyebrow}</div><h2>{a}<br /><em>{b}</em></h2></div>
);
const Card = ({ n, ic, h, t, tilt = 0, lift, delay = 0 }) => (
  <div className={`ln-gcard rv${lift ? " lift" : ""}`} style={{ "--tilt": `${tilt}deg`, transitionDelay: `${delay}ms` }}>
    <div className="top"><span className="ln-sic"><I name={ic} /></span>{n && <span className="num">{n}</span>}</div>
    <h3>{h}</h3><p>{t}</p>
  </div>
);
const Note = ({ rule, sub, left }) => <div className={`ln-note2 rv${left ? " left" : ""}`}><span className="star">✦</span><span><i className="rule" /><b>{rule}</b><small>{sub}</small></span></div>;
// A phone screenshot with glass cards circling it, like the hero.
const Orbit = ({ src, alt, items }) => (
  <div className="ln-orbit mini rv">
    <Phone src={src} alt={alt} className="hero" />
    <div className="ln-ring">{items.map(it => <Glass key={it.t} {...it} />)}</div>
  </div>
);

const CIPHER = "9f3a c1e0 77b2 04d9 e8aa 31f6 5c0b 92de 4a17 b3c8 6e05 f2a9";

function QDay() {
  const [on, setOn] = useState(false);
  const [txt, setTxt] = useState(CIPHER);
  useEffect(() => {
    if (!on) { setTxt(CIPHER); return; }
    const plain = "Meet at 6. I'll send the 5 QOR now.";
    let i = 0;
    const t = setInterval(() => { i++; setTxt(plain.slice(0, i) + CIPHER.slice(i, plain.length + 6)); if (i >= plain.length) { clearInterval(t); setTxt(plain); } }, 32);
    return () => clearInterval(t);
  }, [on]);
  return (
    <div className="ln-qday">
      <div className={`qcard${on ? " cracked" : ""}`}>
        <div className="qh"><span>Typical app</span><small>RSA / ECDH</small></div>
        <code>{txt}</code>
        <div className="qs">{on ? "Broken. Readable." : "Encrypted"}</div>
      </div>
      <div className={`qcard${on ? " safe" : ""}`}>
        <div className="qh"><span>Sealr</span><small>ML-KEM-1024 + X25519</small></div>
        <code>{CIPHER}</code>
        <div className="qs">{on ? "Still sealed." : "Sealed"}</div>
      </div>
      <button className={`btn ${on ? "" : "primary"} block`} onClick={() => setOn(v => !v)}><I name={on ? "back" : "zap"} />{on ? "Reset" : "Simulate Q-Day"}</button>
    </div>
  );
}
