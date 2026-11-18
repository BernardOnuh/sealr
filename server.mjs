#!/usr/bin/env node
// The Sealr relay: serves the built app (client/dist), forwards chain requests to the testnet API, and stores encrypted envelopes it cannot read.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { randomBytes } from "node:crypto";
import webpush from "web-push";
import "./lib/net.mjs";
import { askAI } from "./lib/ai.mjs";
import { verifyRecipientCard } from "@qorechain/qoreseal";
import { fetchKemKey } from "@qorechain/qoreseal/network";
import { fetchPqKeyStatus } from "@qorechain/qoresign/network";

const ROOT = new URL(".", import.meta.url).pathname;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8900);
const UPSTREAM = process.env.QORE_REST || "https://api-testnet.qore.host";
const CHAIN_ID = process.env.QORE_CHAIN_ID || "qorechain-diana";
const STATIC = join(ROOT, "client", "dist");
const DATA = process.env.DATA_DIR || join(ROOT, "data");
const MAX_ENVELOPE = 4 * 1024 * 1024; // base64 characters; about 3 MB of sealed data

// The OpenRouter key for Sealr AI may live in .env.
if (!process.env.OPENROUTER_API_KEY && existsSync(join(ROOT, ".env")))
  process.env.OPENROUTER_API_KEY = readFileSync(join(ROOT, ".env"), "utf8").match(/^OPENROUTER_API_KEY="?([^"\n]+)/m)?.[1];
const AI_PER_HOUR = Number(process.env.AI_PER_HOUR) || 40;
const aiHits = new Map();
function allowAI(key) {
  const now = Date.now(), q = (aiHits.get(key) || []).filter(t => now - t < 3600e3);
  if (q.length >= AI_PER_HOUR) return false;
  q.push(now); aiHits.set(key, q); return true;
}

mkdirSync(DATA, { recursive: true });
const load = (f, empty) => existsSync(join(DATA, f)) ? readFileSync(join(DATA, f), "utf8") : empty;
const cards = JSON.parse(load("cards.json", "{}"));
const msgs = load("msgs.jsonl", "").split("\n").filter(Boolean).map(l => JSON.parse(l));

// Web Push. The relay cannot read messages, so a notification says only that one arrived and from which address.
const vapid = JSON.parse(load("vapid.json", "null")) || webpush.generateVAPIDKeys();
writeFileSync(join(DATA, "vapid.json"), JSON.stringify(vapid));
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:sealr@example.com", vapid.publicKey, vapid.privateKey);
const subs = JSON.parse(load("subs.json", "{}")); // address -> [PushSubscription]
const saveSubs = () => writeFileSync(join(DATA, "subs.json"), JSON.stringify(subs));
const shortAddr = a => `${a.slice(0, 9)}…${a.slice(-4)}`;

function notify(rec) {
  for (const addr of rec.to.filter(a => a !== rec.from)) {
    for (const sub of subs[addr] || []) {
      webpush.sendNotification(sub, JSON.stringify({ title: "Sealr", body: `New sealed message from ${shortAddr(rec.from)}`, tag: rec.from }), { TTL: 3600 })
        .catch(e => { if (e.statusCode === 404 || e.statusCode === 410) { subs[addr] = subs[addr].filter(s => s.endpoint !== sub.endpoint); saveSubs(); } });
    }
  }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg" };
const ADDR = /^qor1[02-9ac-hj-np-z]{38}$/;
const PRIVATE = /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^::1$/;
const isLocal = req => !req.headers["x-forwarded-for"] && PRIVATE.test(req.socket.remoteAddress || "");

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req, limit) {
  let n = 0; const parts = [];
  for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error("too large"), { status: 413 }); parts.push(c); }
  return Buffer.concat(parts);
}

// Only the testnet API's read endpoints, simulation and broadcast are forwarded.
const FORWARD = /^\/(cosmos\/(auth|bank|tx|upgrade)\/|qorechain\/)/;
async function forward(req, res, path) {
  if (!FORWARD.test(path)) return send(res, 404, { error: "not forwarded" });
  const body = req.method === "POST" ? await readBody(req, 2e6) : undefined;
  const r = await fetch(UPSTREAM + path, { method: req.method, body, headers: body ? { "Content-Type": "application/json" } : {} });
  send(res, r.status, Buffer.from(await r.arrayBuffer()), r.headers.get("content-type") || "application/json");
}

