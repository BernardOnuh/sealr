import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ADDR, EXPLORER, FAUCET, TOKENS, findPool, fromBase, quote, sendTokens, short, swap, toBase, token } from "../sealr.js";
import { Icon, Sheet, Spinner, TokenIcon, copyText, useApp } from "./ui.jsx";
import { TokenSelect } from "./Conversation.jsx";
import { useContacts } from "./ChatList.jsx";

export default function Wallet() {
  const { me, status, refresh, notify } = useApp();
  const [sheet, setSheet] = useState(null);
  useEffect(() => { refresh(); }, [refresh]);
  const bal = status?.bal || {};

  return (
    <div className="page"><div className="page-inner">
      <h1 className="page-title">Wallet</h1>
      <div className="balance-card">
        <div className="lbl">QOR balance · testnet</div>
        <div className="big">{status ? fromBase(bal.uqor || 0n, 6, 2) : "…"}<small>QOR</small></div>
        <div className="sub">{TOKENS.slice(1).map(t => `${fromBase(bal[t.denom] || 0n, t.dec, 4)} ${t.sym}`).join(" · ")}</div>
        <div className="addr">{short(me.address)}<button aria-label="Copy address" onClick={() => copyText(me.address, notify)}><Icon name="copy" className="i sm" /></button></div>
      </div>

      <div className="quick">
        <button onClick={() => setSheet("send")}><span className="ic money"><Icon name="up" /></span>Send</button>
        <button onClick={() => setSheet("receive")}><span className="ic"><Icon name="down" /></span>Receive</button>
        <button onClick={() => setSheet("swap")}><span className="ic ai"><Icon name="swap" /></span>Swap</button>
        <a href={FAUCET} target="_blank" rel="noopener"><span className="ic"><Icon name="drop" /></span>Faucet</a>
      </div>

      <div className="card-title"><span className="eyebrow">Tokens</span><button className="btn ghost sm" onClick={refresh}>Refresh</button></div>
      <div className="card">{TOKENS.map(t => (
        <div key={t.sym} className="tok"><TokenIcon denom={t.denom} />
          <span><b>{t.sym}</b><small>{t.name}</small></span>
          <span className="num">{fromBase(bal[t.denom] || 0n, t.dec, 4)}</span></div>
      ))}</div>

      <div className="card-title"><span className="eyebrow">Security</span></div>
      <div className="card">
        <div className="keys-row"><span className="set-ic"><Icon name="key" /></span><span><b>Signing key</b><br /><small className="faint">ML-DSA-87 + secp256k1: every transaction signed twice</small></span>
          <span className={`ok-badge${status?.pq ? "" : " no"}`}>{status?.pq ? <><Icon name="check" className="i sm" />On chain</> : "Not yet"}</span></div>
        <div className="keys-row"><span className="set-ic"><Icon name="lock" /></span><span><b>Encryption key</b><br /><small className="faint">ML-KEM-1024 for your messages and files</small></span>
          <span className={`ok-badge${status?.kem ? "" : " no"}`}>{status?.kem ? <><Icon name="check" className="i sm" />On chain</> : "Not yet"}</span></div>
        <div className="keys-row"><span className="set-ic"><Icon name="ext" /></span><span><b>View on explorer</b><br /><small className="faint">All your transactions on QoreChain</small></span>
          <a className="btn sm" href={`${EXPLORER}/account/${me.address}`} target="_blank" rel="noopener">Open</a></div>
      </div>

      {sheet === "receive" && <Receive close={() => setSheet(null)} />}
      {sheet === "send" && <Send close={() => setSheet(null)} />}
      {sheet === "swap" && <Swap close={() => setSheet(null)} />}
    </div></div>
  );
}

