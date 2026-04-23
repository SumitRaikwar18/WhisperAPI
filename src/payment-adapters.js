const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  clusterApiUrl,
} = require("@solana/web3.js");
const bs58 = require("bs58");
const nacl = require("tweetnacl");
const {
  getAuthToken,
} = require("@magicblock-labs/ephemeral-rollups-sdk");

const MAGICBLOCK_API_BASE =
  process.env.MAGICBLOCK_API_BASE || "https://payments.magicblock.app";
const DEVNET_EPHEMERAL_RPC = "https://devnet.magicblock.app";
const DEVNET_TEE_RPC = "https://devnet-tee.magicblock.app";
const MAINNET_TEE_RPC = "https://mainnet-tee.magicblock.app";
const DEVNET_TEE_VALIDATOR = "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo";
const MAINNET_TEE_VALIDATOR = "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo";
const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function normalizeCluster(input) {
  if (!input || input === "devnet") {
    return "devnet";
  }

  if (input === "mainnet" || input === "mainnet-beta") {
    return "mainnet";
  }

  return input;
}

function isCustomCluster(input) {
  return typeof input === "string" && /^https?:\/\//.test(input);
}

function resolveBaseRpcUrl(cluster) {
  if (isCustomCluster(cluster)) {
    return cluster;
  }

  return cluster === "mainnet" ? clusterApiUrl("mainnet-beta") : clusterApiUrl("devnet");
}

function resolveEphemeralRpcUrl(cluster) {
  return cluster === "mainnet" ? MAINNET_TEE_RPC : DEVNET_EPHEMERAL_RPC;
}

function resolveValidator(cluster) {
  return cluster === "mainnet" ? MAINNET_TEE_VALIDATOR : DEVNET_TEE_VALIDATOR;
}

function parseSecretKey(value) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  try {
    if (trimmed.startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
    }

    if (trimmed.startsWith("base64:")) {
      return Keypair.fromSecretKey(Buffer.from(trimmed.slice(7), "base64"));
    }

    return Keypair.fromSecretKey(bs58.decode(trimmed));
  } catch (error) {
    throw new Error(`Invalid secret key format: ${error.message}`);
  }
}

function toMinorUnits(amount, decimals) {
  const [wholePart, fractionalPart = ""] = String(amount).split(".");
  const scale = 10n ** BigInt(decimals);
  const normalizedFraction = `${fractionalPart}${"0".repeat(decimals)}`.slice(0, decimals);
  const whole = BigInt(wholePart || "0");
  const fraction = BigInt(normalizedFraction || "0");
  const units = whole * scale + fraction;

  if (units > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is too large for the current JSON transport.");
  }

  return Number(units);
}

function buildQuery(params) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  }

  return search.toString();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const rawMessage = payload.message || payload.error || `${response.status} ${response.statusText}`;
    const errorMessage =
      typeof rawMessage === "string" ? rawMessage : JSON.stringify(rawMessage);
    throw new Error(errorMessage);
  }

  return payload;
}

