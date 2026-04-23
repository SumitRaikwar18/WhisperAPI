const {
  openPrivateSession,
  recordPrivateDeposit,
  recordPrivateTransfer,
  recordPrivateWithdraw,
  issueReceipt,
  recordProviderSettlement,
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

module.exports = {
  runPrivateCheckout,
};
