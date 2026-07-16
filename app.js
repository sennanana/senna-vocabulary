import { createGitHubSync, GitHubAuthError, GitHubConflictError } from "./github-sync.js";
import { normalizeRow, validateRows } from "./row-model.js";

export function createLocalState({
  storage = globalThis.localStorage,
  key = "senna:vocabulary-cache:v2",
  now = () => new Date().toISOString(),
} = {}) {
  const read = () => {
    try {
      const value = JSON.parse(storage.getItem(key));
      if (!value || !Array.isArray(value.rows)) return null;
      return { ...value, rows: validateRows(value.rows) };
    } catch {
      return null;
    }
  };

  const persist = (snapshot) => {
    storage.setItem(key, JSON.stringify(snapshot));
    return snapshot;
  };

  const load = (fallbackRows) => {
    const cached = read();
    if (cached?.dirty) return cached;
    return {
      rows: validateRows(fallbackRows),
      dirty: false,
      version: cached?.version ?? 0,
      updatedAt: cached?.updatedAt ?? now(),
    };
  };

  const write = (rows) => {
    const current = read();
    const snapshot = persist({
      rows: validateRows(rows),
      dirty: true,
      version: (current?.version ?? 0) + 1,
      updatedAt: now(),
    });
    return snapshot.version;
  };

  const replaceClean = (rows) => {
    const current = read();
    return persist({
      rows: validateRows(rows),
      dirty: false,
      version: current?.version ?? 0,
      updatedAt: now(),
    });
  };

  const markClean = (version) => {
    const current = read();
    if (!current || current.version !== version) return false;
    persist({ ...current, dirty: false });
    return true;
  };

  const isDirty = () => Boolean(read()?.dirty);
  const snapshot = () => read();

  return { isDirty, load, markClean, replaceClean, snapshot, write };
}

if (typeof document !== "undefined") {
  bootstrap();
}

