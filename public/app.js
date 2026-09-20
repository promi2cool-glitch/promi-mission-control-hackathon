const DEMO_MISSION_ID = "mis_demo_bugfix_001";
const STAGE_ORDER = ["promi", "xo", "worker", "evidence", "verifier", "result"];

const el = (id) => document.getElementById(id);

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const message = (body && body.error) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body;
}

function setPill(key, state, value) {
  const pill = document.querySelector(`.status-pill[data-key="${key}"]`);
  if (!pill) return;
  pill.classList.remove("ok", "warn", "bad");
  if (state) pill.classList.add(state);
  pill.querySelector(".value").textContent = value;
}

async function loadStatus() {
  try {
    const status = await fetchJson("/api/status");
    setPill("promi", "ok", "ONLINE");
    setPill("xo", status.xo === "reachable" ? "ok" : "bad", status.xo === "reachable" ? "CONNECTED" : "UNREACHABLE");
    const workerState = status.worker.state;
    const workerPillState =
      workerState === "COMPLETED" ? "ok" : workerState === "FAILED" || workerState === "BLOCKED" ? "bad" : workerState === "RUNNING" || workerState === "IDLE" ? "warn" : null;
    setPill("worker", workerPillState, workerState);
    const verdict = status.verifier.last_verdict;
    setPill("verifier", verdict === "PASS" ? "ok" : verdict ? "bad" : "warn", verdict || "READY");
  } catch {
    setPill("promi", "bad", "OFFLINE");
  }
}

function permissionLabel(key) {
  const labels = {
    read_files: "Read files",
    modify_files: "Modify demo project",
    run_commands: "Run commands",
    run_tests: "Run tests",
    create_branch: "Create branch",
    commit: "Commit",
    open_pull_request: "Open pull request",
    merge: "Merge",
    deploy: "Production deployment",
    external_send: "External messaging",
    financial_action: "Financial actions",
  };
  return labels[key] || key;
}

function renderMissionCard(mission) {
  el("missionProject").textContent = mission.project.name;
  el("missionGoal").textContent = mission.goal;
  const granted = el("permissionsGranted");
  const denied = el("permissionsDenied");
  granted.innerHTML = "";
  denied.innerHTML = "";
  for (const [key, value] of Object.entries(mission.permissions)) {
    const li = document.createElement("li");
    li.textContent = permissionLabel(key);
    (value ? granted : denied).appendChild(li);
  }
}

