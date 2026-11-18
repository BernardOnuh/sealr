// Makes throwaway testnet accounts (for development and the demo), saves their mnemonics to .env and prints only the addresses.
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { addressFromPublicKey, deriveClassicalKey } from "@qorechain/qoresign";

const NAMES = ["ALICE", "BOB", "CAROL"];
const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const addressOf = mnemonic => addressFromPublicKey(deriveClassicalKey({ mnemonic }).publicKey, "secp256k1").bech32;

for (const name of NAMES) {
  const key = `${name}_MNEMONIC`;
  let mnemonic = env.match(new RegExp(`^${key}="(.+)"$`, "m"))?.[1];
  if (!mnemonic) {
    mnemonic = generateMnemonic(wordlist, 256);
    appendFileSync(".env", `${key}="${mnemonic}"\n`, { mode: 0o600 });
  }
  console.log(`${name.toLowerCase().padEnd(6)} ${addressOf(mnemonic)}`);
}
console.log("\nTestnet only. Mnemonics are in .env (git-ignored). Fund each address at https://dashboard.qorechain.io/faucet");
