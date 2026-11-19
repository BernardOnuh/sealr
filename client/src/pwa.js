// Installing Sealr to the home screen, and Web Push. Both need https (or localhost); on plain http they report themselves unavailable.
import { api, post } from "./sealr.js";

export const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const pushSupported = () => isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

let installEvent = null;
const listeners = new Set();
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; listeners.forEach(f => f()); });
addEventListener("appinstalled", () => { installEvent = null; listeners.forEach(f => f()); });
export const onInstallChange = f => { listeners.add(f); return () => listeners.delete(f); };
export const canPromptInstall = () => !!installEvent;
export async function promptInstall() {
  if (!installEvent) return false;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null; listeners.forEach(f => f());
  return outcome === "accepted";
}

export function registerServiceWorker() {
  if (isSecureContext && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(e => console.warn("sw", e));
}

const b64ToBytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), c => c.charCodeAt(0));

// Asks permission (must run from a tap), subscribes this device and tells the relay which address it belongs to.
export async function enablePush(address) {
  if (!pushSupported()) throw new Error(isIOS() && !standalone() ? "On iPhone, add Sealr to your home screen first, then turn on notifications from there" : "Notifications need the https version of Sealr");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications were not allowed. You can change this in your browser's site settings.");
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api("/api/push/key");
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await post("/api/push/subscribe", { address, subscription: sub.toJSON() });
}

// Re-registers an existing subscription for the signed-in address (the device may have switched accounts).
export async function syncPush(address) {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await post("/api/push/subscribe", { address, subscription: sub.toJSON() }).catch(() => {});
  return !!sub;
}

export async function disablePush(address) {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post("/api/push/unsubscribe", { address, endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
