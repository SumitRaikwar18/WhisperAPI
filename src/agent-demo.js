const {
  buildPaymentRequired,
  buildPaymentRequiredForEndpoint,
  resolveItemByEndpoint,
  buildPaidApiResponse,
} = require("./paid-apis");
const {
  recordPublicPayment,
  recordProviderSettlement,
  recordFlowRun,
  persistState,
} = require("./app-state");
const {
  runPrivateCheckout,
  prepareClientCheckout,
  completeClientCheckout,
} = require("./whisper-engine");

function verifyReceipt(state, token, endpoint) {
  const found = state.receipts.find(
    (receipt) =>
      receipt.token === token &&
      receipt.endpoint === endpoint &&
      receipt.status === "VALID" &&
      (receipt.useCount || 0) < (receipt.maxUses || 1)
  );

  if (!found) {
    return false;
  }

  found.useCount = (found.useCount || 0) + 1;
  found.lastUsedAt = new Date().toISOString();

  if (found.useCount >= (found.maxUses || 1)) {
    found.status = "REDEEMED";
    found.usedAt = found.lastUsedAt;
  }

  persistState(state);

  return true;
}

async function accessPaidApi(state, endpoint, receiptToken) {
  const parsed = new URL(`http://local${endpoint}`);
  const item = resolveItemByEndpoint(parsed.pathname, parsed.searchParams);

  if (!item) {
    return {
      status: 404,
      body: { error: "NOT_FOUND" },
    };
  }

  if (!receiptToken || !verifyReceipt(state, receiptToken, item.endpoint)) {
    return {
      status: 402,
      body: buildPaymentRequired(item),
    };
  }

  return {
    status: 200,
    body: await buildPaidApiResponse(parsed.pathname, parsed.searchParams),
  };
}

async function runPrivateFlow(state, adapter, endpoint) {
  const buyer = "agent://demo-buyer";
  const firstResponse = await accessPaidApi(state, endpoint, null);

  if (firstResponse.status !== 402) {
    throw new Error("Expected 402 on first private flow request.");
  }

  const checkout = await runPrivateCheckout(state, adapter, firstResponse.body, buyer);
  const secondResponse = await accessPaidApi(state, endpoint, checkout.receipt.token);

  recordFlowRun(state, {
    mode: "private",
    endpoint,
    itemLabel: firstResponse.body.itemLabel,
    status: secondResponse.status,
    responseSummary: secondResponse.status === 200 ? "Private response delivered" : "Failed",
  });

  return {
    mode: "private",
    paymentRequired: firstResponse.body,
    session: checkout.session,
    receipt: checkout.receipt,
    paymentSteps: checkout.steps,
    response: secondResponse.body,
  };
}

async function runPrivatePayOnly(state, adapter, endpoint) {
  const buyer = "agent://demo-buyer";
  const paymentRequired = buildPaymentRequiredForEndpoint(endpoint);

  if (!paymentRequired) {
    throw new Error(`Unknown paid endpoint: ${endpoint}`);
  }

  const checkout = await runPrivateCheckout(state, adapter, paymentRequired, buyer);

  recordFlowRun(state, {
    mode: "private-pay",
    endpoint,
    itemLabel: paymentRequired.itemLabel,
    status: 200,
    responseSummary: "Fresh receipt issued",
  });

  return {
    mode: "private-pay",
    paymentRequired,
    session: checkout.session,
    receipt: checkout.receipt,
    paymentSteps: checkout.steps,
  };
}

async function preparePrivateClientFlow(state, adapter, endpoint, buyerPublicKey) {
  const paymentRequired = buildPaymentRequiredForEndpoint(endpoint);

  if (!paymentRequired) {
    throw new Error(`Unknown paid endpoint: ${endpoint}`);
  }

  const checkout = await prepareClientCheckout(state, adapter, paymentRequired, buyerPublicKey);

  recordFlowRun(state, {
    mode: "private-client-prepare",
    endpoint,
    itemLabel: paymentRequired.itemLabel,
    status: 200,
    responseSummary: "Unsigned buyer steps prepared",
  });

  return {
    mode: "private-client-prepare",
    paymentRequired,
    session: checkout.session,
    signingSteps: checkout.signingSteps,
    buyerPublicKey,
  };
}

async function completePrivateClientFlow(state, adapter, sessionId, signedSteps) {
  const session = state.sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error(`Unknown paid endpoint session: ${sessionId}`);
  }

  const checkout = await completeClientCheckout(state, adapter, session, signedSteps);

  recordFlowRun(state, {
    mode: "private-client-complete",
    endpoint: session.endpoint,
    itemLabel: session.itemLabel,
    status: 200,
    responseSummary: "Client-signed private payment completed",
  });

  return {
    mode: "private-client-complete",
    session: checkout.session,
    receipt: checkout.receipt,
    paymentSteps: checkout.steps,
  };
}

async function runPublicFlow(state, endpoint) {
  const buyer = "agent://demo-buyer";
  const firstResponse = await accessPaidApi(state, endpoint, null);

  if (firstResponse.status !== 402) {
    throw new Error("Expected 402 on first public flow request.");
  }

  recordPublicPayment(state, {
    provider: firstResponse.body.provider,
    endpoint: firstResponse.body.endpoint,
    itemLabel: firstResponse.body.itemLabel,
    amount: firstResponse.body.amount,
    asset: firstResponse.body.asset,
    buyer,
  });

  recordProviderSettlement(state, {
    provider: firstResponse.body.provider,
    amount: firstResponse.body.amount,
    asset: firstResponse.body.asset,
  }, "public");

  const fakeReceipt = `public_receipt_${Date.now()}`;
  state.receipts.unshift({
    token: fakeReceipt,
    createdAt: new Date().toISOString(),
    sessionId: null,
    provider: firstResponse.body.provider,
    endpoint: firstResponse.body.endpoint,
    amount: firstResponse.body.amount,
    asset: firstResponse.body.asset,
    status: "VALID",
    useCount: 0,
    maxUses: 1,
  });

  const secondResponse = await accessPaidApi(state, endpoint, fakeReceipt);

  recordFlowRun(state, {
    mode: "public",
    endpoint,
    itemLabel: firstResponse.body.itemLabel,
    status: secondResponse.status,
    responseSummary: secondResponse.status === 200 ? "Public response delivered" : "Failed",
  });

  return {
    mode: "public",
    paymentRequired: firstResponse.body,
    receipt: { token: fakeReceipt, visibility: "public" },
    response: secondResponse.body,
  };
}

module.exports = {
  completePrivateClientFlow,
  preparePrivateClientFlow,
  runPrivateFlow,
  runPrivatePayOnly,
  runPublicFlow,
  accessPaidApi,
};
