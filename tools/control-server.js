"use strict";
// BrowserCtl relay — local WebSocket bridge between the CLI/agent (this tool) and the
// BrowserCtl extension installed in Chrome. Binds to 127.0.0.1 only. Zero dependencies.
//
// Usage:
//   node tools/control-server.js [--port 9798] [--token <token>]
// Token can also come from env BCTL_TOKEN or the file tools/bctl.token (auto-generated).
//
// Protocol (JSON over WebSocket):
//   agent  -> server : {"type":"hello","role":"agent","token":"..."}
//   cli    -> server : {"type":"hello","role":"cli","token":"..."}
//   cli    -> server : {"type":"cmd","id":"x","cmd":"tabs.list","params":{...}}
//   server -> agent  : {"type":"cmd","id":"x","cmd":"tabs.list","params":{...}}
//   agent  -> server : {"type":"reply","id":"x","ok":true,"data":{...},"error":null}
//   server -> cli    : {"type":"reply","id":"x","ok":true,"data":{...},"error":null}
//   either -> server : {"type":"ping"} -> {"type":"pong"}

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const VERSION = "0.1.0";

// ---------- tiny RFC6455 implementation (server side) ----------

function encodeFrame(opcode, payloadBuf) {
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payloadBuf]);
}

class WsPeer {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.onMessage = null;
    this.onClose = null;
    socket.on("data", (d) => this._onData(d));
    socket.on("close", () => this.onClose && this.onClose());
    socket.on("error", () => {});
  }
  sendText(s) {
    if (this.socket.writable) this.socket.write(encodeFrame(0x1, Buffer.from(s, "utf8")));
  }
  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const parsed = this._parseOne();
      if (!parsed) break;
      const { opcode, payload } = parsed;
      if (opcode === 0x8) { // close
        this.socket.end();
        this.onClose && this.onClose();
        break;
      }
      if (opcode === 0x9) { // ping -> pong
        this.socket.write(encodeFrame(0xA, payload));
        continue;
      }
      if (opcode === 0x1 && this.onMessage) {
        this.onMessage(payload.toString("utf8"));
      }
      // opcode 0x2 (binary) and 0x0 (continuation) are not used by our clients
    }
  }
  _parseOne() {
    const b = this.buffer;
    if (b.length < 2) return null;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < 4) return null;
      len = b.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (b.length < 10) return null;
      const big = b.readBigUInt64BE(2);
      len = Number(big);
      if (len > 64 * 1024 * 1024) return null;
      off = 10;
    }
    let mask = null;
    if (masked) {
      if (b.length < off + 4) return null;
      mask = b.subarray(off, off + 4);
      off += 4;
    }
    if (b.length < off + len) return null;
    let payload = Buffer.from(b.subarray(off, off + len));
    if (masked) {
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    this.buffer = b.subarray(off + len);
    return { opcode, payload };
  }
}

// ---------- main ----------

function getToken() {
  const fromEnv = process.env.BCTL_TOKEN;
  if (fromEnv) return fromEnv;
  const tokenFile = path.join(__dirname, "bctl.token");
  try {
    const t = fs.readFileSync(tokenFile, "utf8").trim();
    if (t) return t;
  } catch (e) { /* ignore */ }
  const fresh = crypto.randomBytes(18).toString("hex");
  try { fs.writeFileSync(tokenFile, fresh); } catch (e) { /* ignore */ }
  return fresh;
}

function parseArgs(argv) {
  const args = { port: 9798, token: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") args.port = parseInt(argv[i + 1], 10) || 9798;
    if (argv[i] === "--token") args.token = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const TOKEN = args.token || getToken();
const PORT = args.port;

let agentPeer = null;          // the connected extension
const cliPeers = new Set();    // connected CLI clients

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health" || url.pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      service: "browserctl-relay",
      version: VERSION,
      port: PORT,
      agentConnected: !!agentPeer,
      cliConnected: cliPeers.size
    }));
    return;
  }
  // the token is a local-machine secret: the relay binds to 127.0.0.1 only,
  // so serving it locally lets the extension auto-configure on any profile.
  if (url.pathname === "/token") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, token: TOKEN }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );
  const peer = new WsPeer(socket);
  let role = null;

  peer.onMessage = (text) => {
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "ping") { peer.sendText(JSON.stringify({ type: "pong" })); return; }

    if (msg.type === "hello") {
      if (msg.token !== TOKEN) {
        console.log("[relay] ✗ hello rejected — token mismatch (role=" + msg.role + ", tokenPresent=" + (!!msg.token) + ")");
        peer.sendText(JSON.stringify({ type: "error", error: "E_BAD_TOKEN" }));
        socket.end();
        return;
      }
      role = msg.role;
      if (role === "agent") {
        if (agentPeer && agentPeer !== peer) {
          agentPeer.sendText(JSON.stringify({ type: "error", error: "E_AGENT_REPLACED" }));
          agentPeer.socket.end();
        }
        agentPeer = peer;
        peer.onClose = () => { if (agentPeer === peer) agentPeer = null; };
        peer.sendText(JSON.stringify({ type: "hello_ok", role: "agent", version: VERSION }));
        console.log("[relay] agent connected ✓  (token ok)");
      } else if (role === "cli") {
        const cid = "c" + (cliPeers.size + 1);
        peer.clientId = cid;
        cliPeers.add(peer);
        peer.onClose = () => cliPeers.delete(peer);
        peer.sendText(JSON.stringify({ type: "hello_ok", role: "cli", version: VERSION, clientId: cid }));
        console.log("[relay] cli connected (" + cliPeers.size + ")");
      } else {
        peer.sendText(JSON.stringify({ type: "error", error: "E_BAD_ROLE" }));
        socket.end();
      }
      return;
    }

    if (msg.type === "cmd") {
      if (!agentPeer) {
        peer.sendText(JSON.stringify({ type: "reply", id: msg.id, ok: false, error: "E_NO_AGENT", data: null }));
        return;
      }
      agentPeer.sendText(JSON.stringify({ type: "cmd", id: msg.id, cmd: msg.cmd, params: msg.params || {} }));
      return;
    }

    if (msg.type === "reply" && role === "agent") {
      // route the reply back to the CLI that asked, by clientId
      const text2 = JSON.stringify(msg);
      if (msg.clientId) {
        for (const c of cliPeers) {
          if (c.clientId === msg.clientId) { c.sendText(text2); return; }
        }
      }
      // fallback: broadcast (single-client setups)
      for (const c of cliPeers) c.sendText(text2);
    }
  };

  peer.onClose = () => {
    if (agentPeer === peer) {
      agentPeer = null;
      console.log("[relay] agent disconnected");
    }
    cliPeers.delete(peer);
  };
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║        BrowserCtl relay — local bridge        ║");
  console.log("╚═══════════════════════════════════════════════╝");
  console.log("  WebSocket : ws://127.0.0.1:" + PORT);
  console.log("  Health    : http://127.0.0.1:" + PORT + "/health");
  console.log("  Token     : " + TOKEN);
  console.log("  הדביקו את הטוקן בדף ההגדרות של התוסף (או הפוכו).");
  console.log("  ממתין לחיבור מהתוסף...");
  console.log("");
});

server.on("error", (e) => {
  console.error("[relay] error:", e.message);
  if (e.code === "EADDRINUSE") {
    console.error("  הפורט " + PORT + " תפוס. נסו: node tools/control-server.js --port " + (PORT + 1));
  }
  process.exit(1);
});
