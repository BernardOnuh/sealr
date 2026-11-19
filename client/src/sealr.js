// Everything Sealr does that is not UI: the wallet, sealing and opening messages, groups, payments, swaps and the relay.
import { base64 } from "@scure/base";
import { signMessage, verifyMessage } from "@qorechain/qoresign";
import { fetchPqKeyStatus } from "@qorechain/qoresign/network";
import { open, seal, verifyRecipientCard } from "@qorechain/qoreseal";
import { fetchKemKey } from "@qorechain/qoreseal/network";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { account, card, CHAIN_ID, ensureRegistered, pools, quote, REST, sendTx, swap } from "../../lib/chain.mjs";

export { account, ensureRegistered, pools, quote, swap };
export const PURPOSE = "sealr/dm/v1";
export const MAX_FILE = 2 * 1024 * 1024;
export const EXPLORER = "https://explore.qore.network";
export const FAUCET = "https://dashboard.qorechain.io/faucet";
export const ADDR = /^qor1[02-9ac-hj-np-z]{38}$/;
export const AI = "sealr-ai"; // the conversation id of Sealr AI
export const isGroup = id => typeof id === "string" && id.startsWith("g:");
export const TOKENS = [
  { denom: "uqor", sym: "QOR", name: "QoreChain", dec: 6, color: "#34D3B4" },
  { denom: "erc20:0x97143B771D34ddb9130b807b135Ae675A5a963CA", sym: "fUSD", name: "Fest USD", dec: 6, color: "#4C9AFF" },
  { denom: "erc20:0x02292293c13880a26242690eb70a0e42B8E91c28", sym: "fETH", name: "Fest ETH", dec: 18, color: "#9B8CFF" },
  { denom: "erc20:0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A", sym: "fBTC", name: "Fest BTC", dec: 8, color: "#F2B84B" },
];
export const token = denom => TOKENS.find(t => t.denom === denom || t.sym === denom);

const enc = s => new TextEncoder().encode(s);
const dec = b => new TextDecoder().decode(b);

