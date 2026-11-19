// The seed phrase at rest: encrypted with a key derived from the user's password (scrypt, then AES-256-GCM), in this browser only.
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { gcm } from "@noble/ciphers/aes.js";
import { base64 } from "@scure/base";
import { store } from "./sealr.js";

const KEY = "sealr.vault";
const PARAMS = { N: 2 ** 15, r: 8, p: 1, dkLen: 32 };
const rand = n => crypto.getRandomValues(new Uint8Array(n));

export const savedVault = () => store.get(KEY, null);

export async function lockSeed(mnemonic, address, password) {
  if (password.length < 6) throw new Error("Use at least 6 characters");
  const salt = rand(16), nonce = rand(12);
  const key = await scryptAsync(new TextEncoder().encode(password), salt, PARAMS);
  const ct = gcm(key, nonce).encrypt(new TextEncoder().encode(mnemonic));
  store.set(KEY, { v: 1, address, salt: base64.encode(salt), nonce: base64.encode(nonce), ct: base64.encode(ct) });
}

export async function unlockSeed(password) {
  const v = savedVault();
  if (!v) throw new Error("No saved wallet on this device");
  const key = await scryptAsync(new TextEncoder().encode(password), base64.decode(v.salt), PARAMS);
  try { return new TextDecoder().decode(gcm(key, base64.decode(v.nonce)).decrypt(base64.decode(v.ct))); }
  catch { throw new Error("Wrong password"); }
}

export const forgetVault = () => store.set(KEY, undefined);
