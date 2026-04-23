# WhisperAPI Devnet Setup Checklist

Use this checklist before you try a real MagicBlock private payment run.

## 1. Fill The Env File

Edit [`.env.devnet`](../.env.devnet).

Required values:

- `WHISPER_PAYMENT_MODE=magicblock-live`
- `MAGICBLOCK_CLUSTER=devnet`
- `MAGICBLOCK_MINT`
- `WHISPER_SIGNER_SECRET`
- `WHISPER_PROVIDER_DESTINATION`
- `MAGICBLOCK_EPHEMERAL_RPC_URL=https://devnet.magicblock.app`

Optional values:

- `WHISPER_PROVIDER_SECRET`
- `WHISPER_PROVIDER_WITHDRAW=true`
- `WHISPER_ADMIN_TOKEN`
- `WHISPER_STATE_FILE`
- `WHISPER_MAX_PAYMENT_USDC`
- `SOLANA_RPC_URL`
- `MAGICBLOCK_EPHEMERAL_RPC_URL`
- `MAGICBLOCK_VALIDATOR`

## 2. Use The Right Keys

Buyer wallet:

- must hold enough `SOL` for transaction fees
- must hold enough of `MAGICBLOCK_MINT` for at least one payment

Provider wallet:

- set `WHISPER_PROVIDER_DESTINATION` to the provider public key
- if you want real provider withdrawal, also set `WHISPER_PROVIDER_SECRET`

For the cleanest demo:

- use one buyer key
- use one separate provider key
- do not reuse the same wallet for both unless you are only smoke-testing

## 3. Choose A Real Devnet Mint

`MAGICBLOCK_MINT` must be a mint that exists on devnet and that your buyer wallet already holds.

Recommended:

- Solana devnet USDC: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- your own devnet SPL mint if you created one

Do not leave the placeholder value in the env file.

## 4. Run The Devnet Check

From the project root:

```powershell
cd "D:\frontier hackhton\whisperapi"
npm run check:devnet
```

You want to see:

- `mode: "magicblock-live"`
- `health: "ok"`
- `ready: true`
- `buyer` populated
- `providerDestination` populated

If `ready` is `false`, fix the `missing` fields first.

## 5. Confirm Balances

The check script will also print balances when your buyer key is configured.

You want:

- base balance for the buyer on Solana
- private balance may start at `0`
- provider private balance may start at `0`

If the buyer base balance for the mint is `0`, your private payment cannot succeed.

## 6. Start The App

```powershell
cd "D:\frontier hackhton\whisperapi"
npm start
```

Open:

```text
http://localhost:3000
```

## 7. Check Live Integration Status In The UI

Before clicking the private flow:

- open the `Integration Status` panel
- confirm `health` is `ok`
- confirm `ready` is `true`
- confirm the buyer and provider addresses are correct
- confirm the mint is the one you intended to use

## 8. Run The Real Private Flow

In the UI:

1. pick a live paid endpoint
2. click `Run Private Flow`
3. inspect `paymentSteps`

Expected live sequence:

- `deposit`
- `private-transfer`
- optional `withdraw` if enabled

Each successful step should return:

- `status: SUCCESS`
- `signature`
- `sendTo`
- `validator`

## 9. If The Flow Fails

Check these first:

- wrong `MAGICBLOCK_MINT`
- wrong key format in `WHISPER_SIGNER_SECRET`
- buyer has no token balance
- buyer has no `SOL` for fees
- provider destination is blank or invalid
- provider withdrawal enabled without `WHISPER_PROVIDER_SECRET`

## 10. Recommended Hackathon Demo Setup

For a stable demo:

- keep `WHISPER_PROVIDER_WITHDRAW=false`
- show `deposit` and `private-transfer` only
- use one funded buyer wallet and one provider destination
- record the signatures shown in `Latest Flow Result`

For a deeper sponsor-track demo:

- enable provider withdrawal
- use a separate provider key
- set `WHISPER_PROVIDER_SECRET` so it matches `WHISPER_PROVIDER_DESTINATION`
- show provider private balance and base balance before and after

## Exact Env Vars This Project Uses

- `WHISPER_PAYMENT_MODE`
- `MAGICBLOCK_API_BASE`
- `MAGICBLOCK_CLUSTER`
- `MAGICBLOCK_EPHEMERAL_RPC_URL`
- `MAGICBLOCK_VALIDATOR`
- `MAGICBLOCK_MINT`
- `MAGICBLOCK_MINT_DECIMALS`
- `SOLANA_RPC_URL`
- `WHISPER_SIGNER_SECRET`
- `WHISPER_PROVIDER_DESTINATION`
- `WHISPER_PROVIDER_SECRET`
- `WHISPER_PROVIDER_WITHDRAW`
- `WHISPER_MEMO_PREFIX`
- `WHISPER_ADMIN_TOKEN`
- `WHISPER_STATE_FILE`
- `WHISPER_MAX_PAYMENT_USDC`