function Receive({ close }) {
  const { me, notify } = useApp();
  const [svg, setSvg] = useState("");
  useEffect(() => { QRCode.toString(me.address, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then(setSvg); }, [me.address]);
  return (
    <Sheet title="Receive" onClose={close}>
      <p className="lead">Share your address to receive QOR, fUSD, fETH or fBTC, or to let someone start a chat with you.</p>
      <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="copy-line"><span className="mono">{me.address}</span><button className="icon-btn" onClick={() => copyText(me.address, notify)}><Icon name="copy" /></button></div>
      {navigator.share && <div className="actions"><button className="btn primary" onClick={() => navigator.share({ title: "My Sealr address", text: me.address }).catch(() => {})}><Icon name="share" />Share</button></div>}
    </Sheet>
  );
}

function Send({ close }) {
  const { me, status, nameOf, refresh, notify } = useApp();
  const contacts = useContacts();
  const [to, setTo] = useState(""), [denom, setDenom] = useState("uqor"), [amount, setAmount] = useState("");
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(null);
  const t = token(denom), bal = status?.bal?.[denom] || 0n;
  const go = async () => {
    try {
      if (!ADDR.test(to.trim())) throw new Error("Enter a valid qor1… address");
      const base = toBase(amount, t.dec);
      if (base <= 0n) throw new Error("Enter an amount");
      if (base > bal) throw new Error(`You have ${fromBase(bal, t.dec)} ${t.sym}`);
      setBusy(true);
      const tx = await sendTokens(me, to.trim(), denom, base);
      setDone(tx); refresh(); notify(`Sent ${amount} ${t.sym}`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  if (done) return <Sheet title="Sent" onClose={close}><Done tx={done} text={`${amount} ${t.sym} to ${nameOf(to.trim())}`} close={close} /></Sheet>;
  return (
    <Sheet title="Send" onClose={close}>
      <label className="label">To</label>
      <input className="field mono" placeholder="qor1…" autoCapitalize="none" spellCheck={false} value={to} onChange={e => { setTo(e.target.value); setErr(""); }} />
      {contacts.length > 0 && <div className="filters" style={{ padding: "8px 0 0" }}>{contacts.slice(0, 8).map(a =>
        <button key={a} className={`chip${to === a ? " on" : ""}`} onClick={() => setTo(a)}>{nameOf(a)}</button>)}</div>}
      <div className="swap-box" style={{ marginTop: 14 }}>
        <div className="top"><span>Amount</span><button onClick={() => setAmount(fromBase(bal, t.dec, t.dec).replace(/,/g, ""))}>Max {fromBase(bal, t.dec, 4)}</button></div>
        <div className="line"><input inputMode="decimal" placeholder="0" value={amount} onChange={e => { setAmount(e.target.value.replace(",", ".")); setErr(""); }} /><TokenSelect value={denom} onChange={setDenom} /></div>
      </div>
      <p className="hint">Signed with secp256k1 + ML-DSA-87 on your device. Network fee: a fraction of a test QOR.</p>
      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn money" disabled={busy} onClick={go}>{busy ? "Signing…" : `Send ${t.sym}`}</button></div>
    </Sheet>
  );
}

function Swap({ close }) {
  const { me, status, pools, refresh, notify } = useApp();
  const [from, setFrom] = useState("uqor"), [to, setTo] = useState(TOKENS[1].denom), [amount, setAmount] = useState("");
  const [q, setQ] = useState(null), [qErr, setQErr] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(null);
  const tf = token(from), tt = token(to), bal = status?.bal?.[from] || 0n;
  const pool = useMemo(() => findPool(pools, from, to), [pools, from, to]);

  useEffect(() => {
    setQ(null); setQErr("");
    let base; try { base = toBase(amount, tf.dec); } catch { return; }
    if (base <= 0n) return;
    if (!pool) return setQErr(`No pool trades ${tf.sym} for ${tt.sym} directly. Swap through QOR.`);
    const t = setTimeout(() => quote(pool.id, from, base).then(r => setQ({ ...r, base }), e => setQErr(e.message)), 350);
    return () => clearTimeout(t);
  }, [amount, from, to, pool, tf.dec, tf.sym, tt.sym]);

  const flip = () => { setFrom(to); setTo(from); setAmount(""); };
  const pickFrom = d => { if (d === to) setTo(from); setFrom(d); };
  const pickTo = d => { if (d === from) setFrom(to); setTo(d); };
  const go = async () => {
    if (!q) return;
    if (q.base > bal) return setQErr(`You have ${fromBase(bal, tf.dec)} ${tf.sym}`);
    if (q.impactBps > 500) return setQErr("Price impact is above 5%; the chain would refuse it. Try a smaller amount.");
    setBusy(true);
    try {
      const tx = await swap(me, { poolId: pool.id, denomIn: from, amountIn: q.base, denomOut: to, minOut: q.out * 99n / 100n });
      setDone({ tx, text: `${amount} ${tf.sym} → ${fromBase(q.out, tt.dec, 6)} ${tt.sym}` }); refresh(); notify("Swap complete");
    } catch (e) { setQErr(e.message); }
    setBusy(false);
  };
  if (done) return <Sheet title="Swapped" onClose={close}><Done tx={done.tx} text={done.text} close={close} /></Sheet>;
  const rate = q && Number(q.out) / 10 ** tt.dec / (Number(q.base) / 10 ** tf.dec);
  return (
    <Sheet title="Swap" onClose={close}>
      <p className="lead">Trades on QoreChain's on-chain AMM. Hybrid-signed, settled in one block.</p>
      <div className="swap-box">
        <div className="top"><span>You pay</span><button onClick={() => setAmount(fromBase(from === "uqor" && bal > 200000n ? bal - 200000n : bal, tf.dec, tf.dec).replace(/,/g, ""))}>Balance {fromBase(bal, tf.dec, 4)}</button></div>
        <div className="line"><input inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value.replace(",", "."))} /><TokenSelect value={from} onChange={pickFrom} /></div>
      </div>
      <div className="flip-wrap"><button className="flip" aria-label="Flip" onClick={flip}><Icon name="flip" /></button></div>
      <div className="swap-box">
        <div className="top"><span>You get</span><span>Balance {fromBase(status?.bal?.[to] || 0n, tt.dec, 4)}</span></div>
        <div className="line"><span className="out">{q ? fromBase(q.out, tt.dec, 6) : <span className="faint">0</span>}</span><TokenSelect value={to} onChange={pickTo} /></div>
      </div>
      {q && <div className="quote">
        <div><span>Rate</span><b>1 {tf.sym} = {rate.toLocaleString(undefined, { maximumSignificantDigits: 6 })} {tt.sym}</b></div>
        <div><span>Fee (0.3%)</span><b>{fromBase(q.fee, tf.dec, 6)} {tf.sym}</b></div>
        <div><span>Price impact</span><b style={{ color: q.impactBps > 300 ? "var(--bad)" : undefined }}>{(q.impactBps / 100).toFixed(2)}%</b></div>
        <div><span>Minimum received (1% slippage)</span><b>{fromBase(q.out * 99n / 100n, tt.dec, 6)} {tt.sym}</b></div>
      </div>}
      {qErr && <div className="err">{qErr}</div>}
      <div className="actions"><button className="btn primary" disabled={!q || busy} onClick={go}>{busy ? <><Spinner />Swapping…</> : q ? `Swap ${tf.sym} for ${tt.sym}` : "Enter an amount"}</button></div>
    </Sheet>
  );
}

function Done({ tx, text, close }) {
  return <>
    <div className="hero-av"><div className="av lg" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent2))", color: "var(--accent-ink)" }}><Icon name="check" className="i lg" /></div>
      <b>{text}</b><span className="dim" style={{ display: "block", fontSize: 13 }}>Confirmed on QoreChain</span></div>
    <div className="actions"><a className="btn" href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noopener"><Icon name="ext" />Explorer</a><button className="btn primary" onClick={close}>Done</button></div>
  </>;
}
