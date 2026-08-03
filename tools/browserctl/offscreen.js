"use strict";
(() => {
  // Offscreen documents do NOT have access to chrome.storage in this Chrome build.
  // All settings flow through the background service worker instead.
  const DEFAULT_PORT = 9798;
  let ws = null;
  let retryTimer = null;

  function sendToBg(msg) {
    return chrome.runtime.sendMessage({ target: "bg", ...msg }).catch(() => null);
  }

  async function readSettings() {
    const res = await sendToBg({ type: "GET_BCTL_SETTINGS" });
    const s = res && res.data ? res.data : {};
    return { token: s.token || "", port: Number(s.port) || DEFAULT_PORT };
  }

  async function markStatus(connected) {
    await sendToBg({ type: "SET_STATUS", value: { connected, at: Date.now() } });
  }

  function connect() {
    clearTimeout(retryTimer);
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
    (async () => {
      const { token, port } = await readSettings();
      const url = "ws://127.0.0.1:" + port;
      let socket;
      try {
        socket = new WebSocket(url);
      } catch (e) {
        scheduleRetry();
        return;
      }
      ws = socket;
      socket.onopen = () => {
        if (ws === socket) {
          try { socket.send(JSON.stringify({ type: "hello", role: "agent", token })); } catch (e) { /* ignore */ }
        }
      };
      socket.onmessage = async (ev) => {
        if (ws !== socket) return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg || !msg.type) return;
        // the relay confirms our hello with hello_ok — that is when we are truly connected
        if (msg.type === "hello_ok") {
          void markStatus(true);
          return;
        }
        if (msg.type === "error" && msg.error === "E_BAD_TOKEN") {
          void markStatus(false);
          return;
        }
        if (msg.type !== "cmd" || !msg.cmd) return;
        const reply = await sendToBg({ type: "CMD", id: msg.id, cmd: msg.cmd, params: msg.params || {} });
        const safe = reply || { ok: false, error: "no response from background" };
        if (ws === socket && socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({
              type: "reply", id: msg.id, clientId: msg.clientId, ok: !!safe.ok,
              data: safe.data, error: safe.error
            }));
          } catch (e) { /* ignore */ }
        }
      };
      socket.onclose = () => {
        if (ws === socket) ws = null;
        void markStatus(false);
        scheduleRetry();
      };
      socket.onerror = () => {
        try { socket.close(); } catch (e) { /* ignore */ }
      };
      void markStatus(false);
    })();
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, 3000);
  }

  // background notifies us when the token/port change
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.target === "offscreen" && msg.type === "SETTINGS_CHANGED") {
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      ws = null;
      connect();
    }
  });

  connect();
  // keepalive
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: "ping" })); } catch (e) { /* ignore */ }
    }
  }, 30000);
})();
