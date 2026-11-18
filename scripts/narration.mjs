// Generates the walkthrough narration with ElevenLabs (voice Sarah). Reads ELEVENLABS_API_KEY from the environment
// or ~/leash/assets/video/.env; never prints it. Writes client/public/voice/intro-N.mp3. usage: node scripts/narration.mjs [N…]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

export const LINES = [
  "Every day, encrypted messages are copied and stored by people waiting for one moment: Q-Day, when quantum computers can break today's encryption. Everything recorded becomes readable. It's called: harvest now, decrypt later.",
  "Sealr seals every message, photo and payment with new post-quantum cryptography, alongside today's proven encryption. To read your chat, an attacker would have to break both. Even after Q-Day.",
  "A few things to know. Your wallet is your account. No phone number, no email. Your twenty-four word seed phrase is everything: write it down, and never share it. Sealr runs on testnet, so it's free to try. And we're honest: what you say is sealed, but who you talk to is visible.",
  "Using Sealr is simple. Chat with anyone, or start a group. Send, request and swap tokens in your wallet. Ask Sealr AI whenever you need a hand. And tap the eye icon in any chat, to see what a spy would see.",
  "Ready to talk privately? Create your account. It takes less than a minute.",
];
const VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah, an ElevenLabs premade voice
const SETTINGS = { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true };

function key() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const f = `${homedir()}/leash/assets/video/.env`;
  const m = existsSync(f) && readFileSync(f, "utf8").match(/^ELEVENLABS_API_KEY=(.+)$/m);
  if (!m) throw new Error("No ElevenLabs key: set ELEVENLABS_API_KEY");
  return m[1].trim();
}

const which = process.argv.slice(2).map(Number);
const k = key();
for (const [i, text] of LINES.entries()) {
  if (which.length && !which.includes(i + 1)) continue;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": k, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: SETTINGS }),
  });
  if (!r.ok) throw new Error(`clip ${i + 1}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const out = `client/public/voice/intro-${i + 1}.mp3`;
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  console.log(`${out} (${text.length} characters)`);
}