async function bootstrap() {
  const localState = createLocalState();
  const githubSync = createGitHubSync({ repo: "senna-vocabulary" });
  const tableBody = document.querySelector("#vocab-table tbody");
  const filterInput = document.querySelector("#filter");
  const status = document.querySelector("#sync-status");
  const connectButton = document.querySelector("#connect-github");
  const retryButton = document.querySelector("#retry-sync");
  const cloudButton = document.querySelector("#load-cloud");
  const disconnectButton = document.querySelector("#disconnect-github");
  const dialog = document.querySelector("#github-dialog");
  const githubForm = document.querySelector("#github-form");
  const tokenInput = document.querySelector("#github-token");
  const dialogError = document.querySelector("#github-error");
  const today = new Date().toISOString().slice(0, 10);
  let rows = [];
  let saveTimer = null;

  const blankRow = () =>
    normalizeRow({ date: today, recall: "未测", familiarity: "0" });

  const setStatus = (label, state) => {
    status.textContent = label;
    status.dataset.state = state;
    const connected = githubSync.isConnected();
    connectButton.hidden = connected;
    disconnectButton.hidden = !connected;
    retryButton.hidden = state !== "failed" && state !== "auth";
    cloudButton.hidden = state !== "conflict";
  };

  const download = (content, type, filename) => {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const toCsv = () => {
    const headers = [
      "日期", "生词/短语", "发音", "词性", "核心义", "例句/语境",
      "搭配/词族", "来源", "第1次回忆", "熟悉度", "下次复习", "备注",
    ];
    const keys = [
      "date", "word", "pronunciation", "part", "meaning", "context",
      "collocation", "source", "recall", "familiarity", "review", "notes",
    ];
    const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    return [
      headers.map(escape).join(","),
      ...rows.map((row) => keys.map((key) => escape(row[key])).join(",")),
    ].join("\n");
  };

  const handleSyncError = (error) => {
    if (error instanceof GitHubAuthError) {
      setStatus("需要重新连接", "auth");
      return;
    }
    if (error instanceof GitHubConflictError) {
      setStatus("发现云端冲突", "conflict");
      return;
    }
    setStatus("同步失败", "failed");
  };

  const syncNow = async () => {
    if (!localState.isDirty()) {
      setStatus(githubSync.isConnected() ? "已同步" : "未连接", githubSync.isConnected() ? "synced" : "disconnected");
      return;
    }
    if (!githubSync.isConnected()) {
      setStatus("本地已保存", "local");
      return;
    }
    const snapshot = localState.snapshot();
    if (!snapshot) return;
    setStatus("正在同步", "syncing");
    try {
      await githubSync.save(snapshot.rows);
      if (localState.markClean(snapshot.version)) {
        setStatus("已同步", "synced");
      } else {
        scheduleSync(0);
      }
    } catch (error) {
      handleSyncError(error);
    }
  };

  const scheduleSync = (delay = 2_000) => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(syncNow, delay);
  };

  const persistMutation = () => {
    localState.write(rows);
    setStatus(githubSync.isConnected() ? "本地已保存" : "本地已保存", "local");
    scheduleSync();
  };

  const textCell = (row, key, className = "") => {
    const cell = document.createElement("td");
    cell.contentEditable = "true";
    cell.className = className;
    cell.textContent = row[key];
    cell.addEventListener("input", () => {
      row[key] = cell.textContent.trim();
      persistMutation();
    });
    return cell;
  };

  const selectCell = (row, key, values) => {
    const cell = document.createElement("td");
    const select = document.createElement("select");
    select.setAttribute("aria-label", key === "recall" ? "回忆结果" : "熟悉度");
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    select.value = row[key] || values[0];
    select.addEventListener("change", () => {
      row[key] = select.value;
      persistMutation();
      renderRows();
    });
    cell.append(select);
    return cell;
  };

  const dateCell = (row, key) => {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "date";
    input.setAttribute("aria-label", key === "date" ? "记录日期" : "下次复习日期");
    input.value = row[key];
    input.addEventListener("change", () => {
      row[key] = input.value;
      persistMutation();
    });
    cell.append(input);
    return cell;
  };

  const rowMatches = (row, query) =>
    !query || Object.values(row).join(" ").toLowerCase().includes(query);

  const renderRows = () => {
    const query = filterInput.value.trim().toLowerCase();
    tableBody.replaceChildren();
    for (const row of rows) {
      if (!rowMatches(row, query)) continue;
      const tr = document.createElement("tr");
      if (row.recall === "对") tr.classList.add("status-right");
      if (row.recall === "错") tr.classList.add("status-wrong");
      tr.append(
        dateCell(row, "date"),
        textCell(row, "word", "word"),
        textCell(row, "pronunciation"),
        textCell(row, "part"),
        textCell(row, "meaning", "meaning"),
        textCell(row, "context", "context"),
        textCell(row, "collocation"),
        textCell(row, "source"),
        selectCell(row, "recall", ["未测", "对", "错"]),
        selectCell(row, "familiarity", ["0", "1", "2", "3"]),
        dateCell(row, "review"),
        textCell(row, "notes", "notes"),
      );
      tableBody.append(tr);
    }
  };

  const loadBundledRows = async () => {
    const response = await fetch(`./vocabulary.json?ts=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Vocabulary data could not be loaded");
    return validateRows(await response.json());
  };

  document.querySelector("#add-row").addEventListener("click", () => {
    rows.unshift(blankRow());
    persistMutation();
    renderRows();
  });
  document.querySelector("#export-csv").addEventListener("click", () => {
    download(`\ufeff${toCsv()}`, "text/csv;charset=utf-8", `vocabulary-record-${today}.csv`);
  });
  document.querySelector("#export-json").addEventListener("click", () => {
    download(`${JSON.stringify(rows, null, 2)}\n`, "application/json", `vocabulary-backup-${today}.json`);
  });
  document.querySelector("#print-page").addEventListener("click", () => window.print());
  document.querySelector("#clear-all").addEventListener("click", () => {
    if (!window.confirm("清空所有生词记录？此操作同步后不能撤销。")) return;
    rows = Array.from({ length: 8 }, blankRow);
    persistMutation();
    renderRows();
  });
  filterInput.addEventListener("input", renderRows);

  connectButton.addEventListener("click", () => {
    dialogError.hidden = true;
    tokenInput.value = "";
    dialog.showModal();
    tokenInput.focus();
  });
  document.querySelector("#cancel-connect").addEventListener("click", () => dialog.close());
  githubForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    dialogError.hidden = true;
    document.querySelector("#confirm-connect").disabled = true;
    try {
      const remoteRows = await githubSync.connect(tokenInput.value);
      dialog.close();
      tokenInput.value = "";
      if (localState.isDirty()) {
        scheduleSync(0);
      } else {
        rows = remoteRows;
        localState.replaceClean(rows);
        renderRows();
        setStatus("已同步", "synced");
      }
    } catch (error) {
      dialogError.textContent = error instanceof GitHubAuthError
        ? "令牌无效，或没有该仓库的 Contents 读写权限。"
        : "连接失败，请检查网络和仓库权限。";
      dialogError.hidden = false;
    } finally {
      document.querySelector("#confirm-connect").disabled = false;
    }
  });
  retryButton.addEventListener("click", () => {
    if (githubSync.isConnected()) scheduleSync(0);
    else connectButton.click();
  });
  disconnectButton.addEventListener("click", () => {
    githubSync.disconnect();
    setStatus(localState.isDirty() ? "本地已保存" : "未连接", localState.isDirty() ? "local" : "disconnected");
  });
  cloudButton.addEventListener("click", async () => {
    if (!window.confirm("用 GitHub 云端版本覆盖当前未同步内容？")) return;
    setStatus("正在同步", "syncing");
    try {
      rows = await githubSync.load();
      localState.replaceClean(rows);
      renderRows();
      setStatus("已同步", "synced");
    } catch (error) {
      handleSyncError(error);
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (!localState.isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  try {
    const bundledRows = await loadBundledRows();
    const initial = localState.load(bundledRows);
    rows = initial.rows;
    renderRows();
    if (initial.dirty) {
      setStatus("本地已保存", "local");
      if (githubSync.isConnected()) scheduleSync(0);
    } else if (githubSync.isConnected()) {
      setStatus("正在同步", "syncing");
      try {
        rows = await githubSync.load();
        localState.replaceClean(rows);
        renderRows();
        setStatus("已同步", "synced");
      } catch (error) {
        handleSyncError(error);
      }
    } else {
      localState.replaceClean(rows);
      setStatus("未连接", "disconnected");
    }
  } catch {
    const recovered = localState.snapshot();
    rows = recovered?.rows ?? [];
    renderRows();
    setStatus("同步失败", "failed");
  }
}
