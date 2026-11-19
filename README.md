# Sealr

**Chat, files and money in one app, sealed with post-quantum cryptography on QoreChain.**

Anyone can record encrypted traffic today and decrypt it once a large quantum computer exists ("harvest now, decrypt later"). Sealr seals every message, file and payment request so that what is recorded today stays unreadable after Q-Day.

Built for **QoreChain Build Before Q-Day**. Testnet only (`qorechain-diana`); do not use real funds.

## What it does

- **Your wallet is your identity.** A seed phrase gives you a QoreChain address, an ML-DSA-87 signing key and an ML-KEM-1024 sealing key. Both public keys are registered on chain once, so anyone can look you up by address.
- **Sealed messages and files.** Each message is signed by the sender (hybrid: classical + ML-DSA-87) and sealed to each recipient with `@qorechain/qoreseal`. The relay stores envelopes it cannot read.
- **Verified senders.** Recipients check the signature against the sender's key on chain, not against anything the relay says.
- **Groups with real removal.** Every group message is sealed separately for each current member, and the group key rotates on removal. A removed member's app shows the next message as locked; there is no shared key left for them to keep.
- **Payments in the chat.** Request QOR, pay a request, and swap, all as hybrid-signed testnet transactions.
- **Q-Day simulation (original feature).** Real cryptography, not an animation: the attacker is handed the X25519 private key (what Shor's algorithm would recover) and tries to open the same captured message from a classical-only app and from Sealr. The classical one opens; the Sealr one does not. The app runs this on real messages you send.
- **Sealr AI.** An in-app guide that answers questions about the app (through OpenRouter).
- **Installs like an app.** PWA with push notifications for new sealed messages.

## On-chain proof

- Hybrid-signed swap transaction on QoreChain testnet: `4EB34A4AEC642CB6356F86AEF89D49BDD8AA06E1CB7C6CC614EDC0EF12352552`. View it at [explore.qore.network](https://explore.qore.network) (switch the explorer to Testnet).
- `npm run proof` reproduces the core flow on testnet: registers keys, sends a hybrid-signed transfer, seals a signed message to two members, checks a non-recipient cannot open it, removes a group member and checks they cannot open the rotated key.

## How it works

```
client (React PWA)                   server.mjs (relay)                QoreChain testnet
seed → keys, vault (scrypt + AES)  →  stores sealed envelopes only   →  ML-DSA-87 / ML-KEM-1024 keys
sign (hybrid) + seal per recipient    forwards chain REST requests      hybrid-signed txs (send, swap)
open + verify against keys on chain   web push, Sealr AI
```

| Path | What it is |
|---|---|
| `lib/chain.mjs` | Accounts from a mnemonic, hybrid-signed transactions, one-time key registration, pools, quotes and swaps |
| `client/src/sealr.js` | Everything that is not UI: wallet, sealing and opening, groups, payments, relay |
| `client/src/qday.js` | The Q-Day simulation |
| `client/src/vault.js` | The seed phrase at rest, encrypted with the user's password in this browser only |
| `server.mjs` | The relay: serves the app, proxies chain requests, stores envelopes it cannot read |
| `scripts/proof.mjs` | End-to-end proof on testnet (`--offline` skips the chain) |
| `scripts/wallet.mjs` | Makes throwaway testnet accounts and saves their mnemonics to `.env` (prints only addresses) |
| `assets/video/` | Scripts and stills used to build the demo video |

## Run it

Requires Node 20+.

```bash
npm install
npm run wallet        # throwaway testnet accounts → .env (never commit it)
npm start             # builds the client and serves it on http://127.0.0.1:8900
```

Claim test QOR from the QoreChain faucet for your address, then open the app and send your first sealed message.

Optional environment variables: `OPENROUTER_API_KEY` (Sealr AI), `QORE_REST`, `QORE_CHAIN_ID`, `PORT`, `HOST`, `DATA_DIR`.

## Limits

- Testnet only. The app refuses to run on mainnet.
- The relay sees who messages whom and when (metadata), but not the contents.
- The seed phrase is protected by your password in your browser; if you lose both, the account cannot be recovered.

## History

Sealr was written locally from 17 to 19 November 2026 and first committed to git on 22 November 2026, so the commit history starts on that date.

## Licence

MIT
