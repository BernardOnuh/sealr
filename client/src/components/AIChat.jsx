import { useEffect, useRef, useState } from "react";
import { AI, askSealrAI, sealToSelf } from "../sealr.js";
import { Avatar, Icon, Spinner, useApp } from "./ui.jsx";

const STARTERS_NEW = ["How do I get test tokens?", "What does Activate do?", "How do I start a chat?", "Is my chat really private?", "What is Q-Day?"];
const STARTERS_READY = ["How do I start a chat?", "How do I make a group?", "How do I swap tokens?", "How do I request money?", "What is Q-Day?"];

// Sealr AI's first message. Written here rather than generated, so it is instant, free and always right; the steps
// already done are ticked off.
function welcomeText(status) {
  const funded = (status?.bal?.uqor || 0n) > 0n, ready = !!status?.ready;
  const step = (done, text) => `${done ? "✅ ~~" : ""}${text}${done ? "~~" : ""}`;
  return [
    "**Welcome to Sealr!** 👋 I'm Sealr AI, your guide. Sealr keeps your chats, files and payments private, even from future quantum computers. Here's how to get going:",
    "",
    `1. ${step(funded, "**Get free test tokens.** In **Chats**, the *Get started* card has **Copy address** and **Faucet**. Claim tokens at the faucet, then come back and tap *check again*.")}`,
    `2. ${step(ready, "**Activate your keys.** Tap **Activate**. It puts your quantum-safe keys on QoreChain, once, for about 0.05 test QOR.")}`,
    "3. **Start a chat.** Tap the **+** button, then **New chat**, and paste a friend's qor1… address. Or choose **New group**.",
    "4. **Move money.** In a chat, tap **+** then **Money** to send or request tokens. The **Wallet** tab lets you send, receive and swap.",
    "5. **See the protection.** In any chat, tap the **eye** icon and run the **Q-Day simulator**.",
    "",
    ready ? "You're all set up. Who will you message first?" : "One rule above all: **never share your 24-word seed phrase**, not even with me. Ask me anything, any time!",
  ].join("\n");
}
const time = ts => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function AIChat({ back }) {
  const { me, msgs, status, welcome, poll, notify } = useApp();
  const ready = !!status?.ready;
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [local, setLocal] = useState([]); // turns not saved yet (before activation, or while sealing)
  const box = useRef(), ta = useRef();

  const saved = msgs.filter(m => m.peer === AI).map(m => ({ id: m.id, ts: m.ts, role: m.payload.role === "assistant" ? "assistant" : "user", text: m.payload.text }));
  const pending = local.filter(l => !saved.some(t => t.role === l.role && t.text === l.text));
  const turns = [...saved, ...pending].sort((a, b) => a.ts - b.ts);

  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [turns.length, thinking]);
  useEffect(() => { const t = ta.current; if (t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; } }, [text]);

  const keep = async (role, t) => { if (ready) { await sealToSelf(me, { type: "text", role, text: t }); await poll(); } };
  const ask = async q => {
    q = q.trim(); if (!q || thinking) return;
    setText("");
    setLocal(l => [...l, { id: `l${Date.now()}`, ts: Date.now(), role: "user", text: q }]);
    setThinking(true);
    const history = [...turns, { role: "user", text: q }].slice(-16).map(t => ({ role: t.role, content: t.text }));
    const sealing = keep("user", q).catch(e => notify(e.message));
    try {
      const answer = await askSealrAI(history);
      setLocal(l => [...l, { id: `l${Date.now() + 1}`, ts: Date.now() + 1, role: "assistant", text: answer }]);
      await sealing;
      keep("assistant", answer).catch(e => notify(e.message));
    } catch (e) { notify(e.message, 5000); }
    setThinking(false);
  };

  return <>
    <div className="conv-head">
      {back && <button className="icon-btn back" aria-label="Back" onClick={back}><Icon name="back" /></button>}
      <Avatar id={AI} size="sm" />
      <div className="who"><b>Sealr AI</b><div className="sub ai"><Icon name="lock" />Your guide · history sealed to your keys</div></div>
    </div>

    <div className="msgs" ref={box}>
      <div className="row first last"><Avatar id={AI} size="xs" />
        <div className="bubble ai"><div className="text"><Markdown text={welcomeText(status)} /></div>
          {welcome && <div className="meta">{time(welcome.ts)}</div>}</div></div>
      {!turns.length && <div className="suggest">{(ready ? STARTERS_READY : STARTERS_NEW).map(s => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>}
      {turns.map((t, i) => {
        const mine = t.role === "user", nextSame = turns[i + 1]?.role === t.role;
        return (
          <div key={t.id} className={`row${mine ? " mine" : ""} first${nextSame ? "" : " last"}`}>
            {!mine && <Avatar id={AI} size="xs" />}
            <div className={`bubble${mine ? "" : " ai"}`}>
              <div className="text">{mine ? t.text : <Markdown text={t.text} />}</div>
              <div className="meta">{time(t.ts)}{!String(t.id).startsWith("l") && <span className="ok" title="Saved, sealed to your keys"><Icon name="lock" /></span>}</div>
            </div>
          </div>
        );
      })}
      {thinking && <div className="row first last"><Avatar id={AI} size="xs" /><div className="bubble ai"><Spinner /></div></div>}
    </div>

    <div className="note-bar">{ready ? "Free AI models may log questions, so don't share secrets. Your history is sealed to your keys." : "Free AI models may log questions. Activate your account to save this chat, encrypted."}</div>
    <div className="composer">
      <textarea ref={ta} className="field" rows={1} placeholder="Ask Sealr AI anything" value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(max-width:820px)").matches) { e.preventDefault(); ask(text); } }} />
      <button className="send ai" aria-label="Ask" onClick={() => ask(text)} disabled={thinking || !text.trim()}><Icon name="send" /></button>
    </div>
  </>;
}

// A small, safe Markdown subset (paragraphs, headings, lists, bold, italic, inline code, links), rendered as React elements.
function Markdown({ text }) {
  const out = []; let para = [], list = null;
  const flushPara = () => { if (para.length) out.push(<p key={out.length}>{para.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>); para = []; };
  const flushList = () => { if (list) { const L = list.ordered ? "ol" : "ul"; out.push(<L key={out.length}>{list.items.map((l, j) => <li key={j}>{inline(l)}</li>)}</L>); list = null; } };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/), ul = line.match(/^\s*[-*•]\s+(.*)/);
    if (ol || ul) {
      flushPara();
      if (!list || list.ordered !== !!ol) { flushList(); list = { ordered: !!ol, items: [] }; }
      list.items.push((ol || ul)[1]);
    } else if (!line.trim()) { flushPara(); flushList(); }
    else { flushList(); const h = line.match(/^#+\s*(.*)/); para.push(h ? `**${h[1].replace(/\*\*/g, "")}**` : line); }
  }
  flushPara(); flushList();
  return out;
}
function inline(s) {
  const out = []; let k = 0, last = 0, m;
  const rx = /(~~[^~]+~~|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|https?:\/\/[^\s)]+)/g;
  while ((m = rx.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("~~")) out.push(<s key={k++} style={{ opacity: .6 }}>{inline(t.slice(2, -2))}</s>);
    else if (t.startsWith("**")) out.push(<b key={k++}>{t.slice(2, -2)}</b>);
    else if (t.startsWith("*")) out.push(<i key={k++}>{t.slice(1, -1)}</i>);
    else if (t.startsWith("`")) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else out.push(<a key={k++} href={t} target="_blank" rel="noopener noreferrer">{t}</a>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
