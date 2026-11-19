import { useEffect, useState } from "react";
import { canPromptInstall, disablePush, enablePush, isIOS, onInstallChange, promptInstall, pushSupported, standalone, syncPush } from "../pwa.js";
import { savedVault } from "../vault.js";
import { Avatar, Icon, Prompt, copyText, useApp } from "./ui.jsx";
import Intro from "./Intro.jsx";

export default function Settings() {
  const { me, names, setName, theme, setTheme, lock, signOut, notify } = useApp();
  const [push, setPush] = useState(false);
  const [working, setWorking] = useState(false);
  const [rename, setRename] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [tour, setTour] = useState(false);
  const [, redraw] = useState(0);
  useEffect(() => onInstallChange(() => redraw(n => n + 1)), []);
  useEffect(() => { syncPush(me.address).then(setPush, () => {}); }, [me.address]);

  const installed = standalone();
  const pushBlocked = typeof Notification !== "undefined" && Notification.permission === "denied";
  const remembered = savedVault()?.address === me.address;
  const togglePush = async () => {
    setWorking(true);
    try {
      if (push) { await disablePush(me.address); setPush(false); notify("Notifications are off"); }
      else { await enablePush(me.address); setPush(true); notify("Notifications are on"); }
    } catch (e) { notify(e.message, 6000); }
    setWorking(false);
  };
  const pushNote = pushBlocked ? "Blocked for this site in your browser settings."
    : isIOS() && !installed ? "On iPhone, add Sealr to your home screen first, then turn this on there."
    : !pushSupported() ? "Needs the https version of Sealr."
    : "Shows who wrote, never what: the server cannot read your messages.";

  return (
    <div className="page"><div className="page-inner">
      <h1 className="page-title">Settings</h1>

      <div className="card" style={{ marginTop: 20, padding: 18, display: "flex", gap: 14, alignItems: "center" }}>
        <Avatar id={me.address} name={names[me.address] || me.address} size="lg" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 19, letterSpacing: "-.02em" }}>{names[me.address] || "Your profile"}</b>
          <div className="mono dim" style={{ wordBreak: "break-all" }}>{me.address}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn sm" onClick={() => setRename(true)}><Icon name="edit" className="i sm" />{names[me.address] ? "Change name" : "Set your name"}</button>
            <button className="btn sm" onClick={() => copyText(me.address, notify)}><Icon name="copy" className="i sm" />Copy</button>
          </div>
        </div>
      </div>

      <div className="set-group"><div className="eyebrow">Notifications & app</div>
        <div className="card">
          <div className="set-row"><span className="set-ic"><Icon name="bell" /></span><span><b>Message alerts</b><small>{pushNote}</small></span>
            <button className={`switch${push ? " on" : ""}`} aria-label="Message alerts" disabled={working || (!push && (!pushSupported() || pushBlocked))} onClick={togglePush} /></div>
          <div className="set-row"><span className="set-ic"><Icon name="phone" /></span>
            <span><b>Home screen app</b><small>{installed ? "Installed. You are using the app." : "Opens full screen like a normal app."}</small>
              {!installed && !canPromptInstall() && <div className="howto">{isIOS()
                ? <>In Safari tap <Icon name="share" className="i inline" /> <b>Share</b>, then <b>Add to Home Screen</b>.</>
                : <>In your browser menu, choose <b>Install app</b> or <b>Add to Home screen</b>.</>}</div>}</span>
            {!installed && canPromptInstall() ? <button className="btn primary sm" onClick={async () => { if (await promptInstall()) notify("Sealr is on your home screen"); }}>Install</button> : <span />}</div>
          <div className="set-row"><span className="set-ic"><Icon name={theme === "light" ? "sun" : "moon"} /></span><span><b>Dark mode</b><small>{theme === "light" ? "Off" : "On"}</small></span>
            <button className={`switch${theme !== "light" ? " on" : ""}`} aria-label="Dark mode" onClick={() => setTheme(t => t === "light" ? "dark" : "light")} /></div>
        </div>
      </div>

      <div className="set-group"><div className="eyebrow">Security</div>
        <div className="card">
          <div className="set-row"><span className="set-ic"><Icon name="lock" /></span>
            <span><b>Password lock</b><small>{remembered ? "This wallet is saved on this device, encrypted with your password (scrypt + AES-256-GCM)." : "Not saved on this device. You will need your seed phrase to sign in again."}</small></span>
            {remembered ? <button className="btn sm" onClick={lock}>Lock now</button> : <span />}</div>
          <div className="set-row"><span className="set-ic"><Icon name="shield" /></span>
            <span><b>Your keys</b><small>Signing: ML-DSA-87 + secp256k1. Encryption: ML-KEM-1024 + X25519. They never leave this device.</small></span><span /></div>
        </div>
      </div>

      <div className="set-group"><div className="eyebrow">About</div>
        <div className="card">
          <div className="set-row"><span className="set-ic"><Icon name="info" /></span><span><b>Welcome tour</b><small>Why Sealr matters and how to use it, in four short screens.</small></span>
            <button className="btn sm" onClick={() => setTour(true)}>Watch</button></div>
          <div className="set-row"><span className="set-ic ai"><Icon name="spark" /></span><span><b>Sealr AI</b><small>Free AI models via OpenRouter. They may log questions, so don't share secrets. History is sealed to your keys.</small></span><span /></div>
          <div className="set-row"><span className="set-ic money"><Icon name="info" /></span><span><b>QoreChain testnet</b><small>qorechain-diana. Tokens have no value.</small></span><span /></div>
        </div>
      </div>

      <button className="btn danger block" style={{ marginTop: 22 }} onClick={() => setConfirmOut(true)}><Icon name="out" />Sign out</button>
      {confirmOut && <Prompt title="Sign out?" lead={remembered ? "This removes the saved wallet from this device. To come back you will need your 24-word seed phrase. Type SIGN OUT to confirm." : "You will need your seed phrase to sign back in. Type SIGN OUT to confirm."}
        label="" ok="Sign out" onClose={() => setConfirmOut(false)} onOk={v => { if (v.trim().toUpperCase() !== "SIGN OUT") throw new Error("Type SIGN OUT to confirm"); signOut(); }} />}
      {tour && <Intro inApp onDone={() => setTour(false)} />}
      {rename && <Prompt title="Your name" lead="Shown on this device only. Contacts name you themselves." label="Name" initial={names[me.address] || ""} onOk={v => setName(me.address, v.trim().slice(0, 40))} onClose={() => setRename(false)} />}
    </div></div>
  );
}
