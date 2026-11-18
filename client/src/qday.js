// The Q-Day simulation. Real cryptography, not an animation: we hand the attacker the X25519 private key
// (what a quantum computer running Shor's algorithm would recover) and let it try both kinds of message.
import { generateSealKeys, open, recipientOf, seal } from "@qorechain/qoreseal";
import { x25519 } from "@noble/curves/ed25519.js";
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64 } from "@scure/base";

const CHAIN = "qorechain-diana", PURPOSE = "sealr/qday-demo";
const enc = s => new TextEncoder().encode(s), dec = b => new TextDecoder().decode(b);
const keyFrom = shared => hkdf(sha256, shared, undefined, enc("classic-demo"), 32);

export function runQDay(text) {
  const bob = generateSealKeys();

  // Today's typical end-to-end encryption: X25519 key agreement + AES-GCM.
  const eph = x25519.utils.randomSecretKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const classic = gcm(keyFrom(x25519.getSharedSecret(eph, bob.x25519PublicKey)), nonce).encrypt(enc(text));
  const classicMsg = { ephemeral: x25519.getPublicKey(eph), nonce, ct: classic };

  // Sealr: hybrid ML-KEM-1024 + X25519 (QoreSeal).
  const sealed = seal({ chainId: CHAIN, purpose: PURPOSE, plaintext: enc(text), recipients: [recipientOf(bob)] });

  // Q-Day: the attacker now knows Bob's X25519 private key, but has no way to recover the ML-KEM-1024 one.
  const stolenX25519 = bob.x25519SecretKey;
  let classicResult, sealrResult;
  try {
    classicResult = { cracked: true, text: dec(gcm(keyFrom(x25519.getSharedSecret(stolenX25519, classicMsg.ephemeral)), classicMsg.nonce).decrypt(classicMsg.ct)) };
  } catch { classicResult = { cracked: false }; }
  try {
    const attacker = { ...bob, mlkemSecretKey: generateSealKeys().mlkemSecretKey };
    sealrResult = { cracked: true, text: dec(open({ chainId: CHAIN, purpose: PURPOSE, envelope: sealed, keys: attacker })) };
  } catch (e) { sealrResult = { cracked: false, error: e.message }; }

  return {
    classic: { bytes: classic.length + 44, preview: base64.encode(classic).slice(0, 64), ...classicResult },
    sealr: { bytes: sealed.length, preview: base64.encode(sealed.slice(0, 48)), ...sealrResult },
  };
}
