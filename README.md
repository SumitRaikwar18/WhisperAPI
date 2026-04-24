# WhisperAPI

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-1f6feb?style=for-the-badge&logo=node.js&logoColor=white)](#rocket-quick-start)
[![Solana](https://img.shields.io/badge/solana-devnet-14f195?style=for-the-badge&logo=solana&logoColor=000)](#globe_with_meridians-magicblock-devnet)
[![MagicBlock](https://img.shields.io/badge/magicblock-private%20payments-111827?style=for-the-badge)](#globe_with_meridians-magicblock-devnet)
[![x402](https://img.shields.io/badge/x402-compatible-0ea5e9?style=for-the-badge)](#building_construction-how-it-works)
[![Status](https://img.shields.io/badge/status-devnet%20verified-22c55e?style=for-the-badge)](#white_check_mark-verified)

:lock: Private checkout for the metered agent economy.

WhisperAPI lets AI agents pay for APIs and machine services on Solana without exposing provider choice, spend, or payment cadence on public rails. It uses MagicBlock Private Payments as the actual payment rail and wraps the flow in an x402-compatible `402 -> pay -> retry` pattern.

## :sparkles: Why This Exists

Public machine payments leak too much:

- which provider an agent uses
- how much it pays
- how often it pays

That turns payments into competitive intelligence.

WhisperAPI fixes that by moving settlement through MagicBlock private payments while keeping the request flow legible for developers and judges.

## :brain: What The Project Is

WhisperAPI is:

- agentic commerce infrastructure
- a private payments project
- an x402-compatible payment wrapper for paid APIs

WhisperAPI is not:

- a private wallet
- a neobank
- a consumer payments app

## :building_construction: How It Works

```mermaid
flowchart LR
    A[Agent / Client] -->|GET paid endpoint| B[WhisperAPI Server]
    B -->|402 Payment Required| A
    A -->|retry via Whisper checkout| B
    B -->|build deposit| C[MagicBlock Private Payments API]
    C -->|unsigned tx| B
    B -->|sign + submit| D[Solana Base]
    B -->|build private transfer| C
    C -->|unsigned tx| B
    B -->|sign + submit| E[MagicBlock PER]
    E -->|private balance| F[Provider]
    B -->|optional withdraw| C
    C -->|unsigned tx| B
    B -->|sign + submit| D
    B -->|single-use receipt accepted| G[Live API Provider]
    G -->|paid response| B
    B -->|response| A
```

## :gear: Flow

1. An agent calls a paid endpoint.
2. The endpoint returns `402 Payment Required`.
3. WhisperAPI opens a private payment session.
4. Buyer funds are deposited into MagicBlock private payments.
5. A private transfer settles to the provider.
6. The provider can withdraw back to Solana base balance.
7. The request is retried with a single-use receipt.
8. The paid API response is returned.

## :rocket: Quick Start

```bash
npm install
npm start
```

Open:

- landing page: `http://localhost:3000`
- live demo console: `http://localhost:3000/dashboard.html`

With live devnet config:

```bash
npm run check:devnet
```

## :globe_with_meridians: MagicBlock Devnet

The verified devnet configuration is documented in [docs/WORKING_MAGICBLOCK_CONFIG.md](./docs/WORKING_MAGICBLOCK_CONFIG.md).

Core setup:

```env
WHISPER_PAYMENT_MODE=magicblock-live
MAGICBLOCK_API_BASE=https://payments.magicblock.app
MAGICBLOCK_CLUSTER=devnet
MAGICBLOCK_EPHEMERAL_RPC_URL=https://devnet.magicblock.app
MAGICBLOCK_VALIDATOR=MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo
MAGICBLOCK_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
SOLANA_RPC_URL=https://api.devnet.solana.com
WHISPER_SIGNER_SECRET=<buyer-secret>
WHISPER_PROVIDER_DESTINATION=<provider-pubkey>
WHISPER_PROVIDER_SECRET=<provider-secret>
WHISPER_PROVIDER_WITHDRAW=true
```

Environment template: [`.env.example`](./.env.example)

## :satellite: API Surface

Routes:

- `GET /api/catalog`
- `GET /api/x402/supported`
- `GET /api/integration/status`
- `GET /api/state`
- `POST /api/reset`
- `POST /api/demo/public`
- `POST /api/demo/private`
- `GET /api/live/weather`
- `GET /api/live/price`

x402-compatible headers:

- request: `X-Payment`, `X-Payment-Receipt`
- response: `X-Payment-Response`

## :white_check_mark: Verified

Verified on devnet on `2026-04-24`:

- MagicBlock health checks
- mint initialization checks
- buyer base balance reads
- buyer private balance reads
- provider private balance reads
- live `deposit`
- live private `transfer`
- live provider `withdraw`
- paid response unlock after payment
- persisted receipts and sessions across restarts
- externalized dashboard runtime via `public/app.js`

## :test_tube: Demo Endpoints

The demo currently uses live upstream data:

- weather via Open-Meteo
- price via CoinGecko

This keeps the product understandable in a hackathon setting while still proving a real private payment path.

## :file_folder: Repo Structure

```text
whisperapi/
  docs/
    COLOSSEUM_SUBMISSION_README.md
    DEMO_SCRIPT_3MIN.md
    DEVNET_SETUP_CHECKLIST.md
    WORKING_MAGICBLOCK_CONFIG.md
    pitch-deck.html
    REVIEW.md
  public/
    index.html
    dashboard.html
    styles.css
    app.js
  scripts/
    check-devnet.js
  src/
    agent-demo.js
    app-state.js
    env-loader.js
    paid-apis.js
    payment-adapters.js
    state-store.js
    whisper-engine.js
  .env.example
  .gitignore
  package.json
  server.js
```

## :books: Docs

- [Colosseum submission README](./docs/COLOSSEUM_SUBMISSION_README.md)
- [3-minute demo script](./docs/DEMO_SCRIPT_3MIN.md)
- [Devnet setup checklist](./docs/DEVNET_SETUP_CHECKLIST.md)
- [Working MagicBlock config](./docs/WORKING_MAGICBLOCK_CONFIG.md)
- [Pitch deck](./docs/pitch-deck.html)
- [Review notes](./docs/REVIEW.md)

## :lock_with_ink_pen: Security Notes

This repo is hackathon-ready, not mainnet-ready.

Known production gaps:

- buyer signing still happens on the server
- admin/debug routes should be protected with `WHISPER_ADMIN_TOKEN` on shared deployments
- state persistence is local, not a multi-user production datastore

## :checkered_flag: Track Fit

For the MagicBlock Frontier track, WhisperAPI fits best as:

- `Agentic commerce / x402 APIs`
- `Private payments`
- `Privacy-first infrastructure`

## :link: Sources

- MagicBlock private payments template: https://docs.magicblock.gg/pages/templates/private-payments
- MagicBlock Private Payments API intro: https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/api-reference/per/introduction
- Solana x402 overview: https://solana.com/x402