export async function api(path, opts) {
  const r = await fetch(path, opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
}
export const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function accountStatus(address) {
  const [pq, kem, r] = await Promise.all([
    fetchPqKeyStatus({ rest: REST, address }),
    fetchKemKey({ rest: REST, address }),
    api(`${REST}/cosmos/bank/v1beta1/balances/${address}`),
  ]);
  const bal = Object.fromEntries((r.balances || []).map(b => [b.denom, BigInt(b.amount)]));
  return { pq: pq.registered, kem: kem.registered, bal, ready: pq.registered && kem.registered };
}

export const publishCard = me => post("/api/cards", card(me));
export const hasCard = address => cardOf(address).then(() => true, () => false);

// ---------- messages ----------
// A payload is { v, from, to, at, type, ... }: `to` is a peer address, a group id ("g:…") or Sealr AI.
export function openEnvelope(me, rec) {
  try {
    const inner = JSON.parse(dec(open({ chainId: CHAIN_ID, purpose: PURPOSE, envelope: base64.decode(rec.env), keys: me.seal })));
    const payload = JSON.parse(inner.msg);
    if (payload.from !== rec.from) return null; // the relay's sender must be the signer
    const fromMe = payload.from === me.address;
    const peer = isGroup(payload.to) ? payload.to : fromMe ? payload.to : payload.from;
    // Sealr AI's answers are sealed by the user to themself, so they carry role "assistant".
    return { id: rec.id, ts: rec.ts, mine: fromMe && payload.role !== "assistant", peer, payload, raw: inner };
  } catch { return null; }
}

// Keys registered on chain, cached for a few minutes: every seal and every signature check needs them.
const TTL = 10 * 60e3;
const chainKeys = new Map(), cards = new Map();
function keysOf(address) {
  const hit = chainKeys.get(address);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = Promise.all([fetchPqKeyStatus({ rest: REST, address }), fetchKemKey({ rest: REST, address })])
    .then(([pq, kem]) => ({ pq: pq.registered ? pq.publicKey : null, kem: kem.registered ? kem.publicKey : null }));
  p.catch(() => chainKeys.delete(address));
  chainKeys.set(address, { at: Date.now(), p });
  return p;
}
function cardOf(address) {
  const hit = cards.get(address);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = api(`/api/cards/${address}`);
  p.catch(() => cards.delete(address));
  cards.set(address, { at: Date.now(), p });
  return p;
}

// True when the secp256k1 + ML-DSA-87 signature checks out against the sender's key registered on chain.
export async function verifySender(m) {
  try {
    const { pq } = await keysOf(m.payload.from);
    if (!pq) return false;
    verifyMessage({ chainId: CHAIN_ID, signer: m.payload.from, data: m.raw.msg, signature: m.raw.sig, pqPublicKey: pq });
    return true;
  } catch { return false; }
}

export const fetchInbox = (address, since) => api(`/api/msgs?addr=${address}&since=${since}`);

// Signs the payload, then seals it once: a fresh content key, wrapped with ML-KEM-1024 + X25519 for every recipient.
export async function sealAndSend(me, to, recipients, body) {
  recipients = [...new Set([...recipients, me.address])];
  const msg = JSON.stringify({ v: 1, from: me.address, to, at: new Date().toISOString(), ...body });
  const sig = signMessage({ chainId: CHAIN_ID, signer: me.address, data: msg, classicalKey: me.classical, pqKey: me.pq });
  // Each recipient's card (X25519 half) is checked against the ML-DSA-87 and ML-KEM-1024 keys they registered on chain.
  const sealTo = await Promise.all(recipients.map(async a => {
    const notReady = () => new Error(a === me.address ? "Activate your account first" : `${short(a)} has not activated Sealr yet`);
    const [c, k] = await Promise.all([cardOf(a).catch(() => { throw notReady(); }), keysOf(a)]);
    if (!k.pq || !k.kem) throw notReady();
    return verifyRecipientCard({ card: c, chainId: CHAIN_ID, address: a, pqPublicKey: k.pq, mlkemPublicKey: k.kem });
  }));
  const envelope = seal({ chainId: CHAIN_ID, purpose: PURPOSE, plaintext: enc(JSON.stringify({ msg, sig })), recipients: sealTo });
  return post("/api/msgs", { from: me.address, to: recipients, conv: isGroup(to) ? "group" : to === AI ? "ai" : "dm", env: base64.encode(envelope) });
}

// Sends to a conversation: a person, or every current member of a group.
export function sendTo(me, conv, body, groups) {
  if (isGroup(conv)) {
    const g = groups[conv];
    if (!g || !g.members.includes(me.address)) throw new Error("You are no longer in this group");
    return sealAndSend(me, conv, g.members, body);
  }
  return sealAndSend(me, conv, [conv], body);
}

// Sealr AI history: each turn is sealed to the user's own keys only.
export const sealToSelf = (me, body) => sealAndSend(me, AI, [], body);
export const askSealrAI = messages => post("/api/ai", { messages }).then(r => r.text);

// ---------- groups ----------
// A group is defined by signed control messages sealed to its members. Only the admin may add, remove or rename;
// any member may leave. Each change is sent to everyone affected, so a removed member learns it and then sees nothing more.
export function deriveGroups(msgs, me) {
  const groups = {};
  for (const m of [...msgs].filter(m => isGroup(m.peer) && m.payload.type === "group").sort((a, b) => a.ts - b.ts)) {
    const c = m.payload, g = groups[m.peer];
    const snapshot = () => ({ id: m.peer, name: String(c.name || "Group").slice(0, 60), admin: c.admin, members: [...new Set(c.members || [])], events: g?.events || [] });
    let next = null;
    if (!g) { if (c.from === c.admin && c.members?.includes(c.admin)) next = snapshot(); }
    else if (c.action === "leave") { if (g.members.includes(c.from)) next = { ...g, members: g.members.filter(a => a !== c.from) }; }
    else if (c.from === g.admin) next = { ...snapshot(), admin: g.admin };
    if (!next) continue;
    next.events = [...(g?.events || []), { id: m.id, ts: m.ts, from: c.from, action: c.action, target: c.target, name: next.name }];
    groups[m.peer] = next;
  }
  for (const g of Object.values(groups)) g.left = !g.members.includes(me.address);
  return groups;
}

const randomId = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, "0")).join("");

