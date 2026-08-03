"use strict";
(() => {
  const $ = (id) => document.getElementById(id);

  const setStatus = (on, title, hint) => {
    $("dot").className = "dot " + (on ? "on" : on === null ? "" : "off");
    $("statusTitle").textContent = title;
    $("statusHint").textContent = hint || "";
  };

  async function loadStatus() {
    try {
      const { bctlStatus } = await chrome.storage.local.get("bctlStatus");
      if (bctlStatus && bctlStatus.connected) {
        setStatus(true, "מחובר לשרת המקומי", "התוסף מחובר — פקודות זורמות דרך הפורט");
      } else {
        setStatus(false, "לא מחובר", "הרץ: node tools/control-server.js — התוסף מתחבר אוטומטית");
      }
    } catch (e) {
      setStatus(false, "שגיאה בקריאת סטטוס", String(e));
    }
  }

  async function loadSettings() {
    try {
      const { bctlPort = 9798, bctlToken = "", bctlEnabled = true } = await chrome.storage.local.get(["bctlPort", "bctlToken", "bctlEnabled"]);
      $("port").value = bctlPort;
      $("token").value = bctlToken || "";
      $("enabled").checked = bctlEnabled !== false;
    } catch (e) { /* ignore */ }
  }

  async function loadLog() {
    try {
      const res = await chrome.runtime.sendMessage({ target: "bg", type: "CMD", cmd: "log.get", params: {} });
      const log = (res && res.ok && res.data) || [];
      $("logCount").textContent = log.length ? "(" + log.length + ")" : "";
      const box = $("log");
      if (!log.length) {
        box.innerHTML = '<p class="empty">אין עדיין פעילות.</p>';
        return;
      }
      box.innerHTML = "";
      for (const e of log.slice(0, 30)) {
        const item = document.createElement("div");
        item.className = "log-item" + (e.ok ? "" : " err");
        const t = document.createElement("span");
        t.className = "t";
        t.textContent = new Date(e.t).toLocaleTimeString("he-IL");
        const cmd = document.createElement("span");
        cmd.className = "cmd";
        cmd.textContent = e.cmd;
        const res = document.createElement("span");
        res.className = "res";
        res.textContent = e.ok ? "✓" : "✗ " + (e.error || "").slice(0, 80);
        item.append(t, cmd, res);
        box.appendChild(item);
      }
    } catch (e) { /* ignore */ }
  }

  const flashSaved = () => {
    const s = $("saved");
    s.classList.add("show");
    setTimeout(() => s.classList.remove("show"), 1600);
  };

  $("save").addEventListener("click", async () => {
    const port = parseInt($("port").value, 10);
    const token = $("token").value.trim();
    if (isNaN(port) || port < 1024 || port > 65535) {
      setStatus(false, "פורט לא תקין", "הזן פורט בין 1024 ל-65535");
      return;
    }
    await chrome.storage.local.set({
      bctlPort: port,
      bctlToken: token,
      bctlEnabled: $("enabled").checked
    });
    flashSaved();
  });

  $("genToken").addEventListener("click", () => {
    const arr = new Uint8Array(18);
    crypto.getRandomValues(arr);
    const token = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
    $("token").value = token;
  });

  $("copyToken").addEventListener("click", async () => {
    const t = $("token").value;
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      flashSaved();
    } catch (e) { /* ignore */ }
  });

  $("reconnect").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ target: "bg", type: "ENSURE_OFFSCREEN" });
    setStatus(null, "מאתחל חיבור…", "המתן מספר שניות");
    setTimeout(loadStatus, 2500);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.bctlStatus) {
      loadStatus();
      loadLog();
    }
  });

  const ver = chrome.runtime.getManifest().version;
  $("ver").textContent = "v" + ver;

  loadSettings();
  loadStatus();
  loadLog();
  setInterval(loadStatus, 4000);
  setInterval(loadLog, 6000);
})();
