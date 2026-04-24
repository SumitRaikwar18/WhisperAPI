const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { loadProjectEnv } = require("./src/env-loader");

loadProjectEnv(__dirname);

const {
  createState,
  snapshot,
  resetState,
  attachPersistence,
} = require("./src/app-state");
const { getCatalog } = require("./src/paid-apis");
const { createPaymentAdapter } = require("./src/payment-adapters");
const {
  runPrivateFlow,
  runPrivatePayOnly,
  runPublicFlow,
  accessPaidApi,
} = require("./src/agent-demo");
const {
  DEFAULT_STORE_PATH,
  loadStateSnapshot,
  createStatePersister,
} = require("./src/state-store");

const PORT = process.env.PORT || 3000;
const loadedState = loadStateSnapshot(process.env.WHISPER_STATE_FILE);
const state = createState(loadedState && !loadedState.__loadError ? loadedState : null);
attachPersistence(
  state,
  createStatePersister(process.env.WHISPER_STATE_FILE || DEFAULT_STORE_PATH)
);
const adapter = createPaymentAdapter(state);
const publicDir = path.join(__dirname, "public");
const adminToken = process.env.WHISPER_ADMIN_TOKEN || "";

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, payload, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function classifyError(error) {
  const message = error?.message || "Unexpected error.";

  if (message.includes("Invalid JSON body")) {
    return { statusCode: 400, error: "BAD_REQUEST", message };
  }

  if (message.includes("Invalid X-Payment header") || message.includes("Unknown paid endpoint")) {
    return { statusCode: 400, error: "BAD_REQUEST", message };
  }

  if (
    message.includes("integration is not ready") ||
    message.includes("Invalid secret key format") ||
    message.includes("Unsupported secret key format")
  ) {
    return { statusCode: 400, error: "CONFIGURATION_ERROR", message };
  }

  if (
    message.includes("fetch failed") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED") ||
    message.includes("network")
  ) {
    return { statusCode: 502, error: "UPSTREAM_ERROR", message };
  }

  return { statusCode: 500, error: "INTERNAL_ERROR", message };
}

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
}

function isLocalRequest(req) {
  const ip = getClientIp(req);
  return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1";
}

function readAdminToken(req) {
  const authHeader = req.headers.authorization || "";

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  return req.headers["x-whisper-admin-token"] || "";
}

function requireAdmin(req, res) {
  if (!adminToken && isLocalRequest(req)) {
    return true;
  }

  if (!adminToken) {
    return true;
  }

  if (readAdminToken(req) === adminToken) {
    return true;
  }

  sendJson(res, 401, {
    error: "UNAUTHORIZED",
    message: "Admin token required for this route.",
  });
  return false;
}

function decodeXPayment(headerValue) {
  if (!headerValue) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(headerValue, "base64").toString("utf8"));
  } catch (error) {
    throw new Error(`Invalid X-Payment header: ${error.message}`);
  }
}