async function tryFetchJsonVariants(variants) {
  let lastError = null;

  for (const variant of variants) {
    try {
      return await fetchJson(variant.url, variant.options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("All request variants failed.");
}

function deserializeTransaction(builderResponse) {
  const buffer = Buffer.from(builderResponse.transactionBase64, "base64");

  if (builderResponse.version && builderResponse.version !== "legacy") {
    return VersionedTransaction.deserialize(buffer);
  }

  return Transaction.from(buffer);
}

function signTransaction(transaction, signer) {
  if (transaction instanceof VersionedTransaction) {
    transaction.sign([signer]);
    return transaction.serialize();
  }

  transaction.partialSign(signer);
  return transaction.serialize();
}

class DemoPrivatePaymentsAdapter {
  constructor(state) {
    this.state = state;
    this.state.config.providerEscrow = "escrow_skyweather_demo";
  }

  async getStatus() {
    return {
      mode: "demo",
      ready: true,
      apiBase: null,
      cluster: null,
      validator: null,
      baseRpcUrl: null,
      ephemeralRpcUrl: null,
      mint: null,
      buyer: null,
      providerDestination: null,
      providerWithdrawEnabled: false,
      health: "not-applicable",
      missing: [],
    };
  }

  async deposit(session) {
    return {
      network: "MagicBlock PER (demo)",
      status: "SUCCESS",
      sessionId: session.id,
      step: "deposit",
    };
  }

  async transfer(session) {
    return {
      network: "MagicBlock PER (demo)",
      status: "SUCCESS",
      sessionId: session.id,
      step: "private-transfer",
    };
  }

  async withdraw(session) {
    return {
      network: "Solana settlement (demo)",
      status: "SKIPPED",
      sessionId: session.id,
      step: "withdraw",
      reason: "Demo mode keeps provider settlement simulated.",
    };
  }
}

class MagicBlockPrivatePaymentsAdapter {
  constructor(state) {
    this.state = state;
    this.cluster = normalizeCluster(process.env.MAGICBLOCK_CLUSTER);
    this.baseRpcUrl = process.env.SOLANA_RPC_URL || resolveBaseRpcUrl(this.cluster);
    this.ephemeralRpcUrl =
      process.env.MAGICBLOCK_EPHEMERAL_RPC_URL || resolveEphemeralRpcUrl(this.cluster);
    this.validator = process.env.MAGICBLOCK_VALIDATOR || resolveValidator(this.cluster);
    this.mint = process.env.MAGICBLOCK_MINT || DEFAULT_USDC_MINT;
    this.decimals = Number(process.env.MAGICBLOCK_MINT_DECIMALS || "6");
    this.maxPaymentUsdc = Number(process.env.WHISPER_MAX_PAYMENT_USDC || "5");
    this.buyerSigner = parseSecretKey(process.env.WHISPER_SIGNER_SECRET || "");
    this.providerSigner = parseSecretKey(process.env.WHISPER_PROVIDER_SECRET || "");
    this.providerDestination =
      process.env.WHISPER_PROVIDER_DESTINATION ||
      this.providerSigner?.publicKey.toBase58() ||
      "";
    this.providerWithdrawEnabled =
      process.env.WHISPER_PROVIDER_WITHDRAW === "true" && !!this.providerSigner;
    this.memoPrefix = process.env.WHISPER_MEMO_PREFIX || "WhisperAPI";
    this.teeRpcUrl =
      process.env.MAGICBLOCK_TEE_RPC_URL ||
      (this.cluster === "mainnet" ? MAINNET_TEE_RPC : DEVNET_TEE_RPC);
    this.baseConnection = new Connection(this.baseRpcUrl, "confirmed");
    this.ephemeralConnection = new Connection(this.ephemeralRpcUrl, "confirmed");
    this.authTokenCache = new Map();

    this.state.config.privateNetwork = `MagicBlock PER (${this.cluster})`;
    this.state.config.providerEscrow = this.providerDestination || "unconfigured";
  }

  assertWithinSpendCap(session) {
    if (this.maxPaymentUsdc > 0 && Number(session.amount) > this.maxPaymentUsdc) {
      throw new Error(
        `Payment amount ${session.amount} exceeds WHISPER_MAX_PAYMENT_USDC=${this.maxPaymentUsdc}`
      );
    }
  }

  requiredEnv() {
    const missing = [];

    if (!this.buyerSigner) {
      missing.push("WHISPER_SIGNER_SECRET");
    }

    if (!this.providerDestination) {
      missing.push("WHISPER_PROVIDER_DESTINATION or WHISPER_PROVIDER_SECRET");
    }

    if (this.providerWithdrawEnabled && !this.providerSigner) {
      missing.push("WHISPER_PROVIDER_SECRET");
    }

    if (
      this.providerWithdrawEnabled &&
      this.providerSigner &&
      this.providerDestination !== this.providerSigner.publicKey.toBase58()
    ) {
      missing.push("WHISPER_PROVIDER_DESTINATION must match WHISPER_PROVIDER_SECRET public key");
    }

    return missing;
  }

  assertReady() {
    const missing = this.requiredEnv();

    if (missing.length) {
      throw new Error(`Live MagicBlock integration is not ready: ${missing.join(", ")}`);
    }
  }

  async apiGet(path, params) {
    const query = buildQuery(params);
    const url = query ? `${MAGICBLOCK_API_BASE}${path}?${query}` : `${MAGICBLOCK_API_BASE}${path}`;
    return fetchJson(url);
  }

  async apiPost(path, body) {
    return fetchJson(`${MAGICBLOCK_API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  async getPrivateBalance(owner, authorizationToken) {
    const query = buildQuery({
      owner,
      address: owner,
      cluster: this.cluster,
      mint: this.mint,
      authorization: authorizationToken,
    });
    const url = `${MAGICBLOCK_API_BASE}/v1/spl/private-balance?${query}`;

    return tryFetchJsonVariants([
      { url, options: {} },
      {
        url: `${MAGICBLOCK_API_BASE}/v1/spl/private-balance?${buildQuery({
          owner,
          address: owner,
          cluster: this.cluster,
          mint: this.mint,
        })}`,
        options: {
          headers: {
            authorization: authorizationToken,
          },
        },
      },
      {
        url: `${MAGICBLOCK_API_BASE}/v1/spl/private-balance?${buildQuery({
          owner,
          address: owner,
          cluster: this.cluster,
          mint: this.mint,
        })}`,
        options: {
          headers: {
            Authorization: `Bearer ${authorizationToken}`,
          },
        },
      },
    ]);
  }

  async health() {
    return this.apiGet("/health");
  }

  async ensureMintInitialized() {
    const existing = await this.apiGet("/v1/spl/is-mint-initialized", {
      mint: this.mint,
      cluster: this.cluster,
      validator: this.validator,
    });

    if (existing.initialized) {
      return {
        initialized: true,
        transferQueue: existing.transferQueue || null,
        signature: null,
      };
    }

    const builder = await this.apiPost("/v1/spl/initialize-mint", {
      payer: this.buyerSigner.publicKey.toBase58(),
      owner: this.buyerSigner.publicKey.toBase58(),
      mint: this.mint,
      cluster: this.cluster,
      validator: this.validator,
    });
    const signature = await this.submitBuiltTransaction(builder, this.buyerSigner);

    return {
      initialized: true,
      transferQueue: existing.transferQueue || null,
      signature,
    };
  }

  async getAuthTokenForSigner(signer) {
    const cacheKey = signer.publicKey.toBase58();
    const cached = this.authTokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now() + 30_000) {
      return cached.token;
    }

    const auth = await getAuthToken(
      this.teeRpcUrl,
      new PublicKey(cacheKey),
      async (message) => nacl.sign.detached(message, signer.secretKey)
    );

    this.authTokenCache.set(cacheKey, auth);
    return auth.token;
  }

  connectionForSendTarget(sendTo) {
    const lower = String(sendTo || "").toLowerCase();
    return lower === "base" ? this.baseConnection : this.ephemeralConnection;
  }

  async submitBuiltTransaction(builderResponse, signer) {
    const transaction = deserializeTransaction(builderResponse);
    const serialized = signTransaction(transaction, signer);
    const connection = this.connectionForSendTarget(builderResponse.sendTo);
    try {
      const signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: builderResponse.sendTo === "ephemeral",
        maxRetries: 3,
      });

      if (builderResponse.recentBlockhash && builderResponse.lastValidBlockHeight) {
        await connection.confirmTransaction(
          {
            blockhash: builderResponse.recentBlockhash,
            lastValidBlockHeight: builderResponse.lastValidBlockHeight,
            signature,
          },
          "confirmed"
        );
      } else {
        await connection.confirmTransaction(signature, "confirmed");
      }

      return signature;
    } catch (error) {
      throw new Error(
        `Transaction submission failed for kind=${builderResponse.kind} sendTo=${builderResponse.sendTo} validator=${builderResponse.validator || this.validator}: ${error.message}`
      );
    }
  }

  async getBalanceSnapshot() {
    const result = {};
    const errors = [];

    if (!this.buyerSigner) {
      return { balances: result, errors };
    }

    const owner = this.buyerSigner.publicKey.toBase58();
    result.base = await this.apiGet("/v1/spl/balance", {
      address: owner,
      cluster: this.cluster,
      mint: this.mint,
    });

    try {
      const buyerToken = await this.getAuthTokenForSigner(this.buyerSigner);
      result.private = await this.getPrivateBalance(owner, buyerToken);
    } catch (error) {
      errors.push(`buyer private balance: ${error.message}`);
    }

    if (this.providerDestination && this.providerSigner) {
      try {
        const providerToken = await this.getAuthTokenForSigner(this.providerSigner);
        result.providerPrivate = await this.getPrivateBalance(
          this.providerDestination,
          providerToken
        );
      } catch (error) {
        errors.push(`provider private balance: ${error.message}`);
      }
    }

    return { balances: result, errors };
  }

  async getStatus() {
    const missing = this.requiredEnv();
    const health = await this.health();
    const mintStatus = await this.apiGet("/v1/spl/is-mint-initialized", {
      mint: this.mint,
      cluster: this.cluster,
      validator: this.validator,
    });
    let balances = {};
    let balanceError = null;

    if (!missing.length) {
      try {
        const balanceSnapshot = await this.getBalanceSnapshot();
        balances = balanceSnapshot.balances;
        balanceError = balanceSnapshot.errors.length
          ? balanceSnapshot.errors.join("; ")
          : null;
      } catch (error) {
        balanceError = error.message;
      }
    }

    return {
      mode: "magicblock-live",
      ready: missing.length === 0,
      apiBase: MAGICBLOCK_API_BASE,
      cluster: this.cluster,
      validator: this.validator,
      baseRpcUrl: this.baseRpcUrl,
      ephemeralRpcUrl: this.ephemeralRpcUrl,
      mint: this.mint,
      decimals: this.decimals,
      buyer: this.buyerSigner?.publicKey.toBase58() || null,
      providerDestination: this.providerDestination || null,
      providerWithdrawEnabled: this.providerWithdrawEnabled,
      health: health.status,
      mintInitialized: mintStatus.initialized,
      transferQueue: mintStatus.transferQueue || null,
      missing,
      balances,
      balanceError,
    };
  }

  buildStepResult(step, session, builderResponse, signature, extra = {}) {
    return {
      step,
      status: "SUCCESS",
      sessionId: session.id,
      network: builderResponse.sendTo === "base" ? "Solana base" : "MagicBlock PER",
      validator: builderResponse.validator || this.validator,
      signature,
      sendTo: builderResponse.sendTo,
      recentBlockhash: builderResponse.recentBlockhash || null,
      lastValidBlockHeight: builderResponse.lastValidBlockHeight || null,
      ...extra,
    };
  }

  async deposit(session) {
    this.assertReady();
    this.assertWithinSpendCap(session);
    const amount = toMinorUnits(session.amount, this.decimals);
    await this.ensureMintInitialized();
    const builder = await this.apiPost("/v1/spl/deposit", {
      owner: this.buyerSigner.publicKey.toBase58(),
      amount,
      cluster: this.cluster,
      mint: this.mint,
      validator: this.validator,
      initIfMissing: true,
      initVaultIfMissing: true,
      initAtasIfMissing: true,
      idempotent: true,
    });
    const signature = await this.submitBuiltTransaction(builder, this.buyerSigner);

    return this.buildStepResult("deposit", session, builder, signature, {
      amountMinor: amount,
    });
  }

  async transfer(session) {
    this.assertReady();
    this.assertWithinSpendCap(session);
    const amount = toMinorUnits(session.amount, this.decimals);
    const memo = `${this.memoPrefix}:${session.id}:${session.itemLabel}`;
    const builder = await this.apiPost("/v1/spl/transfer", {
      from: this.buyerSigner.publicKey.toBase58(),
      to: this.providerDestination,
      fromBalance: "ephemeral",
      toBalance: "ephemeral",
      visibility: "private",
      owner: this.buyerSigner.publicKey.toBase58(),
      destination: this.providerDestination,
      amount,
      cluster: this.cluster,
      mint: this.mint,
      privacy: "private",
      validator: this.validator,
      memo,
    });
    const signature = await this.submitBuiltTransaction(builder, this.buyerSigner);

    return this.buildStepResult("private-transfer", session, builder, signature, {
      amountMinor: amount,
      destination: this.providerDestination,
    });
  }

  async withdraw(session) {
    if (!this.providerWithdrawEnabled) {
      return {
        step: "withdraw",
        status: "SKIPPED",
        sessionId: session.id,
        reason:
          "Provider withdrawal is optional. Set WHISPER_PROVIDER_WITHDRAW=true and WHISPER_PROVIDER_SECRET to enable it.",
      };
    }

    this.assertReady();
    const amount = toMinorUnits(session.amount, this.decimals);
    const builder = await this.apiPost("/v1/spl/withdraw", {
      owner: this.providerDestination,
      amount,
      cluster: this.cluster,
      mint: this.mint,
      validator: this.validator,
    });
    const signature = await this.submitBuiltTransaction(builder, this.providerSigner);

    return this.buildStepResult("withdraw", session, builder, signature, {
      amountMinor: amount,
      destination: this.providerDestination,
    });
  }
}

function createPaymentAdapter(state) {
  if (process.env.WHISPER_PAYMENT_MODE === "magicblock-live") {
    return new MagicBlockPrivatePaymentsAdapter(state);
  }

  return new DemoPrivatePaymentsAdapter(state);
}

module.exports = {
  createPaymentAdapter,
};
