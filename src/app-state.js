const crypto = require("node:crypto");

function nowIso() {
  return new Date().toISOString();
}

function persist(state) {
  if (typeof state.__persist === "function") {
    state.__persist(snapshot(state));
  }
}

function createState(initialState = null) {
  const configuredNetwork =
    process.env.WHISPER_PAYMENT_MODE === "magicblock-live"
      ? "MagicBlock PER (live adapter)"
      : "MagicBlock PER (demo adapter)";

  const state = {
    sessions: [],
    receipts: [],
    publicLedger: [],
    privateLedger: [],
    providerSettlements: [],
    flowRuns: [],
    config: {
      asset: "USDC",
      privateNetwork: configuredNetwork,
      providerName: "SkyWeather API",
      providerEscrow: "escrow_skyweather_demo",
    },
  };

  if (initialState && typeof initialState === "object") {
    state.sessions = Array.isArray(initialState.sessions) ? initialState.sessions : [];
    state.receipts = Array.isArray(initialState.receipts) ? initialState.receipts : [];
    state.publicLedger = Array.isArray(initialState.publicLedger) ? initialState.publicLedger : [];
    state.privateLedger = Array.isArray(initialState.privateLedger) ? initialState.privateLedger : [];
    state.providerSettlements = Array.isArray(initialState.providerSettlements)
      ? initialState.providerSettlements
      : [];
    state.flowRuns = Array.isArray(initialState.flowRuns) ? initialState.flowRuns : [];
    state.config = {
      ...state.config,
      ...(initialState.config || {}),
    };
  }

  return state;
}

function attachPersistence(state, persistFn) {
  Object.defineProperty(state, "__persist", {
    value: persistFn,
    enumerable: false,
    writable: true,
    configurable: true,
  });

  persist(state);
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

function resetState(state) {
  const fresh = createState();
  for (const key of Object.keys(state)) {
    state[key] = fresh[key];
  }
  persist(state);
}

function openPrivateSession(state, input) {
  const session = {
    id: id("per"),
    createdAt: nowIso(),
    status: "OPEN",
    buyer: input.buyer,
    provider: input.provider,
    endpoint: input.endpoint,
    itemLabel: input.itemLabel,
    amount: input.amount,
    asset: input.asset,
    concealed: {
      merchantSelection: true,
      amount: true,
      frequency: true,
    },
  };

  state.sessions.unshift(session);
  state.privateLedger.unshift({
    id: id("priv_evt"),
    type: "PER_SESSION_OPENED",
    timestamp: nowIso(),
    sessionId: session.id,
    buyer: input.buyer,
    note: "Private checkout session opened.",
  });
  persist(state);

  return session;
}

function recordPrivateDeposit(state, session) {
  state.privateLedger.unshift({
    id: id("priv_evt"),
    type: "PRIVATE_DEPOSIT",
    timestamp: nowIso(),
    sessionId: session.id,
    note: `Deposited ${session.asset} into private payment session.`,
  });
  persist(state);
}

function recordPrivateTransfer(state, session) {
  state.privateLedger.unshift({
    id: id("priv_evt"),
    type: "PRIVATE_TRANSFER",
    timestamp: nowIso(),
    sessionId: session.id,
    note: "Private transfer executed to provider escrow.",
  });
  persist(state);
}

function recordPrivateWithdraw(state, session, result) {
  state.privateLedger.unshift({
    id: id("priv_evt"),
    type: result.status === "SUCCESS" ? "PRIVATE_WITHDRAW" : "PRIVATE_WITHDRAW_SKIPPED",
    timestamp: nowIso(),
    sessionId: session.id,
    note:
      result.status === "SUCCESS"
        ? "Provider withdrawal executed from private balance."
        : result.reason || "Provider withdrawal skipped.",
  });
  persist(state);
}

function issueReceipt(state, session) {
  const receipt = {
    token: id("receipt"),
    createdAt: nowIso(),
    sessionId: session.id,
    provider: session.provider,
    endpoint: session.endpoint,
    amount: session.amount,
    asset: session.asset,
    status: "VALID",
    useCount: 0,
    maxUses: 1,
  };

  state.receipts.unshift(receipt);
  state.privateLedger.unshift({
    id: id("priv_evt"),
    type: "RECEIPT_ISSUED",
    timestamp: nowIso(),
    sessionId: session.id,
    note: "Receipt token issued to buyer/agent.",
  });
  persist(state);

  return receipt;
}

function recordPublicPayment(state, input) {
  const entry = {
    id: id("pub_evt"),
    type: "PUBLIC_PAYMENT",
    timestamp: nowIso(),
    provider: input.provider,
    endpoint: input.endpoint,
    itemLabel: input.itemLabel,
    amount: input.amount,
    asset: input.asset,
    buyer: input.buyer,
    note: "Everything is publicly inferable from the payment trail.",
  };

  state.publicLedger.unshift(entry);
  persist(state);
  return entry;
}

function recordProviderSettlement(state, session, mode) {
  const settlement = {
    id: id("settle"),
    timestamp: nowIso(),
    provider: session.provider,
    mode,
    visibleOnPublicChain:
      mode === "private"
        ? "Batched provider settlement only; per-call details remain concealed."
        : "Per-call payment visible.",
    amount: mode === "private" ? "batched" : session.amount,
    asset: session.asset,
  };

  state.providerSettlements.unshift(settlement);

  if (mode === "private") {
    state.publicLedger.unshift({
      id: id("pub_evt"),
      type: "BATCHED_PROVIDER_SETTLEMENT",
      timestamp: nowIso(),
      provider: session.provider,
      amount: "batched",
      asset: session.asset,
      note: "Only the provider settlement is visible; no readable per-call trace.",
    });
  }

  persist(state);
}

function recordFlowRun(state, input) {
  state.flowRuns.unshift({
    id: id("flow"),
    timestamp: nowIso(),
    mode: input.mode,
    endpoint: input.endpoint,
    itemLabel: input.itemLabel,
    status: input.status,
    responseSummary: input.responseSummary,
  });
  persist(state);
}

function snapshot(state) {
  return {
    config: state.config,
    sessions: state.sessions.slice(0, 8),
    receipts: state.receipts.slice(0, 8),
    publicLedger: state.publicLedger.slice(0, 12),
    privateLedger: state.privateLedger.slice(0, 12),
    providerSettlements: state.providerSettlements.slice(0, 8),
    flowRuns: state.flowRuns.slice(0, 8),
  };
}

module.exports = {
  createState,
  openPrivateSession,
  recordPrivateDeposit,
  recordPrivateTransfer,
  recordPrivateWithdraw,
  issueReceipt,
  recordPublicPayment,
  recordProviderSettlement,
  recordFlowRun,
  snapshot,
  resetState,
  attachPersistence,
  persistState: persist,
};
