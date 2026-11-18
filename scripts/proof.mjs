// Proves the Sealr stack end to end on QoreChain testnet: keys on chain, a signed group message sealed to members, and a removed member locked out.
import { readFileSync } from "node:fs";
import { signMessage } from "@qorechain/qoresign";
import { verifyMessageWithChain } from "@qorechain/qoresign/network";
import { EpochKeyManager, open, openEpochKey, recipientOf } from "@qorechain/qoreseal";
import { sealToAddresses } from "@qorechain/qoreseal/network";
import { account, balance, card, CHAIN_ID, ensureRegistered, REST, sendQor } from "../lib/chain.mjs";

const env = readFileSync(".env", "utf8");
const [alice, bob, carol] = ["ALICE", "BOB", "CAROL"].map(n => account(env.match(new RegExp(`^${n}_MNEMONIC="(.+)"$`, "m"))[1]));
const text = s => new TextEncoder().encode(s);
const read = b => new TextDecoder().decode(b);
const step = s => console.log(`\n· ${s}`);
const offline = process.argv.includes("--offline");

// 1. Keys on chain
if (!offline) {
  await ensureRegistered(alice, s => console.log(`  alice: ${s}`));
  if (await balance(carol.address) === 0n) {
    step("alice sends carol 10 QOR (hybrid-signed)");
    console.log(`  ${await sendQor(alice, carol.address, 10_000_000, "sealr: welcome")}`);
  }
  for (const [name, a] of [["alice", alice], ["bob", bob], ["carol", carol]]) {
    step(`${name} ${a.address}: ${Number(await balance(a.address)) / 1e6} QOR`);
    const txs = await ensureRegistered(a, s => console.log(`  ${s}`));
    console.log(txs.length ? `  done: ${txs.join(", ")}` : "  keys already on chain");
  }
}

// 2. Alice signs a message, then seals it to Bob and Carol (keys read from the chain unless offline)
const purpose = "sealr/dm/v1";
const msg = JSON.stringify({ from: alice.address, at: new Date().toISOString(), body: "Meeting at 5. Bring the contract." });
const sig = signMessage({ chainId: CHAIN_ID, signer: alice.address, data: msg, classicalKey: alice.classical, pqKey: alice.pq });
const plaintext = text(JSON.stringify({ msg, sig }));
step("alice seals a signed message to bob and carol");
const envelope = offline
  ? (await import("@qorechain/qoreseal")).seal({ chainId: CHAIN_ID, purpose, plaintext, recipients: [bob, carol].map(a => recipientOf(a.seal)) })
  : await sealToAddresses({ rest: REST, chainId: CHAIN_ID, purpose, plaintext, recipients: [bob, carol].map(a => ({ address: a.address, card: card(a) })) });
console.log(`  envelope: ${envelope.length} bytes, ciphertext only`);

for (const [name, a] of [["bob", bob], ["carol", carol]]) {
  const got = JSON.parse(read(open({ chainId: CHAIN_ID, purpose, envelope, keys: a.seal })));
  let verified = "signature not checked (offline)";
  if (!offline) {
    const { possessionProven } = await verifyMessageWithChain({ rest: REST, chainId: CHAIN_ID, signer: alice.address, data: got.msg, signature: got.sig });
    verified = `verified sender (ML-DSA-87 key on chain${possessionProven ? ", possession proven" : ""})`;
  }
  console.log(`  ${name} reads "${JSON.parse(got.msg).body}" · ${verified}`);
}
try { open({ chainId: CHAIN_ID, purpose, envelope, keys: alice.seal }); console.log("  ✗ alice opened an envelope not sealed to her"); }
catch { console.log("  alice (not a recipient) cannot open it"); }

// 3. A group: carol is removed, the key rotates, and she cannot read the next epoch
step("group of three; carol is removed");
const group = new EpochKeyManager({ chainId: CHAIN_ID, purpose: "sealr/group/v1", members: Object.fromEntries([alice, bob, carol].map(a => [a.address, recipientOf(a.seal)])) });
const before = group.epoch;
const rotation = group.removeMember(carol.address);
console.log(`  epoch ${before} → ${group.epoch}, new key sealed to ${group.members().length} members`);
const canOpen = a => { try { openEpochKey({ chainId: CHAIN_ID, purpose: "sealr/group/v1", envelope: rotation.envelope, keys: a.seal }); return true; } catch { return false; } };
console.log(`  bob opens the new key: ${canOpen(bob)} · carol opens the new key: ${canOpen(carol)}`);
