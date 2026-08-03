"use strict";
// cdp-eval.js — tiny zero-dependency CDP helper for the BrowserCtl toolchain.
//
// Usage:
//   node tools/cdp-eval.js <port> <urlSubstring|type:page|type:service_worker> "<expression>"
//   node tools/cdp-eval.js 9222 options.html "document.title"
//   node tools/cdp-eval.js 9222 type:service_worker "chrome.runtime.getManifest().version"
//
// Prints the JSON result value of the evaluated expression (returnByValue).
const http = require("http");
const crypto = require("crypto");

function frame(op, payload) {
  const b = Buffer.from(payload, "utf8");
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(b.length);
  for (let i = 0; i < b.length; i++) masked[i] = b[i] ^ mask[i % 4];
  let h;
  if (b.length < 126) {
    h = Buffer.from([0x80 | op, 0x80 | b.length]);
  } else if (b.length < 65536) {
    h = Buffer.alloc(4);
    h[0] = 0x80 | op;
    h[1] = 0x80 | 126;
    h.writeUInt16BE(b.length, 2);
  } else {
    h = Buffer.alloc(10);
    h[0] = 0x80 | op;
    h[1] = 0x80 | 127;
    h.writeBigUInt64BE(BigInt(b.length), 2);
  }
  return Buffer.concat([h, mask, masked]);
}

function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });
}

(async () => {
  const [port, filter, expression] = process.argv.slice(2);
  if (!port || !filter || !expression) {
    console.error("Usage: node tools/cdp-eval.js <port> <urlSubstring|type:TYPE> <expression>");
    process.exit(1);
  }
  const targets = await getJson("http://127.0.0.1:" + port + "/json");
  let target = null;
  if (filter.startsWith("type:")) {
    target = targets.find((t) => t.type === filter.slice(5));
  } else {
    target = targets.find((t) => (t.url || "").includes(filter));
  }
  if (!target) {
    console.error("NO_TARGET for filter: " + filter);
    process.exit(2);
  }
  const u = new URL(target.webSocketDebuggerUrl);
  const key = crypto.randomBytes(16).toString("base64");
  const req = http.request({
    host: "127.0.0.1",
    port: u.port,
    path: u.pathname + u.search,
    headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Key": key, "Sec-WebSocket-Version": "13" }
  });
  req.on("upgrade", (_res, socket) => {
    let buf = Buffer.alloc(0);
    let id = 0;
    const pend = {};
    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (buf.length < 2) break;
        const len = buf[1] & 0x7f;
        let off = 2, ln = len;
        if (len === 126) { if (buf.length < 4) break; ln = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) break; ln = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + ln) break;
        const pl = buf.subarray(off, off + ln);
        buf = buf.subarray(off + ln);
        try {
          const j = JSON.parse(pl.toString());
          if (j.id && pend[j.id]) { pend[j.id](j); delete pend[j.id]; }
        } catch (e) { /* ignore */ }
      }
    });
    const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend[i] = r; socket.write(frame(1, JSON.stringify({ id: i, method: m, params: p }))); });
    (async () => {
      await send("Runtime.enable");
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      const out = r.result && r.result.result;
      if (out && out.subtype === "error" && out.description) {
        console.error("EVAL_ERROR: " + out.description.slice(0, 400));
        process.exitCode = 3;
      } else if (r.result && r.result.exceptionDetails) {
        console.error("EXCEPTION: " + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
        process.exitCode = 3;
      } else {
        console.log(out ? JSON.stringify(out.value) : "undefined");
      }
      socket.end();
    })();
  });
  req.on("error", (e) => { console.error("CONNECT_ERROR: " + e.message); process.exit(1); });
  req.end();
})();
