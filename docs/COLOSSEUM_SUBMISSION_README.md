# WhisperAPI

Private x402-compatible checkout for the metered agent economy.

## One-Line Description

WhisperAPI lets AI agents pay for APIs and machine services on Solana through MagicBlock private payments, so provider choice, spend, and payment cadence do not leak on public rails.

## Problem

Today, machine payments on Solana are usually public by default.

That creates three problems for agent commerce:

- provider choice becomes inferable from payment routes
- payment amounts become visible or easy to reconstruct
- payment frequency exposes traffic, model usage, and commercial strategy

For autonomous agents buying APIs, quotes, data, or merchant services, that public payment exhaust becomes competitive intelligence.

## Who It Is For

- AI agents paying for APIs
- crypto-native developers monetizing machine-to-machine services
- API providers that want private settlement instead of public spend trails
- agent commerce products that need a private checkout layer on Solana

## Solution

WhisperAPI wraps a standard HTTP `402 Payment Required` flow in a private settlement path powered by MagicBlock.

The product flow:

1. an agent calls a paid endpoint
2. the endpoint returns `402 Payment Required`
3. WhisperAPI opens a private payment session
4. buyer funds move into MagicBlock private payments
5. a private transfer settles to the provider
6. the provider can withdraw back to Solana base balance
7. the request is retried with a single-use receipt and the API responds

## Why Solana

Solana makes machine payments practical because settlement is fast and cheap enough for per-request commerce.

WhisperAPI uses Solana because:

- x402 is becoming a real pattern in the Solana agent ecosystem
- stablecoin payments on Solana are fast enough for pay-per-use access control
- MagicBlock enables private execution without sacrificing the Solana ecosystem surface area

## MagicBlock Integration

MagicBlock is central to the product, not incidental.

WhisperAPI uses the MagicBlock Private Payments API as the actual payment rail:

- `GET /health`
- `GET /v1/spl/is-mint-initialized`
- `GET /v1/spl/balance`
- `GET /v1/spl/private-balance`
- `POST /v1/spl/initialize-mint`
- `POST /v1/spl/deposit`
- `POST /v1/spl/transfer`
- `POST /v1/spl/withdraw`

What this means in the product:

- buyer funds are deposited into the private environment
- payment executes as a private transfer
- provider can withdraw back to Solana base balance
- observers do not get a readable public per-call payment trail

## What Is Working

Verified on `devnet` on `2026-04-23`:

- live MagicBlock health checks
- mint initialization checks
- buyer base balance reads
- buyer private balance reads
- provider private balance reads
- live `deposit`
- live private `transfer`
- live provider `withdraw`
- paid response returned after successful payment
- persisted receipts and sessions across restarts

## Live Demo Flow

The demo currently supports two live paid endpoints:

- weather data via Open-Meteo
- price data via CoinGecko

Judge flow:

1. open the app
2. choose an endpoint
3. run the private flow
4. inspect returned transaction signatures for:
   - deposit
   - private transfer
   - withdraw
5. compare the public ledger view against the private session view

## Architecture

### Backend

- Node.js HTTP server
- x402-compatible `402 -> receipt retry` flow
- MagicBlock live payment adapter
- local persisted state for sessions and receipts

### Frontend

- static HTML/CSS/JS landing page and demo console
- integration status panel
- public vs private observer panels

### State

- sessions
- receipts
- public ledger events
- private ledger events
- provider settlement events

## Repository Structure

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
    styles.css
    app.js
  src/
    agent-demo.js
    app-state.js
    env-loader.js
    paid-apis.js
    payment-adapters.js
    state-store.js
    whisper-engine.js
  scripts/
    check-devnet.js
  README.md
  server.js
```

## Setup

### Requirements

- Node.js 20+
- a devnet wallet with SOL
- devnet USDC or supported devnet SPL mint

### Environment

Create or fill:

- `.env.devnet`

Core values used in the verified flow:

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

See:

- `README.md`
- `DEVNET_SETUP_CHECKLIST.md`
- `WORKING_MAGICBLOCK_CONFIG.md`

### Install

```bash
npm install
```

### Verify Devnet

```bash
npm run check:devnet
```

Expected:

- `ready: true`
- `health: ok`
- buyer and provider addresses populated
- buyer and provider balances visible

### Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## What Judges Can Test

- `GET /api/integration/status`
- `GET /api/x402/supported`
- `POST /api/demo/public`
- `POST /api/demo/private`
- `GET /api/live/weather?city=Singapore`
- `GET /api/live/price?asset=solana&vs=usd`

## x402 Compatibility

This project is x402-compatible rather than a full external x402 SDK implementation.

Supported request/response contract:

- request headers:
  - `X-Payment`
  - `X-Payment-Receipt`
- response headers:
  - `X-Payment-Response`

Protected endpoints return `402 Payment Required` and can be retried with a valid single-use payment receipt.

## Security Notes

This is hackathon-ready, not mainnet-ready.

Current limitations:

- buyer signing still happens on the server
- state is persisted locally, not in a shared production datastore
- the admin/debug endpoints should be protected with `WHISPER_ADMIN_TOKEN` in shared deployments

## Why This Project Matters

Most teams build wallets, dashboards, or payment wrappers.

WhisperAPI is a new primitive:

- private machine payments for APIs
- private checkout for agent commerce
- a bridge between Solana x402-style commerce and MagicBlock private execution

The broader thesis is simple:

If agents are going to buy software, they need payment rails that do not broadcast their playbook.

## Demo Video Guidance

Recommended demo sequence:

1. explain the leakage problem in one sentence
2. show the public flow
3. show the private flow
4. highlight deposit, transfer, and withdraw signatures
5. show that the API response unlocks only after payment
6. close on why private machine payments matter for the agent economy

## Status

- public GitHub repository: yes
- live local demo: yes
- live devnet integration: yes
- live private payment path verified: yes
- live provider withdraw verified: yes
