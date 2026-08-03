"use strict";
(() => {
  // ---- offscreen document (keeps the local WebSocket alive) ----
  async function ensureOffscreen() {
    try {
      const has = await chrome.offscreen.hasDocument();
      if (has) return;
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: "Shuttle commands between a trusted local tool and the extension over a local WebSocket."
      });
    } catch (e) {
      // "only a single offscreen document" etc. — ignore
    }
  }

  chrome.runtime.onStartup.addListener(() => { void ensureOffscreen(); });
  chrome.runtime.onInstalled.addListener(() => { void ensureOffscreen(); });
  chrome.action.onClicked.addListener(() => { void chrome.runtime.openOptionsPage(); });
  void ensureOffscreen();

  // ---- audit log (kept in storage, shown in options) ----
  async function audit(entry) {
    try {
      const { log = [] } = await chrome.storage.local.get({ log: [] });
      log.unshift({ t: Date.now(), ...entry });
      await chrome.storage.local.set({ log: log.slice(0, 100) });
    } catch (e) { /* ignore */ }
  }

  // ---- DevTools-level evaluation via chrome.debugger (bypasses page CSP) ----
  // `code` may be a function body that starts with `return` — wrap it so it's legal
  // inside a bare Runtime.evaluate expression.
  function wrapForEval(code, params) {
    let c = String(code || "undefined").trim();
    if (/^return\b/.test(c) || c.includes("\n")) {
      const paramsJson = JSON.stringify(params || {})
        .replace(/<\/script/gi, "<\\/script");
      return "(function(params){\n" + c + "\n})(" + paramsJson + ")";
    }
    return c;
  }
  async function debuggerEval(tabId, code, params) {
    const expression = wrapForEval(code, params);
    let result;
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      const r = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      result = r;
    } finally {
      try { await chrome.debugger.detach({ tabId }); } catch (e) { /* ignore */ }
    }
    if (result && result.exceptionDetails) {
      const d = result.exceptionDetails;
      const desc = d.exception && d.exception.description ? d.exception.description : (d.text || "exception");
      throw new Error(desc.slice(0, 500));
    }
    if (result && result.result && result.result.subtype === "error" && result.result.description) {
      throw new Error(result.result.description.slice(0, 500));
    }
    return result ? result.result && result.result.value : undefined;
  }

  // ---- command executor ----
  async function exec(cmd, p) {
    const { bctlEnabled = true } = await chrome.storage.local.get("bctlEnabled");
    if (bctlEnabled === false && !["ping", "info", "settings.get"].includes(cmd)) {
      throw new Error("שליטה כבויה בהגדרות התוסף");
    }
    switch (cmd) {
      case "ping":
        return { pong: true, version: chrome.runtime.getManifest().version, time: Date.now() };

      case "info": {
        const m = chrome.runtime.getManifest();
        const { bctlToken = "" } = await chrome.storage.local.get("bctlToken");
        return {
          name: m.name,
          version: m.version,
          tokenSet: bctlToken.length > 0,
          port: (await chrome.storage.local.get("bctlPort")).bctlPort || 9798
        };
      }

      case "tabs.list": {
        const tabs = await chrome.tabs.query({});
        return tabs.map(t => ({
          id: t.id, windowId: t.windowId, active: t.active, url: t.url, title: t.title
        }));
      }

      case "tabs.active": {
        const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return t ? { id: t.id, windowId: t.windowId, url: t.url, title: t.title } : null;
      }

      case "tabs.open": {
        const t = await chrome.tabs.create({ url: p.url, active: p.active !== false });
        return { id: t.id, url: t.url };
      }

      case "tabs.close": {
        const ids = Array.isArray(p.ids) ? p.ids : [p.id];
        await chrome.tabs.remove(ids.filter(x => x != null));
        return { closed: ids.length };
      }

      case "tabs.navigate": {
        const t = await chrome.tabs.update(p.id, { url: p.url });
        return { id: t.id, url: t.url };
      }

      case "tabs.screenshot": {
        const tabId = p.id != null ? p.id : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
        if (tabId == null) throw new Error("אין טאב פעיל");
        // DevTools-level screenshot via chrome.debugger — works on any normal page
        let shot;
        try {
          await chrome.debugger.attach({ tabId }, "1.3");
          const r = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", { format: "png" });
          shot = r && r.data;
        } finally {
          try { await chrome.debugger.detach({ tabId }); } catch (e) { /* ignore */ }
        }
        if (!shot) throw new Error("לא ניתן לצלם את הדף");
        const dataUrl = "data:image/png;base64," + shot;
        return { dataUrl, length: dataUrl.length };
      }

      case "tabs.eval": {
        const tabId = p.id != null ? p.id : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
        if (tabId == null) throw new Error("אין טאב פעיל");
        return await debuggerEval(tabId, p.code, p.params);
      }

      case "tabs.js": {
        const tabId = p.id != null ? p.id : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
        if (tabId == null) throw new Error("אין טאב פעיל");
        // literal func (safe to serialize); dynamic code runs inside the page's isolated world
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: (code, params) => {
              try {
                // eslint-disable-next-line no-new-func
                const fn = new Function("params", code || "return null;");
                return { __ok: true, value: fn(params) };
              } catch (e) {
                return { __ok: false, error: String(e && e.message ? e.message : e) };
              }
            },
            args: [p.code || "return null;", p.params || {}],
            world: p.world === "MAIN" ? "MAIN" : "ISOLATED"
          });
          if (!results || !results.length) throw new Error("הסקריפט לא בוצע בטאב");
          const out = results[0].result;
          if (out && out.__ok === false) {
            // page CSP blocks eval -> fall back to DevTools-level eval (CSP-free)
            if (/Content Security Policy|unsafe-eval/i.test(out.error)) {
              return await debuggerEval(tabId, p.code, p.params);
            }
            throw new Error(out.error || "שגיאה בסקריפט");
          }
          return out && out.__ok === true ? out.value : out;
        } catch (e) {
          // some pages block executeScript entirely -> fall back to debugger eval
          if (/Content Security Policy|unsafe-eval/i.test(String(e && e.message ? e.message : e))) {
            return await debuggerEval(tabId, p.code, p.params);
          }
          throw e;
        }
      }

      case "tabs.html": {
        const tabId = p.id != null ? p.id : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
        if (tabId == null) throw new Error("אין טאב פעיל");
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (max) => {
            const b = document.body;
            const text = (b ? b.innerText : "") || document.documentElement.innerText || "";
            return text.slice(0, max);
          },
          args: [p.max || 50000]
        });
        return results && results.length ? results[0].result : "";
      }

      case "cookies.list": {
        const cookies = await chrome.cookies.getAll(p.domain ? { domain: p.domain } : {});
        return cookies.map(c => ({
          name: c.name, value: c.value, domain: c.domain, path: c.path,
          secure: c.secure, httpOnly: c.httpOnly, session: c.session,
          expirationDate: c.expirationDate || null, sameSite: c.sameSite || "unspecified"
        }));
      }

      case "cookies.get": {
        const c = await chrome.cookies.get({ url: p.url, name: p.name });
        return c || null;
      }

      case "cookies.set": {
        const c = await chrome.cookies.set({
          url: p.url,
          name: p.name,
          value: p.value != null ? String(p.value) : "",
          domain: p.domain,
          path: p.path,
          secure: !!p.secure,
          httpOnly: !!p.httpOnly,
          expirationDate: p.expirationDate,
          sameSite: p.sameSite
        });
        return c ? { name: c.name, domain: c.domain, path: c.path } : null;
      }

      case "cookies.remove": {
        const removed = await chrome.cookies.remove({ url: p.url, name: p.name });
        return { removed: !!removed };
      }

      case "downloads.download": {
        const id = await chrome.downloads.download({ url: p.url, filename: p.filename });
        return { id };
      }

      case "downloads.list": {
        const items = await chrome.downloads.search({ limit: p.max || 20, orderBy: ["-startTime"] });
        return items.map(d => ({
          id: d.id, url: d.url, filename: d.filename, state: d.state,
          bytesReceived: d.bytesReceived, totalBytes: d.totalBytes, error: d.error || null
        }));
      }

      case "history.search": {
        const items = await chrome.history.search({
          text: p.text || "",
          maxResults: p.max || 50,
          startTime: p.startTime,
          endTime: p.endTime
        });
        return items.map(i => ({ url: i.url, title: i.title, visitCount: i.visitCount, lastVisitTime: i.lastVisitTime }));
      }

      case "bookmarks.list": {
        return await chrome.bookmarks.getTree();
      }

      case "notifications.send": {
        const id = "bctl-" + Date.now();
        await chrome.notifications.create(id, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: p.title || "BrowserCtl",
          message: p.message || ""
        });
        return { id };
      }

      case "storage.get": {
        return await chrome.storage.local.get(p.keys || null);
      }

      case "storage.set": {
        await chrome.storage.local.set(p.values || {});
        return { ok: true };
      }

      case "settings.get": {
        const { bctlToken = "", bctlPort = 9798, bctlEnabled = true } = await chrome.storage.local.get(["bctlToken", "bctlPort", "bctlEnabled"]);
        return { tokenSet: bctlToken.length > 0, port: bctlPort, enabled: bctlEnabled !== false };
      }

      case "settings.set": {
        const patch = {};
        if (typeof p.port === "number") patch.bctlPort = p.port;
        if (typeof p.token === "string") patch.bctlToken = p.token;
        if (typeof p.enabled === "boolean") patch.bctlEnabled = p.enabled;
        await chrome.storage.local.set(patch);
        return { ok: true };
      }

      case "log.get": {
        const { log = [] } = await chrome.storage.local.get({ log: [] });
        return log;
      }

      default:
        throw new Error("פקודה לא ידועה: " + cmd);
    }
  }

  // ---- auto-configure: pull the token from the local relay if none is stored ----
  // Each Chrome profile has its own extension storage, so a freshly installed
  // copy on a new profile starts with no token. Since the relay is local-only
  // (127.0.0.1), it is safe to self-configure from it.
  async function autoConfigureToken() {
    const { bctlToken = "", bctlPort = 9798 } = await chrome.storage.local.get(["bctlToken", "bctlPort"]);
    if (bctlToken) return bctlToken;
    try {
      const r = await fetch("http://127.0.0.1:" + bctlPort + "/token", { cache: "no-store" });
      if (!r.ok) return "";
      const j = await r.json();
      if (!j || !j.ok || !j.token) return "";
      await chrome.storage.local.set({ bctlToken: j.token });
      return j.token;
    } catch (e) {
      return ""; // relay not up yet — offscreen keeps retrying, this runs again on demand
    }
  }

  // ---- message hub ----
  // read-only/inspection commands are not logged, to keep the audit trail meaningful
  const AUDIT_SKIP = new Set([
    "ping", "info", "log.get", "tabs.list", "tabs.active", "tabs.html",
    "cookies.list", "cookies.get", "history.search", "bookmarks.list",
    "downloads.list", "storage.get", "settings.get"
  ]);
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== "bg") return false;
    if (msg.type === "CMD") {
      exec(msg.cmd, msg.params || {})
        .then(data => {
          if (!AUDIT_SKIP.has(msg.cmd)) void audit({ cmd: msg.cmd, ok: true });
          sendResponse({ id: msg.id, ok: true, data });
        })
        .catch(err => {
          if (!AUDIT_SKIP.has(msg.cmd)) void audit({ cmd: msg.cmd, ok: false, error: String(err && err.message ? err.message : err) });
          sendResponse({ id: msg.id, ok: false, error: String(err && err.message ? err.message : err) });
        });
      return true;
    }
    if (msg.type === "GET_BCTL_SETTINGS") {
      (async () => {
        const { bctlPort = 9798, bctlEnabled = true } = await chrome.storage.local.get(["bctlPort", "bctlEnabled"]);
        // pull (and persist) the token if we don't have one yet — new profiles self-configure
        const token = await autoConfigureToken();
        sendResponse({ ok: true, data: { token, port: bctlPort, enabled: bctlEnabled !== false } });
      })();
      return true;
    }
    if (msg.type === "SET_STATUS") {
      (async () => {
        await chrome.storage.local.set({ bctlStatus: msg.value || {} });
        sendResponse({ ok: true });
      })();
      return true;
    }
    if (msg.type === "ENSURE_OFFSCREEN") {
      ensureOffscreen().then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });

  // when token/port change, tell the offscreen bridge to reconnect
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.bctlToken || changes.bctlPort)) {
      void chrome.runtime.sendMessage({ target: "offscreen", type: "SETTINGS_CHANGED" }).catch(() => void 0);
    }
  });
})();
