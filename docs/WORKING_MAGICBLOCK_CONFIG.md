# Working MagicBlock Devnet Config

These values were verified in the live WhisperAPI devnet flow on `2026-04-23`.

## Core values

- `MAGICBLOCK_API_BASE=https://payments.magicblock.app`
- `MAGICBLOCK_CLUSTER=devnet`
- `MAGICBLOCK_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- `MAGICBLOCK_VALIDATOR=MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`
- `MAGICBLOCK_EPHEMERAL_RPC_URL=https://devnet.magicblock.app`
- `SOLANA_RPC_URL=https://api.devnet.solana.com`

## What this proves

- MagicBlock health check succeeds.
- Mint initialization check succeeds.
- Buyer base balance reads succeed.
- Buyer private balance reads succeed.
- Live `deposit` succeeds.
- Live private `transfer` succeeds.
- External provider response is returned after payment.

## Still conditional

- Separate-provider `withdraw` needs `WHISPER_PROVIDER_SECRET` for the exact public key in `WHISPER_PROVIDER_DESTINATION`.
- The project is still a hackathon custody model because buyer signing happens on the server.
