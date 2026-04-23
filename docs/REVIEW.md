# WhisperAPI Review

Date: 2026-04-23

## Findings

### High

1. Server-side custody of the buyer signing key is acceptable for a local hackathon demo but not for a real user-facing product.

- Impact: anyone who compromises the WhisperAPI server can spend the buyer wallet funds configured in `WHISPER_SIGNER_SECRET`.
- Where: the live adapter signs deposit and transfer transactions directly inside the server process.
- Fix: move signing to the client wallet, or use delegated short-lived session keys with strict spend limits and per-merchant policy constraints.

### Medium

2. Buyer signing is still centralized even though the app now enforces a server-side spend cap and supports admin protection for operational routes.

- Impact: this is acceptable for a hackathon demo, but it is still a custody architecture. A server compromise can sign buyer-side transactions within the configured spend policy.
- Fix: move signing to a wallet client, or mint short-lived delegated session keys with endpoint-level policy controls.

## Scores

- Security: `B`
- Quality: `A-`
- Ready for mainnet: `false`

## Summary

The project is in strong hackathon shape. The live MagicBlock integration is real, the demo path is legible, live provider data is integrated, state now survives restarts, and sensitive operational routes can be protected on shared deployments. The remaining gaps are production custody gaps, not evidence that the product path is broken.