function fmtDuration(ms) {
  if (ms === null || ms === undefined) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function renderExecutionPanel(result) {
  if (!result) return;
  el("evWorker").textContent = "Claude Code / Claude Sonnet 5";
  el("evSession").textContent = result.xo.session_id || "—";
  el("evActions").textContent = `${result.actions.length} observed tool calls`;
  el("evMessages").textContent = `${result.commands_run.length} commands run`;
  el("evChanged").textContent = result.files_changed.map((f) => f.path).join(", ") || "(none)";
  el("evClaim").textContent = result.worker_claim;
  el("evBefore").textContent = `${result.tests.before.passed} PASS / ${result.tests.before.failed} FAIL`;
  el("evAfter").textContent = `${result.tests.after.passed} PASS / ${result.tests.after.failed} FAIL`;
}

function renderVerificationPanel(verification) {
  if (!verification) {
    el("checksSummary").textContent = "Not yet verified";
    el("checksList").innerHTML = "";
    el("verdictBadge").textContent = "PENDING";
    el("verdictBadge").className = "verdict-badge";
    return;
  }
  const passed = verification.checks.filter((c) => c.passed).length;
  el("checksSummary").textContent = `${passed} / ${verification.checks.length} checks passed`;
  const list = el("checksList");
  list.innerHTML = "";
  for (const check of verification.checks) {
    const li = document.createElement("li");
    li.className = check.passed ? "pass" : "fail";
    const name = document.createElement("span");
    name.className = "check-name";
    name.textContent = formatCheckName(check.name);
    li.appendChild(name);
    list.appendChild(li);
  }
  const badge = el("verdictBadge");
  badge.textContent = verification.verdict;
  badge.className = `verdict-badge ${verification.verdict}`;
  el("pipelineResult").textContent = verification.verdict;
}

function formatCheckName(name) {
  const map = {
    mission_identity: "Mission identity",
    worker_completed: "Worker completed",
    baseline_verified: "Failure existed before",
    regression_tests_pass: "Regression suite passed",
    changed_files_allowed: "Changed files allowed",
    forbidden_paths_untouched: "Forbidden paths untouched",
    permissions_respected: "Permissions respected",
    forbidden_commands_absent: "Forbidden commands absent",
    workspace_confined: "Workspace confined",
    canonical_demo_unchanged: "Canonical demo unchanged",
    definition_of_done: "Definition of done satisfied",
    evidence_complete: "Evidence complete",
  };
  return map[name] || name;
}

function renderObservabilityPanel(observability) {
  if (!observability) return;
  el("obsSession").textContent = observability.session_id || "—";
  el("obsRuntime").textContent = observability.runtime;
  el("obsActions").textContent = `${observability.actions_observed} actions, ${observability.commands_observed} commands`;
  el("obsDuration").textContent = fmtDuration(observability.duration_ms);
  el("obsStarted").textContent = observability.started_at || "—";
  el("obsFinished").textContent = observability.finished_at || "—";
  el("obsUsage").textContent = observability.usage_available ? JSON.stringify(observability.usage) : "Unavailable for this session";

  const link = el("openXoLink");
  link.href = "http://127.0.0.1:5002/";
  link.hidden = false;
}

function setStage(stageKey, state) {
  const stage = document.querySelector(`.stage[data-stage="${stageKey}"]`);
  if (!stage) return;
  stage.classList.remove("active", "done", "failed");
  if (state) stage.classList.add(state);
}

function resetPipeline() {
  for (const stage of STAGE_ORDER) setStage(stage, null);
  el("pipelineResult").textContent = "—";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let missionData = null;

async function loadAll() {
  const [mission, result, verification, observability] = await Promise.all([
    fetchJson(`/api/missions/${DEMO_MISSION_ID}`).catch(() => null),
    fetchJson(`/api/missions/${DEMO_MISSION_ID}/result`).catch(() => null),
    fetchJson(`/api/missions/${DEMO_MISSION_ID}/verification`).catch(() => null),
    fetchJson(`/api/missions/${DEMO_MISSION_ID}/observability`).catch(() => null),
  ]);
  missionData = { mission: mission && mission.mission, result, verification, observability, summary: mission };
  if (missionData.mission) renderMissionCard(missionData.mission);
  renderExecutionPanel(result);
  renderVerificationPanel(verification);
  renderObservabilityPanel(observability);
  return missionData;
}

async function playReplay() {
  if (!missionData || !missionData.result) {
    await loadAll();
  }
  if (!missionData || !missionData.result) return;

  const banner = el("replayBanner");
  banner.hidden = false;
  banner.textContent = `REPLAY OF VERIFIED XO RUN — session ${missionData.result.xo.session_id || "(unknown)"}`;

  resetPipeline();
  const sequence = [
    ["promi", 300],
    ["xo", 500],
    ["worker", 700],
    ["evidence", 500],
    ["verifier", 600],
    ["result", 400],
  ];
  for (const [stage] of sequence.slice(0, -1)) {
    setStage(stage, "active");
    await sleep(sequence.find((s) => s[0] === stage)[1]);
    setStage(stage, "done");
  }
  const last = sequence[sequence.length - 1][0];
  setStage(last, "active");
  await sleep(sequence[sequence.length - 1][1]);
  const verdict = missionData.verification ? missionData.verification.verdict : null;
  setStage(last, verdict === "PASS" ? "done" : "failed");

  renderExecutionPanel(missionData.result);
  renderVerificationPanel(missionData.verification);
  renderObservabilityPanel(missionData.observability);
}

async function pollUntilTerminal(missionId, onTick) {
  const terminal = new Set(["COMPLETED", "FAILED", "BLOCKED"]);
  for (let i = 0; i < 200; i++) {
    const summary = await fetchJson(`/api/missions/${missionId}`);
    onTick(summary);
    if (terminal.has(summary.state)) return summary;
    await sleep(3000);
  }
  throw new Error("timed out waiting for mission to finish");
}

async function runLiveMission() {
  const banner = el("replayBanner");
  banner.hidden = false;
  banner.textContent = "LIVE RUN IN PROGRESS — a real autonomous XO worker is executing now.";

  resetPipeline();
  setStage("promi", "done");
  setStage("xo", "active");

  const liveBtn = el("liveRunBtn");
  const replayBtn = el("replayBtn");
  liveBtn.disabled = true;
  replayBtn.disabled = true;

  try {
    await fetchJson(`/api/missions/${DEMO_MISSION_ID}/run`, { method: "POST" });
    setStage("xo", "done");
    setStage("worker", "active");

    const final = await pollUntilTerminal(DEMO_MISSION_ID, (summary) => {
      if (summary.state === "RUNNING") {
        setStage("worker", "active");
      }
    });

    setStage("worker", final.state === "COMPLETED" ? "done" : "failed");
    setStage("evidence", "active");
    await sleep(300);
    setStage("evidence", "done");
    setStage("verifier", "active");

    const data = await loadAll();
    setStage("verifier", "done");
    const verdict = data.verification ? data.verification.verdict : null;
    setStage("result", verdict === "PASS" ? "done" : "failed");
    banner.textContent = `LIVE RUN COMPLETE — session ${data.result ? data.result.xo.session_id : "(unknown)"}`;
  } catch (err) {
    banner.textContent = `LIVE RUN FAILED: ${err.message}`;
    setStage("worker", "failed");
  } finally {
    liveBtn.disabled = false;
    replayBtn.disabled = false;
    loadStatus();
  }
}

function wireControls() {
  el("replayBtn").addEventListener("click", () => playReplay());

  const modal = el("confirmModal");
  el("liveRunBtn").addEventListener("click", () => modal.classList.remove("hidden"));
  el("confirmCancel").addEventListener("click", () => modal.classList.add("hidden"));
  el("confirmProceed").addEventListener("click", () => {
    modal.classList.add("hidden");
    runLiveMission();
  });
}

async function init() {
  wireControls();
  await loadStatus();
  await loadAll();
}

init();
