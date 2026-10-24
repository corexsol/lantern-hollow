"use strict";
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { RoomHost } = require("../multiplayer-core.js");
function onlineClass(source = path.resolve(__dirname, "../online.js")) {
  const window = { LanternCore: {}, LanternLocale: { register() {} }, LanternMultiplayer: { RoomHost }, LanternNetwork: { normalizeRoomCode: value => value, isValidRoomCode: value => /^[A-HJ-NP-Z2-9]{6}$/.test(value) } };
  vm.runInNewContext(fs.readFileSync(source, "utf8"), { window, queueMicrotask });
  return window.OnlineGame;
}
function activeRoom(count, source) {
  let time = 100000;
  const host = new RoomHost({ code: "ABC234", hostProfile: { name: "Host" }, now: () => time });
  const ids = ["host"];
  for (let n = 1; n < count; n++) ids.push(host.join(`performance-token-${n}`, { name: `Friend ${n}` }));
  for (const id of ids) host.command(id, { type: "ready", ready: true });
  if (!host.command("host", { type: "start" }).ok) throw new Error("Could not start performance fixture");
  host.command("host", { type: "advance" });
  const OnlineGame = onlineClass(source), online = Object.create(OnlineGame.prototype), packets = [];
  Object.assign(online, { authority: host, projections: new Map(), receive() {}, network: { sendTo(id, message) { packets.push({ id, message }); return true; } } });
  return { host, online, packets, ids, async flush() { online.broadcast(); await Promise.resolve(); }, async tick(ms = 250) { time += ms; host.tick(time); online.broadcast(); await Promise.resolve(); } };
}
module.exports = { onlineClass, activeRoom };
