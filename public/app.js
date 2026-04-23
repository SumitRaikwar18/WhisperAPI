const endpointSelect = document.querySelector("#endpoint-select");
const publicRunButton = document.querySelector("#public-run");
const privateRunButton = document.querySelector("#private-run");
const resetRunButton = document.querySelector("#reset-run");
const latestResult = document.querySelector("#latest-result");
const integrationStatus = document.querySelector("#integration-status");
const publicLedger = document.querySelector("#public-ledger");
const privateLedger = document.querySelector("#private-ledger");
const settlements = document.querySelector("#settlements");
const receipts = document.querySelector("#receipts");

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Request failed.");
  }

  return payload;
}

function renderCards(container, items, type) {
  if (!items.length) {
    container.className = "timeline empty";
    container.textContent = "No events yet.";
    return;
  }

  container.className = "timeline";
  container.innerHTML = items
    .map((item) => {
      const modeClass =
        type === "public" || item.type?.includes("PUBLIC") || item.type?.includes("BATCHED")
          ? "public"
          : "private";

      return `
        <article class="card">
          <div class="tag ${modeClass}">${item.type || "EVENT"}</div>
          <h3>${item.itemLabel || item.provider || item.note || item.token || item.id}</h3>
          <div class="meta">
            ${Object.entries(item)
              .filter(([key]) => !["id", "type"].includes(key))
              .slice(0, 8)
              .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

async function refreshState() {
  const state = await fetchJson("/api/state");

  renderCards(publicLedger, state.publicLedger, "public");
  renderCards(privateLedger, state.privateLedger, "private");
  renderCards(settlements, state.providerSettlements, "public");
  renderCards(
    receipts,
    [...state.receipts, ...state.sessions].sort(
      (a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp)
    ),
    "private"
  );
}

async function refreshIntegrationStatus() {
  const status = await fetchJson("/api/integration/status");
  integrationStatus.textContent = JSON.stringify(status, null, 2);
}

async function loadCatalog() {
  const payload = await fetchJson("/api/catalog");

  endpointSelect.innerHTML = payload.items
    .map(
      (item) =>
        `<option value="${item.endpoint}">${item.itemLabel} - ${item.amount} ${item.asset}</option>`
    )
    .join("");
}

function setLatestResult(payload) {
  latestResult.textContent = JSON.stringify(payload, null, 2);
}

async function runFlow(mode) {
  const endpoint = endpointSelect.value;
  const payload = await fetchJson(`/api/demo/${mode}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint }),
  });

  setLatestResult(payload);
  await refreshIntegrationStatus();
  await refreshState();
}

async function resetDemo() {
  await fetchJson("/api/reset", { method: "POST" });
  setLatestResult("No flow run yet.");
  await refreshIntegrationStatus();
  await refreshState();
}

publicRunButton.addEventListener("click", () => runFlow("public"));
privateRunButton.addEventListener("click", () => runFlow("private"));
resetRunButton.addEventListener("click", resetDemo);

Promise.all([loadCatalog(), refreshState(), refreshIntegrationStatus()]).catch((error) => {
  setLatestResult({ error: error.message });
  integrationStatus.textContent = JSON.stringify({ error: error.message }, null, 2);
});
