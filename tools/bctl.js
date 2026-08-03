"use strict";
// BrowserCtl CLI — send a single command to the BrowserCtl extension through the relay.
//
// Usage:
//   node tools/bctl.js <cmd> [jsonParams]
//   node tools/bctl.js tabs.list
//   node tools/bctl.js cookies.list '{"domain":"example.com"}'
//   node tools/bctl.js tabs.js '{"id":3,"code":"return document.title;"}'
//
//   Env: BCTL_PORT (default 9798), BCTL_TOKEN (default: tools/bctl.token file)
//   Exit code 0 on success, 1 on failure.

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function getToken() {
  if (process.env.BCTL_TOKEN) return process.env.BCTL_TOKEN;
  try {
    return fs.readFileSync(path.join(__dirname, "bctl.token"), "utf8").trim();
  } catch (e) {
    return "";
  }
}

// RFC6455 client->server frames MUST be masked.
function encodeFrame(opcode, payloadBuf) {
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  const maskKey = crypto.randomBytes(4);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payloadBuf[i] ^ maskKey[i % 4];
  return Buffer.concat([header, maskKey, masked]);
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log("BrowserCtl CLI — שליחת פקודה לתוסף");
    console.log("שימוש: node tools/bctl.js <cmd> [jsonParams]");
    console.log("");
    console.log("דוגמאות:");
    console.log("  node tools/bctl.js tabs.list");
    console.log("  node tools/bctl.js tabs.active");
    console.log("  node tools/bctl.js tabs.open '{\"url\":\"https://example.com\"}'");
    console.log("  node tools/bctl.js cookies.list '{\"domain\":\"example.com\"}'");
    console.log("  node tools/bctl.js tabs.js '{\"id\":3,\"code\":\"return document.title;\"}'");
    console.log("  node tools/bctl.js history.search '{\"text\":\"youtube\",\"max\":5}'");
    process.exit(0);
  }
  let params = {};
  if (args[1]) {
    try { params = JSON.parse(args[1]); }
    catch (e) { console.error("❌ JSON לא תקין:", args[1]); process.exit(1); }
  }

  const port = parseInt(process.env.BCTL_PORT || "9798", 10);
  const token = getToken();
  const reqId = "cli-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);

  const socket = new (require("net").Socket)();
  let buffer = Buffer.alloc(0);
  let handshakeDone = false;
  let replied = false;
  const timeout = setTimeout(() => {
    console.error("❌ timeout — השרת לא מגיב. הרצת: node tools/control-server.js ?");
    process.exit(1);
  }, 15000);

  socket.connect(port, "127.0.0.1", () => {
    const key = crypto.randomBytes(16).toString("base64");
    socket.write(
      "GET / HTTP/1.1\r\n" +
      "Host: 127.0.0.1\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      "Sec-WebSocket-Key: " + key + "\r\n" +
      "Sec-WebSocket-Version: 13\r\n\r\n"
    );
  });

  socket.on("data", (d) => {
    buffer = Buffer.concat([buffer, d]);
    if (!handshakeDone) {
      const idx = buffer.indexOf("\r\n\r\n");
      if (idx === -1) return;
      const head = buffer.subarray(0, idx).toString("utf8");
      if (!/^HTTP\/1\.1 101/.test(head)) {
        console.error("❌ השרת סירב לחיבור WebSocket:");
        console.error(head.split("\r\n")[0]);
        process.exit(1);
      }
      handshakeDone = true;
      buffer = buffer.subarray(idx + 4);
      // say hello
      socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify({ type: "hello", role: "cli", token }), "utf8")));
      // then send the command
      socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify({ type: "cmd", id: reqId, cmd, params }), "utf8")));
    }
    // parse frames
    for (;;) {
      const parsed = parseFrame(buffer);
      if (!parsed) break;
      buffer = parsed.rest;
      const { opcode, payload } = parsed;
      if (opcode === 0x1) {
        const msg = JSON.parse(payload.toString("utf8"));
        if (msg.type === "error") {
          console.error("❌ שגיאה:", msg.error);
          clearTimeout(timeout);
          process.exit(1);
        }
        if (msg.type === "reply" && msg.id === reqId) {
          clearTimeout(timeout);
          replied = true;
          if (msg.ok) {
            console.log(JSON.stringify(msg.data, null, 2));
            process.exit(0);
          } else {
            console.error("❌ הפקודה נכשלה:", msg.error);
            process.exit(1);
          }
        }
      }
      if (opcode === 0x8) {
        console.error("❌ החיבור נסגר על ידי השרת");
        process.exit(1);
      }
    }
  });

  socket.on("error", (e) => {
    clearTimeout(timeout);
    console.error("❌ לא ניתן להתחבר ל-127.0.0.1:" + port, "—", e.code);
    console.error("   ודא שהשרת רץ: node tools/control-server.js");
    process.exit(1);
  });
}

function parseFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    off = 10;
  }
  let mask = null;
  if (masked) {
    if (buf.length < off + 4) return null;
    mask = buf.subarray(off, off + 4);
    off += 4;
  }
  if (buf.length < off + len) return null;
  let payload = Buffer.from(buf.subarray(off, off + len));
  if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  return { opcode, payload, rest: buf.subarray(off + len) };
}

main();
