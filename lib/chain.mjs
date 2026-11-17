// QoreChain testnet: accounts from a mnemonic, hybrid-signed transactions, and one-time key registration (ML-DSA-87, then ML-KEM-1024).
import { encodeSecp256k1Pubkey } from "@cosmjs/amino";
import { encodePubkey, makeAuthInfoBytes } from "@cosmjs/proto-signing";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";
import { BinaryWriter } from "cosmjs-types/binary";
import { TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { addressFromPublicKey, buildRegisterPqKeyMessage, deriveCanonicalPqKey, deriveClassicalKey, signHybrid, toHex } from "@qorechain/qoresign";
import { broadcastTx, fetchPqKeyStatus, simulateTx, submitWithSignBytesFallback } from "@qorechain/qoresign/network";
import { buildRegisterKemKeyMessage, deriveSealKeys, describeKemRegistryError, signRecipientCard } from "@qorechain/qoreseal";
import { fetchKemKey } from "@qorechain/qoreseal/network";

const env = globalThis.process?.env || {};
// In the browser, chain requests go through the Sealr server (/rest), which forwards them to the testnet API.
export const REST = env.QORE_REST || (globalThis.window ? `${location.origin}/rest` : "https://api-testnet.qore.host");
export const CHAIN_ID = env.QORE_CHAIN_ID || "qorechain-diana";
if (CHAIN_ID === "qorechain-vladi") throw new Error("Sealr runs on testnet only");

export function account(mnemonic) {
  const classical = deriveClassicalKey({ mnemonic });
  const address = addressFromPublicKey(classical.publicKey, "secp256k1").bech32;
  return { address, classical, pq: deriveCanonicalPqKey({ mnemonic, address }), seal: deriveSealKeys({ mnemonic }) };
}

export async function balance(address, denom = "uqor") {
  const r = await (await fetch(`${REST}/cosmos/bank/v1beta1/balances/${address}`)).json();
  return BigInt(r.balances?.find(b => b.denom === denom)?.amount || 0);
}

async function waitForTx(txhash) {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${REST}/cosmos/tx/v1beta1/txs/${txhash}`);
    if (r.ok) return (await r.json()).tx_response;
    await new Promise(ok => setTimeout(ok, 1500));
  }
  throw new Error(`${txhash} was not committed`);
}

// mode "classicalOnly" is only for registering the ML-DSA-87 key itself; everything after is hybrid-signed.
export async function sendTx(acct, messages, { mode = "hybrid", memo = "" } = {}) {
  const r = await (await fetch(`${REST}/cosmos/auth/v1beta1/account_info/${acct.address}`)).json();
  if (!r.info) throw new Error(`${acct.address} has no funds yet: claim testnet QOR at https://dashboard.qorechain.io/faucet`);
  const accountNumber = BigInt(r.info.account_number), sequence = BigInt(r.info.sequence ?? "0");
  const bodyBytes = TxBody.encode(TxBody.fromPartial({ messages, memo })).finish();
  const sign = gas => signHybrid({
    chainId: CHAIN_ID, accountNumber, bodyBytes, classicalKey: acct.classical, pqKey: acct.pq, mode,
    authInfoBytes: makeAuthInfoBytes([{ pubkey: encodePubkey(encodeSecp256k1Pubkey(acct.classical.publicKey)), sequence }],
      [{ denom: "uqor", amount: ((gas + 9n) / 10n).toString() }], Number(gas), undefined, undefined, 1),
  }).txBytes;
  const sim = await simulateTx({ rest: REST, txBytes: sign(600_000n) });
  const res = mode === "hybrid"
    ? await submitWithSignBytesFallback({ rest: REST, chainId: CHAIN_ID, sign: () => sign(sim.suggestedGasLimit) })
    : await broadcastTx({ rest: REST, txBytes: sign(sim.suggestedGasLimit) });
  if (res.code !== 0) throw new Error(`refused: ${describeKemRegistryError(res.codespace, res.code) ?? `${res.codespace} ${res.code} ${res.log}`}`);
  const tx = await waitForTx(res.txhash);
  if (tx.code) throw new Error(`failed on chain: ${tx.raw_log}`);
  return res.txhash;
}

// Registers whatever is missing. Returns the transaction hashes it sent (empty if the account was already set up).
export async function ensureRegistered(acct, log = () => {}) {
  const sent = [];
  const pq = await fetchPqKeyStatus({ rest: REST, address: acct.address });
  if (!pq.registered) {
    log("registering the ML-DSA-87 signing key");
    sent.push(await sendTx(acct, [buildRegisterPqKeyMessage({ chainId: CHAIN_ID, account: acct.address, pqKey: acct.pq, classicalPublicKey: acct.classical.publicKey })], { mode: "classicalOnly" }));
  } else if (toHex(pq.publicKey) !== toHex(acct.pq.publicKey)) {
    throw new Error(`${acct.address} has a different ML-DSA-87 key registered`);
  }
  const kem = await fetchKemKey({ rest: REST, address: acct.address });
  if (!kem.registered || toHex(kem.publicKey) !== toHex(acct.seal.mlkemPublicKey)) {
    log("registering the ML-KEM-1024 encryption key");
    sent.push(await sendTx(acct, [buildRegisterKemKeyMessage({ sender: acct.address, mlkemPublicKey: acct.seal.mlkemPublicKey })]));
  }
  return sent;
}

// The signed card that carries the X25519 half of the hybrid key; senders check it against the keys on chain.
export const card = acct => signRecipientCard({ chainId: CHAIN_ID, address: acct.address, keys: acct.seal, classicalKey: acct.classical, pqKey: acct.pq });

export const sendQor = (from, to, uqor, memo = "") => sendTx(from, [{
  typeUrl: "/cosmos.bank.v1beta1.MsgSend",
  value: MsgSend.encode({ fromAddress: from.address, toAddress: to, amount: [{ denom: "uqor", amount: String(uqor) }] }).finish(),
}], { memo });

// QoreChain's on-chain AMM (x/amm). MsgSwapExactIn is not in cosmjs-types, so it is encoded here from qorechain/amm/v1/tx.proto.
export function swapExactInMsg({ sender, poolId, denomIn, amountIn, denomOut, minOut }) {
  const w = BinaryWriter.create();
  w.uint32(10).string(sender);
  w.uint32(16).uint64(BigInt(poolId));
  Coin.encode({ denom: denomIn, amount: String(amountIn) }, w.uint32(26).fork()).ldelim();
  w.uint32(34).string(denomOut);
  w.uint32(42).string(String(minOut));
  return { typeUrl: "/qorechain.amm.v1.MsgSwapExactIn", value: w.finish() };
}
export const swap = (acct, args) => sendTx(acct, [swapExactInMsg({ sender: acct.address, ...args })], { memo: "sealr swap" });

export async function pools() {
  return (await (await fetch(`${REST}/qorechain/amm/v1/pools`)).json()).pools || [];
}
export async function quote(poolId, denomIn, amountIn) {
  const r = await fetch(`${REST}/qorechain/amm/v1/quote/exact_in?pool_id=${poolId}&denom_in=${encodeURIComponent(denomIn)}&amount_in=${amountIn}`);
  const b = await r.json();
  if (!r.ok || b.amount_out == null) throw new Error(b.message || "no quote");
  return { out: BigInt(b.amount_out), fee: BigInt(b.fee || 0), impactBps: Number(b.impact_bps || 0) };
}
