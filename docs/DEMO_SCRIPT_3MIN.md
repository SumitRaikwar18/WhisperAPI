# WhisperAPI 3-Minute Demo Script

## Goal

Show, in under 3 minutes, that WhisperAPI enables a real private machine-payment flow on Solana using MagicBlock, with live `deposit`, private `transfer`, and provider `withdraw`.

## Total Runtime

`3:00`

## 0:00 - 0:20

### Opening

“WhisperAPI is a private x402-compatible checkout layer for the metered agent economy.

Today, if an agent pays for an API on public rails, you can often infer which provider it uses, how much it pays, and how often it calls. That turns machine payments into competitive intelligence.

We built WhisperAPI so agents can pay for APIs on Solana without exposing that payment trail publicly.”

## 0:20 - 0:45

### Show the Product

Open the landing page and say:

“On this screen, judges can compare the public payment path against the private one.

The app shows:

- the paid endpoint
- the latest flow result
- the public chain view
- the private session view
- provider settlements
- and the live MagicBlock integration status”

Pause on the Integration Status panel.

Say:

“Right now this is running in live MagicBlock devnet mode, not demo mode.”

## 0:45 - 1:10

### Prove Readiness

Point to the Integration Status panel and say:

“Before running the flow, here’s the important proof:

- MagicBlock health is `ok`
- the app is `ready: true`
- buyer wallet is configured
- provider wallet is configured
- buyer and provider balances are readable
- and provider withdrawal is enabled”

## 1:10 - 1:35

### Show the Public Problem

Select one live endpoint, ideally:

- `Live price quote for SOL/USD`

Click `Run public flow`.

Say:

“This is the control case.

The request succeeds, but the public ledger view shows a readable payment trail.

That means the payment path leaks commercial information by default.”

Point to the Public Chain View.

## 1:35 - 2:25

### Show the Private Flow

Click `Run private flow`.

As it completes, say:

“Now we run the same kind of paid request through WhisperAPI.

The endpoint first returns `402 Payment Required`.

WhisperAPI then:

1. deposits funds into MagicBlock private payments
2. performs a private transfer to the provider
3. withdraws to the provider’s base balance
4. retries the request with a single-use receipt
5. and returns the paid response”

When the result appears, point to the `paymentSteps` block.

Say:

“This is the key proof:

- deposit succeeded
- private transfer succeeded
- provider withdraw succeeded

These are real devnet transaction signatures, not mocked events.”

## 2:25 - 2:45

### Show the Privacy Difference

Point to the private and public panels side by side.

Say:

“On the left, the public flow leaves a readable trail.

On the right, WhisperAPI keeps the payment path inside the private execution flow and only exposes what the settlement mode needs to expose.

That’s the product: private machine payments for APIs and agent commerce.”

## 2:45 - 3:00

### Close

“MagicBlock is central here, not incidental.

We use its private payments API for the actual payment rail, and we combine that with an x402-compatible request and retry flow.

If agents are going to buy software, data, and services on Solana, they need payment rails that don’t broadcast their playbook.

That’s what WhisperAPI is building.”

## Optional Backup Line

If a judge asks what is still not production-ready:

“The hackathon product path works live on devnet. The main remaining production gap is custody, because buyer signing is still server-side. For a production release, we’d move signing to a wallet client or delegated session key model.”

## Demo Operator Checklist

Before recording:

- run `npm run check:devnet`
- confirm `ready: true`
- confirm `providerWithdrawEnabled: true`
- keep the browser open on `http://localhost:3000`
- use the live endpoint, not a demo fallback
- make sure the `Latest flow result` panel is visible