export async function createGroup(me, name, members) {
  const id = `g:${randomId()}`;
  const all = [...new Set([me.address, ...members])];
  await sealAndSend(me, id, all, { type: "group", action: "create", name, admin: me.address, members: all });
  return id;
}
export async function changeGroup(me, g, action, { target, name } = {}) {
  let members = g.members;
  if (action === "add") members = [...new Set([...members, ...[].concat(target)])];
  if (action === "remove") members = members.filter(a => a !== target);
  if (action === "leave") members = members.filter(a => a !== me.address);
  // The notice goes to the old and the new members, so whoever was removed or left is told.
  const to = [...new Set([...g.members, ...members])];
  await sealAndSend(me, g.id, to, { type: "group", action, target, name: name ?? g.name, admin: g.admin, members });
}

// ---------- money ----------
export const sendTokens = (me, to, denom, amount, memo = "sealr") => sendTx(me, [{
  typeUrl: "/cosmos.bank.v1beta1.MsgSend",
  value: MsgSend.encode({ fromAddress: me.address, toAddress: to, amount: [{ denom, amount: String(amount) }] }).finish(),
}], { memo });

// "1.5" with 6 decimals -> 1500000n, without floating point.
export function toBase(amount, dec) {
  const s = String(amount).trim();
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) throw new Error("Enter an amount");
  const [i, f = ""] = s.split(".");
  if (f.length > dec) throw new Error(`At most ${dec} decimals`);
  return BigInt(i || "0") * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0");
}
export function fromBase(n, dec, max = 6) {
  n = BigInt(n || 0);
  const neg = n < 0n; if (neg) n = -n;
  const i = n / 10n ** BigInt(dec), f = (n % 10n ** BigInt(dec)).toString().padStart(dec, "0").slice(0, Math.min(dec, max)).replace(/0+$/, "");
  return `${neg ? "-" : ""}${i.toLocaleString("en-US")}${f ? "." + f : ""}`;
}

// The pool that trades two denoms directly, if any.
export const findPool = (list, a, b) => list.find(p => p.status === "active" && ((p.token_a === a && p.token_b === b) || (p.token_a === b && p.token_b === a)));
export const fileToBase64 = async file => base64.encode(new Uint8Array(await file.arrayBuffer()));

// ---------- formatting and small helpers ----------
export const short = a => a ? `${a.slice(0, 8)}…${a.slice(-4)}` : "";
export const when = ts => {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
};
export function preview(p) {
  if (p.type === "file") return `📎 ${p.file.name}`;
  if (p.type === "pay") return `Sent ${p.amount} ${p.sym || "QOR"}`;
  if (p.type === "request") return `Requested ${p.amount} ${p.sym || "QOR"}`;
  if (p.type === "group") return groupEventText(p);
  return p.text;
}
export function groupEventText(p, nameOf = short) {
  const who = nameOf(p.from), t = p.target && [].concat(p.target).map(nameOf).map(n => n === "You" ? "you" : n).join(", ");
  return { create: `${who} created "${p.name}"`, add: `${who} added ${t}`, remove: `${who} removed ${t}`, leave: `${who} left`, rename: `${who} renamed the group to "${p.name}"` }[p.action] || "Group updated";
}

export const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
export const session = {
  get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} },
};