// Throwaway testnet accounts from .env, offered only to this machine and the home network, for demos.
function demoAccounts() {
  if (!existsSync(join(ROOT, ".env"))) return [];
  const env = readFileSync(join(ROOT, ".env"), "utf8");
  return ["ALICE", "BOB", "CAROL"].flatMap(n => {
    const m = env.match(new RegExp(`^${n}_MNEMONIC="(.+)"$`, "m"));
    return m ? [{ name: n[0] + n.slice(1).toLowerCase(), mnemonic: m[1] }] : [];
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (p.startsWith("/rest/")) return await forward(req, res, p.slice(5) + url.search);

    if (req.method === "GET" && p === "/api/demo") return send(res, 200, isLocal(req) ? demoAccounts() : []);

    // Sealr AI. The question is sent to the model to be answered; the relay keeps nothing (history is sealed to the user's own keys in the app).
    if (req.method === "POST" && p === "/api/ai") {
      if (!process.env.OPENROUTER_API_KEY) return send(res, 503, { error: "Sealr AI is not set up on this server" });
      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
      if (!isLocal(req) && !allowAI(ip)) return send(res, 429, { error: `You have asked Sealr AI ${AI_PER_HOUR} questions this hour. Please try again later.` });
      const { messages } = JSON.parse(await readBody(req, 60e3));
      const history = (Array.isArray(messages) ? messages : []).slice(-16)
        .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
        .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
      if (history.at(-1)?.role !== "user") return send(res, 400, { error: "ask a question" });
      try { return send(res, 200, { text: await askAI(history) }); } catch (e) { return send(res, 502, { error: e.message }); }
    }

    if (req.method === "GET" && p === "/api/push/key") return send(res, 200, { key: vapid.publicKey });
    if (req.method === "POST" && p === "/api/push/subscribe") {
      const { address, subscription: sub } = JSON.parse(await readBody(req, 8e3));
      if (!ADDR.test(address || "") || !/^https:\/\//.test(sub?.endpoint || "") || !sub.keys?.p256dh || !sub.keys?.auth) return send(res, 400, { error: "bad subscription" });
      subs[address] = [...(subs[address] || []).filter(s => s.endpoint !== sub.endpoint), { endpoint: sub.endpoint, keys: sub.keys }].slice(-5);
      saveSubs();
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && p === "/api/push/unsubscribe") {
      const { address, endpoint } = JSON.parse(await readBody(req, 4e3));
      if (subs[address]) { subs[address] = subs[address].filter(s => s.endpoint !== endpoint); saveSubs(); }
      return send(res, 200, { ok: true });
    }

    // Recipient cards carry the X25519 half of each hybrid key, signed by the account.
    if (req.method === "POST" && p === "/api/cards") {
      const card = JSON.parse(await readBody(req, 20e3));
      try {
        if (!ADDR.test(card.address || "")) throw new Error("no address");
        const [pq, kem] = await Promise.all([fetchPqKeyStatus({ rest: UPSTREAM, address: card.address }), fetchKemKey({ rest: UPSTREAM, address: card.address })]);
        if (!pq.registered || !kem.registered) throw new Error("keys not registered on chain");
        verifyRecipientCard({ card, chainId: CHAIN_ID, pqPublicKey: pq.publicKey, mlkemPublicKey: kem.publicKey });
      } catch (e) { return send(res, 400, { error: `invalid card: ${e.message}` }); }
      cards[card.address] = card;
      writeFileSync(join(DATA, "cards.json"), JSON.stringify(cards));
      return send(res, 200, { ok: true });
    }
    const c = p.match(/^\/api\/cards\/(qor1\w+)$/);
    if (req.method === "GET" && c) return cards[c[1]] ? send(res, 200, cards[c[1]]) : send(res, 404, { error: "not on Sealr yet" });

    // Envelopes: the relay sees who sent what to whom and when, never the content.
    if (req.method === "POST" && p === "/api/msgs") {
      const m = JSON.parse(await readBody(req, MAX_ENVELOPE + 4e3));
      const to = [...new Set(m.to)];
      if (!ADDR.test(m.from) || !to.length || to.length > 50 || !to.every(a => ADDR.test(a)) || typeof m.env !== "string" || m.env.length > MAX_ENVELOPE)
        return send(res, 400, { error: "bad envelope" });
      const rec = { id: randomBytes(8).toString("hex"), ts: Date.now(), from: m.from, to, conv: String(m.conv || "").slice(0, 80), env: m.env };
      msgs.push(rec);
      appendFileSync(join(DATA, "msgs.jsonl"), JSON.stringify(rec) + "\n");
      notify(rec);
      return send(res, 200, { id: rec.id, ts: rec.ts });
    }
    if (req.method === "GET" && p === "/api/msgs") {
      const addr = url.searchParams.get("addr"), since = Number(url.searchParams.get("since")) || 0;
      if (!ADDR.test(addr || "")) return send(res, 400, { error: "addr required" });
      return send(res, 200, msgs.filter(m => m.ts > since && (m.from === addr || m.to.includes(addr))));
    }
    // Everything an eavesdropper on the relay or the network could capture.
    if (req.method === "GET" && p === "/api/spy") {
      return send(res, 200, msgs.slice(-40).reverse().map(m => ({ ...m, size: m.env.length, env: m.env.slice(0, 600) })));
    }

    if (req.method === "GET") {
      const file = normalize(join(STATIC, p === "/" || p === "/app" || p === "/app/" ? "index.html" : p));
      if (file.startsWith(STATIC) && existsSync(file) && !file.endsWith("/")) {
        const body = readFileSync(file), type = TYPES[extname(file)] || "application/octet-stream";
        // Safari only plays audio from servers that answer byte-range requests.
        const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
        if (range && type.startsWith("audio/")) {
          const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
          res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${body.length}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": "public, max-age=86400" });
          return res.end(body.subarray(start, end + 1));
        }
        if (type.startsWith("audio/")) { res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": body.length, "Cache-Control": "public, max-age=86400" }); return res.end(body); }
        return send(res, 200, body, type);
      }
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => console.log(`Sealr on http://${HOST}:${PORT}`));