function encodeXPaymentResponse(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function extractReceiptToken(req) {
  const directReceipt = req.headers["x-payment-receipt"];

  if (directReceipt) {
    return String(directReceipt);
  }

  const xPayment = decodeXPayment(req.headers["x-payment"]);

  if (!xPayment) {
    return null;
  }

  return (
    xPayment.payload?.receiptToken ||
    xPayment.payload?.receipt ||
    xPayment.receiptToken ||
    null
  );
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.join(publicDir, filePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "FORBIDDEN" });
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      sendJson(res, 404, { error: "NOT_FOUND" });
      return;
    }

    const ext = path.extname(filePath);
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".js"
            ? "application/javascript; charset=utf-8"
            : "text/plain; charset=utf-8";

    sendText(res, 200, buffer, contentType);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const { pathname } = url;

    if (req.method === "GET" && pathname === "/api/catalog") {
      sendJson(res, 200, { items: getCatalog() });
      return;
    }

    if (req.method === "GET" && pathname === "/api/x402/supported") {
      sendJson(res, 200, {
        protocol: "x402-compatible",
        version: 1,
        schemes: ["exact"],
        settlementMode: "server-mediated MagicBlock private receipt",
        payEndpoint: "/api/x402/pay",
        networks: [
          process.env.MAGICBLOCK_CLUSTER === "mainnet" ? "solana-mainnet" : "solana-devnet",
        ],
        headers: {
          request: ["X-Payment", "X-Payment-Receipt"],
          response: ["X-Payment-Response"],
        },
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/state") {
      if (!requireAdmin(req, res)) {
        return;
      }
      sendJson(res, 200, snapshot(state));
      return;
    }

    if (req.method === "GET" && pathname === "/api/integration/status") {
      if (!requireAdmin(req, res)) {
        return;
      }
      const status = adapter.getStatus
        ? await adapter.getStatus()
        : { mode: "unknown", ready: false, missing: ["Adapter does not expose status."] };
      if (loadedState?.__loadError) {
        status.stateWarning = loadedState.__loadError;
      }
      sendJson(res, 200, status);
      return;
    }

    if (req.method === "POST" && pathname === "/api/reset") {
      if (!requireAdmin(req, res)) {
        return;
      }
      resetState(state);
      sendJson(res, 200, { ok: true, state: snapshot(state) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/demo/public") {
      const body = await readBody(req);
      const endpoint = body.endpoint || "/api/mock/weather?city=Singapore";
      const result = await runPublicFlow(state, endpoint);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/demo/private") {
      const body = await readBody(req);
      const endpoint = body.endpoint || "/api/mock/weather?city=Singapore";
      const result = await runPrivateFlow(state, adapter, endpoint);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/x402/pay") {
      const body = await readBody(req);
      const xPayment = decodeXPayment(req.headers["x-payment"]);
      const endpoint =
        body.endpoint ||
        xPayment?.endpoint ||
        xPayment?.payload?.endpoint ||
        xPayment?.paymentRequired?.endpoint ||
        "/api/live/price?asset=solana&vs=usd";
      const result = await runPrivatePayOnly(state, adapter, endpoint);
      sendJson(
        res,
        200,
        {
          ok: true,
          ...result,
        },
        {
          "X-Whisper-Payment-Protocol": "x402-compatible",
          "X-Payment-Response": encodeXPaymentResponse({
            x402Version: 1,
            scheme: "receipt-retry",
            success: true,
            receiptToken: result.receipt.token,
            endpoint,
          }),
        }
      );
      return;
    }

    if (
      req.method === "GET" &&
      (pathname.startsWith("/api/mock/") || pathname.startsWith("/api/live/"))
    ) {
      const receipt = extractReceiptToken(req);
      const result = await accessPaidApi(state, `${pathname}${url.search}`, receipt);
      const responseHeaders =
        result.status === 402 && result.body?.payment
          ? {
              "X-Payment-Protocol": "x402",
              "X-Whisper-Payment-Protocol": "x402-compatible",
              "X-Whisper-Payment-Asset": result.body.asset || "USDC",
              "X-Whisper-Payment-Amount": String(result.body.payment.amountMinor || ""),
              "X-Whisper-Payment-Mint": result.body.payment.mint || "",
              "X-Whisper-Payment-Cluster": result.body.payment.cluster || "",
            }
          : result.status === 200 && receipt
            ? {
                "X-Payment-Response": encodeXPaymentResponse({
                  x402Version: 1,
                  scheme: "receipt-retry",
                  success: true,
                  receiptToken: receipt,
                }),
              }
            : {};
      sendJson(res, result.status, result.body, responseHeaders);
      return;
    }

    if (req.method === "GET" && !pathname.startsWith("/api/")) {
      serveStatic(req, res, pathname);
      return;
    }

    sendJson(res, 404, { error: "NOT_FOUND" });
  } catch (error) {
    const classified = classifyError(error);
    sendJson(res, classified.statusCode, {
      error: classified.error,
      message: classified.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`WhisperAPI running at http://localhost:${PORT}`);
  console.log(`Mode: ${process.env.WHISPER_PAYMENT_MODE || "demo"}`);
});
