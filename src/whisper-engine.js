const {
  openPrivateSession,
  recordPrivateDeposit,
  recordPrivateTransfer,
  recordPrivateWithdraw,
  issueReceipt,
  recordProviderSettlement,
  persistState,
} = require("./app-state");

async function runPrivateCheckout(state, adapter, paymentSpec, buyer) {
  const session = openPrivateSession(state, {
    buyer,
    provider: paymentSpec.provider,
    endpoint: paymentSpec.endpoint,
    itemLabel: paymentSpec.itemLabel,
    amount: paymentSpec.amount,
    asset: paymentSpec.asset,
  });

  const depositResult = await adapter.deposit(session);
  recordPrivateDeposit(state, session);

  const transferResult = await adapter.transfer(session);
  recordPrivateTransfer(state, session);

  const withdrawResult = await adapter.withdraw(session);
  recordPrivateWithdraw(state, session, withdrawResult);

  const receipt = issueReceipt(state, session);
  recordProviderSettlement(state, session, "private");

  return {
    session,
    receipt,
    steps: [depositResult, transferResult, withdrawResult],
  };
}

async function prepareClientCheckout(state, adapter, paymentSpec, buyerPublicKey) {
  const session = openPrivateSession(state, {
    buyer: buyerPublicKey,
    provider: paymentSpec.provider,
    endpoint: paymentSpec.endpoint,
    itemLabel: paymentSpec.itemLabel,
    amount: paymentSpec.amount,
    asset: paymentSpec.asset,
  });

  const prepared = await adapter.prepareClientCheckout(session, buyerPublicKey);
  persistState(state);

  return {
    session,
    signingSteps: prepared.signingSteps,
  };
}

async function completeClientCheckout(state, adapter, session, signedSteps) {
  const checkout = await adapter.completeClientCheckout(session, signedSteps);

  const executedSteps = checkout.paymentSteps || [];
  if (executedSteps.some((step) => step.step === "deposit" && step.status === "SUCCESS")) {
    recordPrivateDeposit(state, session);
  }
  if (
    executedSteps.some((step) => step.step === "private-transfer" && step.status === "SUCCESS")
  ) {
    recordPrivateTransfer(state, session);
  }

  recordPrivateWithdraw(state, session, checkout.withdrawResult);

  const receipt = issueReceipt(state, session);
  recordProviderSettlement(state, session, "private");
  session.status = "RECEIPT_READY";
  persistState(state);

  return {
    session,
    receipt,
    steps: [...executedSteps, checkout.withdrawResult],
  };
}

module.exports = {
  prepareClientCheckout,
  completeClientCheckout,
  runPrivateCheckout,
};
