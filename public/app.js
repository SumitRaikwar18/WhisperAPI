(function bootstrap() {
  if (!document.querySelector("#endpoint-select")) {
    return;
  }

  const DEFAULT_JUDGE_ENDPOINT = "/api/live/price?asset=solana&vs=usd";
  const state = {
    running: false,
    steps: [],
    lastResult: null,
    lastPrivateResult: null,
    latestStatus: null,
    protectionToastShown: false,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function tickClock() {
    const clock = byId("clock");

    if (clock) {
      clock.textContent = new Date().toLocaleTimeString("en-US", { hour12: false });
    }
  }

  function switchTab(id) {
    document.querySelectorAll(".tab").forEach((tab) => {
      const active = tab.id === `tab-${id}`;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      const active = panel.id === `panel-${id}`;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });

    const tab = byId(`tab-${id}`);

    if (tab) {
      tab.focus({ preventScroll: true });
    }
  }

  function showToast(message, type) {
    const toast = byId("toast");

    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.className = "";
    toast.offsetHeight;
    toast.className = `show ${type || ""}`.trim();

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.className = "";
    }, 2600);
  }

  function syntaxHighlight(value) {
    const json = JSON.stringify(value, null, 2);
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

          if (match === "true") {
            return `<span class="bool-true">${match}</span>`;
          }

          if (match === "false") {
            return `<span class="bool-false">${match}</span>`;
          }

          if (match === "null") {
            return `<span class="null">${match}</span>`;
          }

          return `<span class="num">${match}</span>`;
        }
      );
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json();

    if (!response.ok) {
      const error = new Error(payload.message || payload.error || "Request failed.");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function renderPlaceholder(targetId, label, detail) {
    const element = byId(targetId);

    if (!element) {
      return;
    }

    element.innerHTML = `<div class="empty-state">
      <div class="empty-icon">[]</div>
      <span class="empty-text">${label}</span>
      ${detail ? `<span class="event-body" style="text-align:center">${detail}</span>` : ""}
    </div>`;
  }

  function renderProtectedState(message) {
    renderPlaceholder("public-ledger", "Protected view", message);
    renderPlaceholder("private-ledger", "Protected view", message);
    renderPlaceholder("receipts-list", "Protected view", message);

    const settlementsList = byId("settlements-list");
    const stepsList = byId("steps-list");
    const resultOut = byId("result-out");

    if (settlementsList) {
      settlementsList.innerHTML = `<div style="color:var(--muted);font-size:10px">${message}</div>`;
    }

    if (stepsList) {
      stepsList.innerHTML =
        `<div class="step-row" style="border-top:1px solid var(--border)">
          <span class="step-row-name" style="color:var(--muted)">observer</span>
          <span class="step-row-status skipped">locked</span>
          <span class="step-row-detail" style="color:var(--muted)">${message}</span>
          <span class="step-row-net">-</span>
        </div>`;
    }

    if (resultOut && !state.lastResult) {
      resultOut.innerHTML = `<span style="color:var(--muted)">// ${message}</span>`;
    }
  }

  function setStatusField(id, value, cls) {
    const element = byId(id);

    if (!element) {
      return;
    }

    element.textContent = String(value ?? "-");
    element.className = `status-field-val ${cls || ""}`.trim();
  }

  function shortKey(value) {
    return value ? `${value.slice(0, 8)}...` : "not set";
  }

  function summarizeProof() {
    if (!state.lastPrivateResult) {
      if (state.latestStatus?.statusProtected) {
        return "Protected deployment: run locally or provide the admin token to view trace data.";
      }

      return "Run the private flow to capture real signatures and response proof.";
    }

    const steps = state.lastPrivateResult.paymentSteps || [];
    const findStep = (name) => steps.find((step) => step.step === name);
    const deposit = findStep("deposit");
    const transfer = findStep("private-transfer");
    const withdraw = findStep("withdraw");

    return [
      `endpoint: ${state.lastPrivateResult.paymentRequired?.endpoint || "-"}`,
      `provider: ${state.lastPrivateResult.paymentRequired?.provider || "-"}`,
      `source: ${state.lastPrivateResult.response?.source || "-"}`,
      `deposit: ${deposit?.signature || deposit?.status || "-"}`,
      `transfer: ${transfer?.signature || transfer?.status || "-"}`,
      `withdraw: ${withdraw?.signature || withdraw?.status || "-"}`,
      `receipt: ${state.lastPrivateResult.receipt?.token || "-"}`,
    ].join("\n");
  }

  function judgeChecks() {
    const status = state.latestStatus || {};
    const steps = state.lastPrivateResult?.paymentSteps || [];
    const hasStepSuccess = (name) =>
      steps.some((step) => step.step === name && step.status === "SUCCESS");

    return [
      {
        label: "Integration ready",
        done: status.ready === true,
      },
      {
        label: "MagicBlock health ok",
        done: status.health === "ok",
      },
      {
        label: "Provider withdraw enabled",
        done: status.providerWithdrawEnabled === true,
      },
      {
        label: "Private run captured",
        done: Boolean(state.lastPrivateResult),
      },
      {
        label: "Deposit, transfer, withdraw proved",
        done:
          hasStepSuccess("deposit") &&
          hasStepSuccess("private-transfer") &&
          hasStepSuccess("withdraw"),
      },
      {
        label: "Judge trace visible",
        done: status.statusProtected !== true,
      },
    ];
  }

  function updateJudgePanel() {
    const checklist = byId("judge-checklist");
    const proof = byId("judge-proof");

    if (proof) {
      proof.textContent = summarizeProof();
    }

    if (!checklist) {
      return;
    }

    checklist.innerHTML = judgeChecks()
      .map(
        (item) => `<div class="judge-check ${item.done ? "done" : ""}">
          <span class="judge-check-dot"></span>
          <span>${item.label}</span>
        </div>`
      )
      .join("");
  }

  function applyStatus(status) {
    state.latestStatus = status;
    if (!status.statusProtected) {
      state.protectionToastShown = false;
    }

    setStatusField("sf-mode", status.mode, status.mode === "magicblock-live" ? "green" : "yellow");
    setStatusField("sf-ready", status.ready ? "true" : "false", status.ready ? "green" : "red");
    setStatusField("sf-health", status.health || "-", status.health === "ok" ? "green" : "red");
    setStatusField("sf-cluster", status.cluster || "-");
    setStatusField(
      "sf-mint",
      status.mintInitialized ? "true" : "false",
      status.mintInitialized ? "green" : "yellow"
    );
    setStatusField("sf-buyer", shortKey(status.buyer), status.buyer ? "" : "red");
    setStatusField(
      "sf-provider",
      shortKey(status.providerDestination),
      status.providerDestination ? "" : "red"
    );
    setStatusField(
      "sf-withdraw",
      status.providerWithdrawEnabled ? "enabled" : "disabled",
      status.providerWithdrawEnabled ? "green" : "yellow"
    );

    const modeBadge = byId("mode-badge");
    const modeText = byId("mode-text");

    if (modeBadge && modeText) {
      modeBadge.className = `mode-badge ${status.mode === "magicblock-live" ? "live" : "demo"}`;
      modeText.textContent = status.mode === "magicblock-live" ? "magicblock-live" : "demo mode";
    }

    const healthPill = byId("health-pill");

    if (healthPill) {
      const ok = status.health === "ok";
      healthPill.textContent = ok ? "health: ok" : "health: error";
      healthPill.style.color = ok ? "var(--accent)" : "var(--danger)";
      healthPill.style.borderColor = ok
        ? "rgba(0,220,150,0.2)"
        : "rgba(255,77,77,0.2)";
      healthPill.style.background = ok
        ? "rgba(0,220,150,0.08)"
        : "rgba(255,77,77,0.08)";
    }

    if (status.statusProtected && !state.protectionToastShown) {
      state.protectionToastShown = true;
      showToast("Admin protection is enabled for trace routes.", "error");
    }

    updateJudgePanel();
  }

  async function loadCatalog() {
    const payload = await fetchJson("/api/catalog");
    const select = byId("endpoint-select");

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

  async function loadStatus() {
    try {
      const status = await fetchJson("/api/integration/status");
      applyStatus(status);
    } catch (error) {
      const protectedView = error.status === 401 || error.status === 403;
      if (protectedView) {
        applyStatus({
          mode: "locked",
          ready: false,
          health: "protected",
          cluster: "-",
          mintInitialized: false,
          buyer: null,
          providerDestination: null,
          providerWithdrawEnabled: false,
          statusProtected: true,
        });
        return;
      }

      setStatusField("sf-mode", "error", "red");
      updateJudgePanel();
    }
  }

  function renderEventCards(items, containerId) {
    const element = byId(containerId);

    if (!element) {
      return;
    }

    if (!items || !items.length) {
      element.innerHTML =
        '<div class="empty-state"><div class="empty-icon">[]</div><span class="empty-text">No events yet</span></div>';
      return;
    }

    element.innerHTML = items
      .map((item) => {
        const type = item.type || "EVENT";
        const cls =
          type.includes("PUBLIC") || type.includes("BATCHED")
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
          .join(" | ");

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
    const list = byId("receipts-list");
    const count = byId("receipts-count");

    if (!list || !count) {
      return;
    }

    count.textContent = `${all.length} items`;

    if (!all.length) {
      list.innerHTML =
        '<div class="empty-state"><div class="empty-icon">[]</div><span class="empty-text">No receipts yet</span></div>';
      return;
    }

    list.innerHTML = all
      .map((item) => {
        const isReceipt = Boolean(item.token);
        const type = isReceipt ? "RECEIPT" : "SESSION";
        const cls = isReceipt ? "private" : "system";
        const status = item.status || "OPEN";
        const id = item.token || item.id || "-";
        const time = new Date(item.createdAt || item.timestamp).toLocaleTimeString("en-US", {
          hour12: false,
        });

        return `<div class="event-card">
          <div class="event-card-top">
            <span class="event-type ${cls}">${type}</span>
            <span class="event-time">${time}</span>
          </div>
          <div class="event-body">
            <strong>id:</strong> ${id.slice(0, 16)}... |
            <strong>status:</strong> ${status}${
              item.amount ? ` | <strong>amount:</strong> ${item.amount} ${item.asset || ""}` : ""
            }
          </div>
        </div>`;
      })
      .join("");
  }

  function renderSteps(steps, settlements) {
    const list = byId("steps-list");
    const count = byId("steps-count");
    const settlementsList = byId("settlements-list");

    if (!list || !count || !settlementsList) {
      return;
    }

    count.textContent = `${(steps || []).length} steps`;

    if (!steps || !steps.length) {
      list.innerHTML =
        '<div class="step-row" style="border-top:1px solid var(--border)"><span class="step-row-name" style="color:var(--muted)">-</span><span class="step-row-status pending">pending</span><span class="step-row-detail" style="color:var(--muted)">awaiting run</span><span class="step-row-net">-</span></div>';
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
          const sig = step.signature ? `sig: ${step.signature.slice(0, 12)}...` : "";
          const destination = step.destination ? `${step.destination.slice(0, 12)}...` : "";
          const detail = step.reason || sig || destination || "-";
          const net = step.sendTo
            ? `<span>${step.sendTo}</span>`
            : step.network
              ? `<span>${step.network.replace("MagicBlock ", "")}</span>`
              : "-";

          return `<div class="step-row">
            <span class="step-row-name">${step.step || step.kind || "-"}</span>
            <span class="step-row-status ${statusCls}">${step.status || "-"}</span>
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
            <strong>provider:</strong> ${(settlement.provider || "").slice(0, 28)} |
            <strong>mode:</strong> ${settlement.mode || "-"} |
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
    } else if (stateResult.reason?.status === 401 || stateResult.reason?.status === 403) {
      renderProtectedState("Admin token required for state inspection.");
    }

    updateJudgePanel();
  }

  async function runFlow(mode) {
    if (state.running) {
      return;
    }

    state.running = true;
    const button = byId(`btn-${mode === "private" ? "private" : "public"}`);
    const judgeButton = byId("btn-judge");
    const endpoint = byId("endpoint-select")?.value;
    const badge = byId("result-badge");
    const resultOut = byId("result-out");

    if (button) {
      button.classList.add("loading");
    }

    if (judgeButton && mode === "private") {
      judgeButton.classList.add("loading");
    }

    if (badge) {
      badge.textContent = "running...";
      badge.className = `pane-badge ${mode === "private" ? "private" : "public"}`;
    }

    if (resultOut) {
      resultOut.innerHTML = '<span style="color:var(--muted)">// sending request...</span>';
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

      if (mode === "private") {
        state.lastPrivateResult = payload;
      }

      if (resultOut) {
        resultOut.innerHTML = syntaxHighlight(payload);
      }

      if (badge) {
        badge.textContent = `${mode} | ok`;
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

      if (judgeButton) {
        judgeButton.classList.remove("loading");
      }

      updateJudgePanel();
    }
  }

  async function resetDemo() {
    await fetchJson("/api/reset", { method: "POST" });
    state.steps = [];
    state.lastResult = null;
    state.lastPrivateResult = null;

    const resultOut = byId("result-out");
    const badge = byId("result-badge");

    if (resultOut) {
      resultOut.innerHTML = '<span style="color:var(--muted)">// demo reset</span>';
    }

    if (badge) {
      badge.textContent = "awaiting run";
    }

    await refreshState();
    showToast("Demo reset");
  }

  async function runJudgeDemo() {
    const select = byId("endpoint-select");

    if (select) {
      select.value = DEFAULT_JUDGE_ENDPOINT;
    }

    switchTab("steps");
    await runFlow("private");
  }

  async function copyJudgeProof() {
    const proof = summarizeProof();

    try {
      await navigator.clipboard.writeText(proof);
      showToast("Proof summary copied", "success");
    } catch (error) {
      showToast("Clipboard unavailable", "error");
    }
  }

  function bindEvents() {
    document.querySelector('[data-action="run-private"]')?.addEventListener("click", () => {
      runFlow("private");
    });
    document.querySelector('[data-action="run-public"]')?.addEventListener("click", () => {
      runFlow("public");
    });
    document.querySelector('[data-action="reset-demo"]')?.addEventListener("click", resetDemo);
    document.querySelector('[data-action="judge-demo"]')?.addEventListener("click", runJudgeDemo);
    document.querySelector('[data-action="copy-proof"]')?.addEventListener("click", copyJudgeProof);

    const tabs = Array.from(document.querySelectorAll('[data-tab]'));
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
          return;
        }

        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(index + delta + tabs.length) % tabs.length];
        switchTab(next.dataset.tab);
      });
    });
  }

  window.switchTab = switchTab;
  window.runFlow = runFlow;
  window.resetDemo = resetDemo;
  window.runJudgeDemo = runJudgeDemo;
  window.copyJudgeProof = copyJudgeProof;

  bindEvents();
  switchTab("flow");
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
