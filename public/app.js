(function bootstrap() {
  if (!document.querySelector("#endpoint-select")) {
    return;
  }

  const state = {
    running: false,
    steps: [],
    lastResult: null,
  };

  function tickClock() {
    const clock = document.getElementById("clock");
    if (!clock) {
      return;
    }

    clock.textContent = new Date().toLocaleTimeString("en-US", { hour12: false });
  }

  function switchTab(id) {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));

    const tab = document.getElementById(`tab-${id}`);
    const panel = document.getElementById(`panel-${id}`);

    if (tab) {
      tab.classList.add("active");
    }

    if (panel) {
      panel.classList.add("active");
    }
  }

  function showToast(message, type = "") {
    const toast = document.getElementById("toast");
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.className = "";
    toast.offsetHeight;
    toast.className = `show ${type}`.trim();

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.className = "";
    }, 2600);
  }

  function syntaxHighlight(obj) {
    const json = JSON.stringify(obj, null, 2);
    return json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(
        /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
        (match) => {
          if (/^"/.test(match)) {
            if (/:$/.test(match)) {
              return `<span class="key">${match}</span>`;
            }

            return `<span class="str">${match}</span>`;
          }

          if (/true/.test(match)) {
            return `<span class="bool-true">${match}</span>`;
          }

          if (/false/.test(match)) {
            return `<span class="bool-false">${match}</span>`;
          }

          if (/null/.test(match)) {
            return `<span class="null">${match}</span>`;
          }

          return `<span class="num">${match}</span>`;
        }
      );
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || payload.error || "Request failed.");
    }

    return payload;
  }

  async function loadCatalog() {
    const payload = await fetchJson("/api/catalog");
    const select = document.getElementById("endpoint-select");

    if (!select) {
      return;
    }

    select.innerHTML = payload.items
      .map(
        (item) =>
          `<option value="${item.endpoint}">${item.itemLabel} - ${item.amount} ${item.asset}</option>`
      )
      .join("");
  }

  function applyStatus(status) {
    const setField = (id, value, cls) => {
      const element = document.getElementById(id);
      if (!element) {
        return;
      }

      element.textContent = String(value ?? "—");
      element.className = `status-field-val ${cls || ""}`.trim();
    };

    setField("sf-mode", status.mode, status.mode === "magicblock-live" ? "green" : "yellow");
    setField("sf-ready", status.ready ? "true" : "false", status.ready ? "green" : "red");
    setField("sf-health", status.health || "—", status.health === "ok" ? "green" : "red");
    setField("sf-cluster", status.cluster || "—");
    setField(
      "sf-mint",
      status.mintInitialized ? "true" : "false",
      status.mintInitialized ? "green" : "yellow"
    );
    setField(
      "sf-buyer",
      status.buyer ? `${status.buyer.slice(0, 8)}…` : "not set",
      status.buyer ? "" : "red"
    );
    setField(
      "sf-provider",
      status.providerDestination ? `${status.providerDestination.slice(0, 8)}…` : "not set",
      status.providerDestination ? "" : "red"
    );
    setField(
      "sf-withdraw",
      status.providerWithdrawEnabled ? "enabled" : "disabled",
      status.providerWithdrawEnabled ? "green" : "yellow"
    );

    const modeBadge = document.getElementById("mode-badge");
    const modeText = document.getElementById("mode-text");

    if (modeBadge && modeText) {
      modeBadge.className = `mode-badge ${
        status.mode === "magicblock-live" ? "live" : "demo"
      }`;
      modeText.textContent = status.mode === "magicblock-live" ? "magicblock-live" : "demo mode";
    }

    const healthPill = document.getElementById("health-pill");

    if (healthPill) {
      const ok = status.health === "ok";
      healthPill.textContent = ok ? "● health: ok" : "● health: error";
      healthPill.style.color = ok ? "var(--accent)" : "var(--danger)";
      healthPill.style.borderColor = ok
        ? "rgba(0,220,150,0.2)"
        : "rgba(255,77,77,0.2)";
      healthPill.style.background = ok
        ? "rgba(0,220,150,0.08)"
        : "rgba(255,77,77,0.08)";
    }
  }

  async function loadStatus() {
    try {
      const status = await fetchJson("/api/integration/status");
      applyStatus(status);
    } catch (error) {
      const modeField = document.getElementById("sf-mode");
      if (modeField) {
        modeField.textContent = "error";
        modeField.className = "status-field-val red";
      }
    }
  }

  function renderEventCards(items, containerId) {
    const element = document.getElementById(containerId);

    if (!element) {
      return;
    }

    if (!items || !items.length) {
      element.innerHTML =
        '<div class="empty-state"><div class="empty-icon">○</div><span class="empty-text">No events yet</span></div>';
      return;
    }

    element.innerHTML = items
      .map((item) => {
        const type = item.type || "EVENT";
        const cls = type.includes("PUBLIC") || type.includes("BATCHED")
          ? "public"
          : type.includes("RECEIPT") ||
              type.includes("WITHDRAW") ||
              type.includes("DEPOSIT") ||
              type.includes("TRANSFER") ||
              type.includes("SESSION")
            ? "private"
            : "system";
        const time = item.timestamp
          ? new Date(item.timestamp).toLocaleTimeString("en-US", { hour12: false })
          : "";
        const detail = Object.entries(item)
          .filter(([key]) => !["id", "type", "timestamp"].includes(key))
          .slice(0, 4)
          .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
          .join(" &nbsp;·&nbsp; ");

        return `<div class="event-card">
          <div class="event-card-top">
            <span class="event-type ${cls}">${type}</span>
            <span class="event-time">${time}</span>
          </div>
          <div class="event-body">${detail}</div>
        </div>`;
      })
      .join("");
  }

  function renderReceipts(sessions, receipts) {
    const all = [...receipts, ...sessions].sort(
      (a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp)
    );
    const list = document.getElementById("receipts-list");
    const count = document.getElementById("receipts-count");

    if (!list || !count) {
      return;
    }

    count.textContent = `${all.length} items`;

    if (!all.length) {
      list.innerHTML =
        '<div class="empty-state"><div class="empty-icon">⬡</div><span class="empty-text">No receipts yet</span></div>';
      return;
    }

    list.innerHTML = all
      .map((item) => {
        const isReceipt = Boolean(item.token);
        const type = isReceipt ? "RECEIPT" : "SESSION";
        const cls = isReceipt ? "private" : "system";
        const status = item.status || "OPEN";
        const id = item.token || item.id || "—";
        const time = new Date(item.createdAt || item.timestamp).toLocaleTimeString("en-US", {
          hour12: false,
        });

        return `<div class="event-card">
          <div class="event-card-top">
            <span class="event-type ${cls}">${type}</span>
            <span class="event-time">${time}</span>
          </div>
          <div class="event-body">
            <strong>id:</strong> ${id.slice(0, 16)}… &nbsp;·&nbsp;
            <strong>status:</strong> ${status}${
              item.amount ? ` &nbsp;·&nbsp; <strong>amount:</strong> ${item.amount} ${item.asset || ""}` : ""
            }
          </div>
        </div>`;
      })
      .join("");
  }

  function renderSteps(steps, settlements) {
    const list = document.getElementById("steps-list");
    const count = document.getElementById("steps-count");
    const settlementsList = document.getElementById("settlements-list");

    if (!list || !count || !settlementsList) {
      return;
    }

    count.textContent = `${(steps || []).length} steps`;

    if (!steps || !steps.length) {
      list.innerHTML =
        '<div class="step-row" style="border-top:1px solid var(--border)"><span class="step-row-name" style="color:var(--muted)">—</span><span class="step-row-status pending">pending</span><span class="step-row-detail" style="color:var(--muted)">awaiting run</span><span class="step-row-net">—</span></div>';
    } else {
      list.innerHTML = steps
        .map((step) => {
          const statusCls =
            step.status === "SUCCESS"
              ? "success"
              : step.status === "SKIPPED"
                ? "skipped"
                : step.status === "ERROR"
                  ? "error"
                  : "pending";
          const sig = step.signature ? `sig: ${step.signature.slice(0, 12)}…` : "";
          const destination = step.destination ? `${step.destination.slice(0, 12)}…` : "";
          const detail = step.reason || sig || destination || "—";
          const net = step.sendTo
            ? `<span>${step.sendTo}</span>`
            : step.network
              ? `<span>${step.network.replace("MagicBlock ", "")}</span>`
              : "—";

          return `<div class="step-row">
            <span class="step-row-name">${step.step || step.kind || "—"}</span>
            <span class="step-row-status ${statusCls}">${step.status || "—"}</span>
            <span class="step-row-detail">${detail}</span>
            <span class="step-row-net">${net}</span>
          </div>`;
        })
        .join("");
    }

    if (!settlements || !settlements.length) {
      settlementsList.innerHTML =
        '<div style="color:var(--muted);font-size:10px">No settlements yet.</div>';
      return;
    }

    settlementsList.innerHTML = settlements
      .slice(0, 4)
      .map(
        (settlement) => `<div class="event-card" style="margin-bottom:6px">
          <div class="event-body">
            <strong>provider:</strong> ${(settlement.provider || "").slice(0, 28)} &nbsp;·&nbsp;
            <strong>mode:</strong> ${settlement.mode || "—"} &nbsp;·&nbsp;
            <strong>amount:</strong> ${settlement.amount} ${settlement.asset || ""}
            <div class="event-sig">${settlement.visibleOnPublicChain || ""}</div>
          </div>
        </div>`
      )
      .join("");
  }

  async function refreshState() {
    const [statusResult, stateResult] = await Promise.allSettled([
      fetchJson("/api/integration/status"),
      fetchJson("/api/state"),
    ]);

    if (statusResult.status === "fulfilled") {
      applyStatus(statusResult.value);
    }

    if (stateResult.status === "fulfilled") {
      const payload = stateResult.value;
      renderEventCards(payload.publicLedger, "public-ledger");
      renderEventCards(payload.privateLedger, "private-ledger");
      renderReceipts(payload.sessions || [], payload.receipts || []);
      renderSteps(state.steps, payload.providerSettlements || []);
    }
  }

  async function runFlow(mode) {
    if (state.running) {
      return;
    }

    state.running = true;
    const button = document.getElementById(`btn-${mode === "private" ? "private" : "public"}`);
    const endpoint = document.getElementById("endpoint-select")?.value;
    const badge = document.getElementById("result-badge");
    const resultOut = document.getElementById("result-out");

    if (button) {
      button.classList.add("loading");
    }

    if (badge) {
      badge.textContent = "running…";
      badge.className = `pane-badge ${mode === "private" ? "private" : "public"}`;
    }

    if (resultOut) {
      resultOut.innerHTML = '<span style="color:var(--muted)">// sending request…</span>';
    }

    try {
      const response = await fetch(`/api/demo/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ endpoint }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || payload.error || "Request failed.");
      }

      state.lastResult = payload;
      state.steps = payload.paymentSteps || [];

      if (resultOut) {
        resultOut.innerHTML = syntaxHighlight(payload);
      }

      if (badge) {
        badge.textContent = `${mode} · ok`;
        badge.className = `pane-badge ${mode === "private" ? "private" : "public"}`;
      }

      if (mode === "private" && state.steps.length) {
        switchTab("steps");
      }

      await refreshState();
      showToast(mode === "private" ? "Private flow complete" : "Public flow complete", "success");
    } catch (error) {
      if (resultOut) {
        resultOut.innerHTML = `<span style="color:var(--danger)">// error: ${error.message}</span>`;
      }

      showToast(`Request failed: ${error.message}`, "error");
    } finally {
      state.running = false;

      if (button) {
        button.classList.remove("loading");
      }
    }
  }

  async function resetDemo() {
    await fetchJson("/api/reset", { method: "POST" });
    state.steps = [];
    state.lastResult = null;

    const resultOut = document.getElementById("result-out");
    const badge = document.getElementById("result-badge");

    if (resultOut) {
      resultOut.innerHTML = '<span style="color:var(--muted)">// demo reset</span>';
    }

    if (badge) {
      badge.textContent = "awaiting run";
    }

    await refreshState();
    showToast("Demo reset");
  }

  window.switchTab = switchTab;
  window.runFlow = runFlow;
  window.resetDemo = resetDemo;

  tickClock();
  setInterval(tickClock, 1000);

  (async function init() {
    try {
      await loadCatalog();
      await refreshState();
    } catch (error) {
      showToast(`Init failed: ${error.message}`, "error");
    }

    setInterval(loadStatus, 15000);
  })();
})();
