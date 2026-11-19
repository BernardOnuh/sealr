import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI, account, accountStatus, deriveGroups, ensureRegistered, fetchInbox, isGroup, openEnvelope, pools as fetchPools, publishCard, session, short, store, verifySender } from "./sealr.js";
import { forgetVault, savedVault } from "./vault.js";
import { Ctx, Icon } from "./components/ui.jsx";
import Onboarding from "./components/Onboarding.jsx";
import ChatList from "./components/ChatList.jsx";
import Conversation from "./components/Conversation.jsx";
import AIChat from "./components/AIChat.jsx";
import Wallet from "./components/Wallet.jsx";
import Settings from "./components/Settings.jsx";

const initialTheme = store.get("sealr.theme", matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
const TABS = [["chats", "chat", "Chats"], ["wallet", "wallet", "Wallet"], ["ai", "spark", "Sealr AI"], ["settings", "gear", "Settings"]];

export default function App() {
  const [me, setMe] = useState(() => { const s = session.get("sealr.seed"); return s ? { ...account(s), mnemonic: s } : null; });
  const [theme, setTheme] = useState(initialTheme);
  const [status, setStatus] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [verified, setVerified] = useState({});
  const [tab, setTab] = useState("chats");
  const [active, setActive] = useState(null);
  const [names, setNames] = useState(() => store.get("sealr.names", {}));
  const [seen, setSeen] = useState(() => store.get("sealr.seen", {}));
  const [poolList, setPools] = useState([]);
  const [welcomes, setWelcomes] = useState(() => store.get("sealr.welcome", {})); // address -> { ts, read }: Sealr AI's first message
  const [toast, setToast] = useState(null);
  const since = useRef(0);

  useEffect(() => { document.documentElement.dataset.theme = theme; store.set("sealr.theme", theme); }, [theme]);
  useEffect(() => { store.set("sealr.names", names); }, [names]);
  useEffect(() => { store.set("sealr.seen", seen); }, [seen]);
  useEffect(() => { store.set("sealr.welcome", welcomes); }, [welcomes]);

  const notify = useCallback((text, ms = 2800) => { setToast(text); setTimeout(() => setToast(t => t === text ? null : t), ms); }, []);
  // Sealr AI greets every account the first time it signs in on this device.
  useEffect(() => {
    if (!me || welcomes[me.address]) return;
    const t = setTimeout(() => {
      setWelcomes(w => w[me.address] ? w : { ...w, [me.address]: { ts: Date.now(), read: false } });
      notify("Sealr AI sent you a welcome message", 3500);
    }, 1200);
    return () => clearTimeout(t);
  }, [me, welcomes, notify]);
  const welcome = me ? welcomes[me.address] : null;
  useEffect(() => {
    if (me && welcome && !welcome.read && (active === AI || tab === "ai")) setWelcomes(w => ({ ...w, [me.address]: { ...w[me.address], read: true } }));
  }, [me, welcome, active, tab]);
  const groups = useMemo(() => me ? deriveGroups(msgs, me) : {}, [msgs, me]);
  const nameOf = useCallback(a => {
    if (a === AI) return "Sealr AI";
    if (isGroup(a)) return groups[a]?.name || "Group";
    if (a === me?.address) return "You";
    return names[a] || short(a);
  }, [names, me, groups]);

  const refresh = useCallback(async () => {
    if (!me) return;
    try { setStatus(await accountStatus(me.address)); } catch (e) { console.warn(e); }
    fetchPools().then(setPools, () => {});
  }, [me]);

  const poll = useCallback(async () => {
    if (!me) return;
    let list;
    try { list = await fetchInbox(me.address, since.current); } catch { return; }
    if (!list.length) return;
    since.current = Math.max(since.current, ...list.map(r => r.ts));
    const opened = list.map(r => openEnvelope(me, r)).filter(Boolean);
    setMsgs(prev => { const ids = new Set(prev.map(m => m.id)); return [...prev, ...opened.filter(m => !ids.has(m.id))]; });
    for (const m of opened) verifySender(m).then(ok => setVerified(v => ({ ...v, [m.id]: ok })));
  }, [me]);

  useEffect(() => {
    if (!me) return;
    session.set("sealr.seed", me.mnemonic);
    since.current = 0; setMsgs([]); setVerified({}); setActive(null); setStatus(null);
    refresh(); poll();
    const t = setInterval(poll, 2500), b = setInterval(refresh, 30000);
    return () => { clearInterval(t); clearInterval(b); };
  }, [me, poll, refresh]);
  useEffect(() => { if (status?.ready) publishCard(me).catch(e => console.warn("card", e)); }, [status?.ready, me]);
  useEffect(() => { if (active) setSeen(s => ({ ...s, [active]: Date.now() })); }, [active, msgs.length]);
  useEffect(() => {
    const esc = e => { if (e.key === "Escape" && !document.querySelector(".sheet-bg")) setActive(null); };
    addEventListener("keydown", esc); return () => removeEventListener("keydown", esc);
  }, []);

  // `known` names other accounts too (the demo accounts know each other).
  const login = (mnemonic, label, known = []) => {
    const acct = { ...account(mnemonic), mnemonic };
    setNames(n => {
      const next = { ...n };
      for (const [a, name] of known) next[a] ??= name;
      if (label) next[acct.address] ??= label;
      return next;
    });
    setTab("chats"); setMe(acct);
  };
  const lock = () => { session.set("sealr.seed", null); setMe(null); };
  const signOut = () => { if (savedVault()?.address === me?.address) forgetVault(); lock(); };
  const activate = async () => {
    try { await ensureRegistered(me); await publishCard(me); notify("Your quantum-safe keys are on chain"); }
    catch (e) { notify(e.message, 5000); }
    await refresh();
  };
  const unread = id => msgs.filter(m => m.peer === id && !m.mine && m.ts > (seen[id] || 0)).length;
  const anyUnread = msgs.some(m => !m.mine && m.peer !== AI && m.peer !== active && m.ts > (seen[m.peer] || 0)) || (welcome && !welcome.read);

  if (!me) return <>
    <Onboarding onLogin={login} notify={notify} />
    {toast && <div className="toast">{toast}</div>}
  </>;

  const ctx = {
    me, status, msgs, groups, welcome, verified, names, nameOf, notify, poll, refresh, activate, unread, theme, setTheme, lock, signOut,
    pools: poolList, setName: (a, n) => setNames(x => ({ ...x, [a]: n })), open: id => { setTab("chats"); setActive(id); },
  };
  const pick = t => { setTab(t); if (t !== "chats") setActive(null); };
  const showList = tab === "chats";

  return (
    <Ctx.Provider value={ctx}>
      <div className={`shell${showList ? "" : " full"}${showList && active ? " conv-open" : ""}`}>
        <nav className="rail">
          <svg className="logo"><use href="#i-logo" /></svg>
          {TABS.map(([id, ic, label]) => (
            <button key={id} title={label} className={`rail-btn${id === "ai" ? " ai" : ""}${tab === id ? " on" : ""}`} onClick={() => pick(id)}>
              <Icon name={ic} />{id === "chats" && anyUnread && <span className="dot" />}
            </button>
          ))}
          <button className="rail-btn me-btn" title={theme === "light" ? "Dark mode" : "Light mode"} onClick={() => setTheme(t => t === "light" ? "dark" : "light")}>
            <Icon name={theme === "light" ? "moon" : "sun"} />
          </button>
        </nav>

        {showList && <aside className="list-pane"><ChatList active={active} setActive={setActive} /></aside>}

        <main className="pane">
          {tab === "chats" && (active === AI ? <AIChat back={() => setActive(null)} />
            : active ? <Conversation key={active} id={active} back={() => setActive(null)} />
            : <div className="welcome-card"><div className="big-ic"><Icon name="lock" /></div><h3>Your private space</h3>
                Pick a chat, or start one with the + button. Everything you send is sealed with ML-KEM-1024 + X25519 and signed with ML-DSA-87.</div>)}
          {tab === "wallet" && <Wallet />}
          {tab === "ai" && <AIChat />}
          {tab === "settings" && <Settings />}
        </main>

        <nav className="tabbar">
          {TABS.map(([id, ic, label]) => (
            <button key={id} className={`tab${id === "ai" ? " ai" : ""}${tab === id ? " on" : ""}`} onClick={() => pick(id)}>
              <Icon name={ic} />{label}{id === "chats" && anyUnread && <span className="dot" />}
            </button>
          ))}
        </nav>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </Ctx.Provider>
  );
}
