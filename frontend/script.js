(() => {
  const ANALYZE_URL = "http://localhost:5000/analyze";

  const els = {
    year: document.getElementById("year"),
    fileInput: document.getElementById("fileInput"),
    fileMeta: document.getElementById("fileMeta"),
    dropzone: document.getElementById("dropzone"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    spinner: document.getElementById("spinner"),
    status: document.getElementById("status"),
    error: document.getElementById("error"),
    results: document.getElementById("results"),
    overallBar: document.getElementById("overallBar"),
    overallLabel: document.getElementById("overallLabel"),
    downloadBtn: document.getElementById("downloadBtn"),
  };

  els.year.textContent = new Date().getFullYear();

  let selectedFile = null;
  let lastAnalysis = null;

  function clamp01(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.min(100, Math.max(0, n));
  }

  function asNumber(v) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function setBusy(isBusy) {
    els.analyzeBtn.disabled = isBusy || !selectedFile;
    els.spinner.classList.toggle("hidden", !isBusy);
    els.fileInput.disabled = isBusy;
    els.dropzone.setAttribute("aria-disabled", String(isBusy));
    els.dropzone.classList.toggle("opacity-60", isBusy);
    els.dropzone.classList.toggle("pointer-events-none", isBusy);
  }

  function showStatus(msg) {
    if (!msg) { els.status.classList.add("hidden"); els.status.textContent = ""; return; }
    els.status.textContent = msg;
    els.status.classList.remove("hidden");
  }

  function showError(msg) {
    if (!msg) { els.error.classList.add("hidden"); els.error.textContent = ""; return; }
    els.error.textContent = msg;
    els.error.classList.remove("hidden");
  }

  function setOverall(score) {
    const s = clamp01(score);
    els.overallBar.style.width = `${s}%`;
    let color = "bg-emerald-500";
    if (s >= 70) color = "bg-rose-500";
    else if (s >= 40) color = "bg-amber-500";
    els.overallBar.classList.remove("bg-emerald-500", "bg-amber-500", "bg-rose-500");
    els.overallBar.classList.add(color);
    els.overallLabel.textContent = `${Math.round(s)}/100`;
  }

  function clearResults() { els.results.innerHTML = ""; }

  function renderEmpty() {
    clearResults();
    const div = document.createElement("div");
    div.className = "rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600";
    div.textContent = "No results yet. Upload a contract to begin.";
    els.results.appendChild(div);
    setOverall(0);
    els.overallLabel.textContent = "—";
    els.overallBar.style.width = "0%";
    els.downloadBtn.disabled = true;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function severityColor(severity) {
    const s = (severity || "").toLowerCase();
    if (s === "critical") return { pill: "bg-rose-100 text-rose-800 border-rose-300", dot: "#ef4444" };
    if (s === "high")     return { pill: "bg-rose-50 text-rose-700 border-rose-200",  dot: "#f87171" };
    if (s === "medium")   return { pill: "bg-amber-50 text-amber-800 border-amber-200", dot: "#f59e0b" };
    return { pill: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "#10b981" };
  }

  function renderSummaryCard(data) {
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-indigo-100 bg-indigo-50 p-4";

    const title = document.createElement("div");
    title.className = "text-sm font-semibold text-indigo-900 mb-2";
    title.textContent = `📄 ${data.contract_type || "Contract"} — ${data.key_parties?.join(" ↔ ") || ""}`;
    card.appendChild(title);

    const summary = document.createElement("p");
    summary.className = "text-sm text-indigo-800";
    summary.textContent = data.contract_summary || "";
    card.appendChild(summary);

    if (data.red_flags?.length) {
      const rf = document.createElement("div");
      rf.className = "mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3";
      rf.innerHTML = `<div class="text-xs font-semibold text-rose-700 mb-1">🚩 Red Flags</div>` +
        data.red_flags.map(f => `<div class="text-xs text-rose-800">• ${escapeHtml(f)}</div>`).join("");
      card.appendChild(rf);
    }

    if (data.negotiation_points?.length) {
      const np = document.createElement("div");
      np.className = "mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3";
      np.innerHTML = `<div class="text-xs font-semibold text-amber-800 mb-1">🤝 Negotiation Points</div>` +
        data.negotiation_points.map(p => `<div class="text-xs text-amber-900">• ${escapeHtml(p)}</div>`).join("");
      card.appendChild(np);
    }

    if (data.missing_clauses?.length) {
      const mc = document.createElement("div");
      mc.className = "mt-3 rounded-xl border border-slate-200 bg-white p-3";
      mc.innerHTML = `<div class="text-xs font-semibold text-slate-700 mb-1">⚠️ Missing Clauses</div>` +
        data.missing_clauses.map(c => `<div class="text-xs text-slate-700">• ${escapeHtml(c)}</div>`).join("");
      card.appendChild(mc);
    }

    return card;
  }

  function renderRiskCard(risk, idx) {
    const { pill, dot } = severityColor(risk.severity);
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

    card.innerHTML = `
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-slate-900">${escapeHtml(risk.title || `Risk ${idx + 1}`)}</div>
          <div class="mt-0.5 text-xs text-slate-500">${escapeHtml(risk.category || "")} ${risk.clause_reference ? "· " + escapeHtml(risk.clause_reference) : ""}</div>
        </div>
        <span class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${pill}">
          <span class="h-2 w-2 rounded-full" style="background:${dot}"></span>
          ${escapeHtml(risk.severity || "Low")} · ${risk.severity_score ?? "—"}/100
        </span>
      </div>
      <p class="mt-3 text-sm text-slate-700">${escapeHtml(risk.description || "")}</p>
      ${risk.recommendation ? `
        <div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <span class="font-semibold">✅ Recommendation:</span> ${escapeHtml(risk.recommendation)}
        </div>` : ""}
    `;
    return card;
  }

  function renderResults(data) {
    clearResults();
    lastAnalysis = data;

    if (data.error) {
      showError(`AI Error: ${data.error}`);
      renderEmpty();
      return;
    }

    // Summary card
    els.results.appendChild(renderSummaryCard(data));

    // Risk cards
    const risks = data.risks || [];
    if (risks.length) {
      const heading = document.createElement("div");
      heading.className = "text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2";
      heading.textContent = `${risks.length} Risk${risks.length > 1 ? "s" : ""} Found`;
      els.results.appendChild(heading);
      risks.forEach((r, i) => els.results.appendChild(renderRiskCard(r, i)));
    }

    // Favorable terms
    if (data.favorable_terms?.length) {
      const ft = document.createElement("div");
      ft.className = "rounded-2xl border border-emerald-200 bg-emerald-50 p-4";
      ft.innerHTML = `<div class="text-xs font-semibold text-emerald-800 mb-2">👍 Favorable Terms</div>` +
        data.favorable_terms.map(t => `<div class="text-sm text-emerald-900">• ${escapeHtml(t)}</div>`).join("");
      els.results.appendChild(ft);
    }

    // Overall score
    const score = asNumber(data.overall_risk_score) ?? 0;
    setOverall(score);
    els.downloadBtn.disabled = false;
  }

  function setSelectedFile(file) {
    selectedFile = file ?? null;
    if (!selectedFile) {
      els.fileMeta.textContent = "No file selected.";
      els.analyzeBtn.disabled = true;
      return;
    }
    const mb = (selectedFile.size / (1024 * 1024)).toFixed(2);
    els.fileMeta.textContent = `${selectedFile.name} • ${mb} MB`;
    els.analyzeBtn.disabled = false;
  }

  function isPdf(file) {
    if (!file) return false;
    if (file.type === "application/pdf") return true;
    return file.name?.toLowerCase().endsWith(".pdf");
  }

  async function analyze() {
    showError("");
    showStatus("");

    if (!selectedFile) { showError("Please select a PDF file first."); return; }
    if (!isPdf(selectedFile)) { showError("Only PDF files are supported."); return; }

    setBusy(true);
    showStatus("Uploading and analyzing… this may take 30–60 seconds.");

    try {
      const formData = new FormData();
      formData.append("contract", selectedFile); // ← must match backend field name

      const res = await fetch(ANALYZE_URL, { method: "POST", body: formData });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Backend error (${res.status}). ${text || "Check server logs."}`);
      }

      const data = await res.json();
      renderResults(data);
      showStatus("Analysis complete.");
      setTimeout(() => showStatus(""), 2000);
    } catch (e) {
      renderEmpty();
      showStatus("");
      showError(`Could not analyze. Make sure backend is running at localhost:5000. ${e?.message ?? ""}`);
    } finally {
      setBusy(false);
    }
  }

  // Download report
  els.downloadBtn.addEventListener("click", () => {
    if (!lastAnalysis) return;
    const blob = new Blob([JSON.stringify(lastAnalysis, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "contract-analysis.json";
    a.click();
  });

  els.fileInput.addEventListener("change", (e) => setSelectedFile(e.target?.files?.[0] ?? null));
  els.analyzeBtn.addEventListener("click", analyze);

  els.dropzone.addEventListener("click", () => els.fileInput.click());
  els.dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.fileInput.click(); }
  });

  ["dragenter", "dragover"].forEach((evt) => {
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      els.dropzone.classList.add("border-slate-400", "bg-slate-100");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      els.dropzone.classList.remove("border-slate-400", "bg-slate-100");
    });
  });
  els.dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0] ?? null;
    if (!file) return;
    if (!isPdf(file)) { showError("Only PDF files are supported."); return; }
    showError("");
    els.fileInput.value = "";
    setSelectedFile(file);
  });

  // Theme toggle
  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      document.documentElement.classList.toggle("dark");
      themeBtn.textContent = document.documentElement.classList.contains("dark") ? "☀️" : "🌙";
    });
  }

  renderEmpty();
  setBusy(false);
})();
