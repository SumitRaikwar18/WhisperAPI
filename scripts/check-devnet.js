const path = require("node:path");
const { loadProjectEnv } = require("../src/env-loader");
const { createState } = require("../src/app-state");
const { createPaymentAdapter } = require("../src/payment-adapters");

async function main() {
  loadProjectEnv(path.join(__dirname, ".."));
  process.env.WHISPER_PAYMENT_MODE = process.env.WHISPER_PAYMENT_MODE || "magicblock-live";
  process.env.MAGICBLOCK_CLUSTER = process.env.MAGICBLOCK_CLUSTER || "devnet";

  const state = createState();
  const adapter = createPaymentAdapter(state);

  if (!adapter.getStatus) {
    throw new Error("Current adapter does not expose getStatus().");
  }

  const status = await adapter.getStatus();
  console.log(JSON.stringify(status, null, 2));
}

main().catch((error) => {
  if (error && typeof error.message === "string") {
    console.error(error.message);
  } else {
    console.error(JSON.stringify(error, null, 2));
  }
  process.exitCode = 1;
});
