import { useEffect, useState } from "react";
import { api, short, when } from "../sealr.js";
import { runQDay } from "../qday.js";
import { Icon, Sheet, Spinner } from "./ui.jsx";

const STEPS = ["Recording both messages off the network…", "Q-Day: a quantum computer runs Shor's algorithm…", "Recovered the X25519 private key. Trying to decrypt…"];

export default function Spy({ close }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    const load = () => api("/api/spy").then(setList, () => setList([]));
    load(); const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <Sheet title="What an eavesdropper sees" icon={<span className="set-ic bad"><Icon name="eye" /></span>} onClose={close} wide>
      <p className="lead">Everything the relay stores and anyone tapping the network can capture: addresses, times, sizes, and ciphertext.</p>
      <QDay />
      <div className="eyebrow" style={{ margin: "4px 0 10px" }}>Captured traffic</div>
      {list === null ? <Spinner /> : list.length ? list.slice(0, 12).map(m => (
        <div key={m.id} className="spy-row">
          <div className="hdr"><span className="mono">{short(m.from)} → {m.to.filter(a => a !== m.from).map(short).join(", ") || "self"}</span>
            <span>{when(m.ts)} · {(m.size * 3 / 4 / 1024).toFixed(1)} KB</span></div>
          <div className="ct">{m.env}…</div>
        </div>
      )) : <p className="dim">Nothing captured yet.</p>}
    </Sheet>
  );
}

// Real cryptography: the attacker is handed the X25519 private key, which is what a quantum computer would recover.
function QDay() {
  const [step, setStep] = useState(-1);
  const [res, setRes] = useState(null);
  const run = async () => {
    setRes(null);
    for (let i = 0; i < STEPS.length; i++) { setStep(i); await new Promise(r => setTimeout(r, 900)); }
    setRes(runQDay("Meet me at the bridge at 6. Bring the contract."));
    setStep(-1);
  };
  return (
    <div className="qday">
      <h4><Icon name="zap" className="i sm" /> Q-Day simulator</h4>
      <p>Two messages are captured today. On Q-Day, a quantum computer breaks the classical X25519 key. Which one can the attacker read?</p>
      <button className="btn danger sm" onClick={run} disabled={step >= 0}><Icon name="zap" className="i sm" />{res ? "Run again" : "Simulate Q-Day"}</button>
      {step >= 0 && <div className="qd-steps"><span><Spinner /> {STEPS[step]}</span></div>}
      {res && <div className="qd-grid">
        <div className={`qd ${res.classic.cracked ? "cracked" : "safe"}`}>
          <div className="h"><Icon name={res.classic.cracked ? "alert" : "lock"} className="i sm" />{res.classic.cracked ? "Cracked" : "Sealed"}</div>
          <b>Typical chat app today</b><div className="faint" style={{ fontSize: 12 }}>X25519 + AES-GCM · {res.classic.bytes} bytes</div>
          <div className="ct">{res.classic.preview}…</div>
          {res.classic.cracked && <div className="plain">"{res.classic.text}"</div>}
        </div>
        <div className={`qd ${res.sealr.cracked ? "cracked" : "safe"}`}>
          <div className="h"><Icon name={res.sealr.cracked ? "alert" : "lock"} className="i sm" />{res.sealr.cracked ? "Cracked" : "Still sealed"}</div>
          <b>Sealr</b><div className="faint" style={{ fontSize: 12 }}>ML-KEM-1024 + X25519 · {res.sealr.bytes} bytes</div>
          <div className="ct">{res.sealr.preview}…</div>
          <div style={{ fontSize: 12.5 }}>Knowing X25519 is not enough: the key also needs ML-KEM-1024, which has no known quantum attack.</div>
        </div>
      </div>}
      {res && <p className="hint" style={{ margin: "10px 0 0" }}>Computed in your browser just now with real keys. Only the quantum computer is simulated: we hand the attacker the X25519 private key.</p>}
    </div>
  );
}
