"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { activeRoom, onlineClass } = require("./performance-fixture.cjs");
const { RelayRoomNetwork } = require("../relay-network.js");
for (const count of [4, 12]) test(`${count} seats send full private views on changes and only 1Hz clocks between actions`, async () => {
  const r = activeRoom(count);
  await r.flush();
  assert.equal(r.packets.length, count - 1);
  for (let n = 0; n < 16; n++) await r.tick();
  const snapshots = r.packets.filter(p => p.message.type === "snapshot"), clocks = r.packets.filter(p => p.message.type === "clock");
  assert.equal(snapshots.length, count - 1);
  assert.equal(clocks.length, 4 * (count - 1));
  assert.ok(clocks.every(p => !JSON.stringify(p.message).includes("Friend") && !JSON.stringify(p.message).includes("role")));
  // A command's emit callback and its explicit broadcast must share one flush.
  const before = r.packets.length;
  r.host.onChange = () => r.online.broadcast();
  assert.equal(r.host.command("host", { type: "pause", paused: true }).ok, true);
  r.online.broadcast(); r.online.broadcast();
  await Promise.resolve();
  assert.equal(r.packets.length - before, count - 1);
  assert.ok(r.packets.slice(before).every(p => p.message.type === "snapshot"));
  const ownRole = snapshots[0].message.view.players[0].role;
  assert.ok(ownRole);
  assert.ok(snapshots.every(p => p.message.view.players.slice(1).every(player => player.role === undefined)));
});
test("clock synchronization advances scene time without rebuilding the UI or rolling back a newer projection", () => {
  const OnlineGame = onlineClass(), online = Object.create(OnlineGame.prototype), advances = [];
  Object.assign(online, { lastPacket: { seq: 10, sceneKey: 3, view: { phase: "resolve" } }, e: { nightSequence: { elapsed: 1 } }, animateNight: dt => advances.push(dt) });
  online.receive({ type: "clock", seq: 11, phase: "resolve", sceneKey: 3, duration: 8, remaining: 5, sceneElapsed: 3 });
  assert.deepEqual(advances, [2]); assert.equal(online.e.elapsed, 3);
  online.receive({ type: "clock", seq: 9, phase: "resolve", sceneKey: 3, duration: 8, remaining: 7, sceneElapsed: 1 });
  online.receive({ type: "clock", seq: 12, phase: "night", sceneKey: 4, duration: 8, remaining: 4 });
  assert.deepEqual(advances, [2]); assert.equal(online.e.remaining, 5);
});
test("relay writes run at bounded concurrency while admission and messages retain seat order", async () => {
  const network = new RelayRoomNetwork(), requests = [], releases = [];
  Object.assign(network, { mode: "host", _closed: false, code: "ABC234", secret: "test-secret" });
  network._request = async (action, data) => { requests.push({ action, ...data }); await new Promise(resolve => releases.push(resolve)); return {}; };
  for (let n = 1; n <= 6; n++) {
    const entry = { id: `connection-${n}`, memberId: null }; network.connections.set(entry.id, entry);
    assert.equal(network.accept(entry.id, `p${n}`), true);
    assert.equal(network.sendTo(`p${n}`, { type: "snapshot", seq: n }), true);
  }
  await Promise.resolve(); await Promise.resolve();
  assert.equal(requests.length, 4); assert.ok(requests.every(r => r.action === "accept"));
  while (network._queued) { releases.splice(0).forEach(release => release()); await new Promise(resolve => setImmediate(resolve)); }
  assert.equal(requests.length, 12);
  for (let n = 1; n <= 6; n++) {
    assert.deepEqual(requests.filter(r => r.memberId === `p${n}`).map(r => r.action), ["accept", "send"]);
  }
  await network._chain;
});
test("one retrying seat does not delay another seat's acknowledgement", async () => {
  const network = new RelayRoomNetwork(), delivered = [];
  Object.assign(network, { mode: "host", _closed: false });
  let release;
  network._write = async (_action, data) => { if (data.memberId === "slow") await new Promise(resolve => { release = resolve; }); delivered.push(data.memberId); };
  network._queue("send", { memberId: "slow" }); network._queue("send", { memberId: "fast" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(delivered, ["fast"]);
  release(); await network._chain; assert.deepEqual(delivered, ["fast", "slow"]);
});
test("slow writes coalesce clocks separately from the initial full private view", async () => {
  const network = new RelayRoomNetwork(), received = [];
  Object.assign(network, { mode: "host", _closed: false });
  network.members.set("p1", { id: "connection-1", memberId: "p1" });
  let release;
  network._write = async (_action, data) => { if (data.message.type === "snapshot") await new Promise(resolve => { release = resolve; }); received.push(data.message); };
  network.sendTo("p1", { type: "snapshot", privateRole: "doctor" });
  await new Promise(resolve => setImmediate(resolve));
  for (let seq = 0; seq < 1000; seq++) assert.equal(network.sendTo("p1", { type: "clock", seq }), true);
  assert.equal(network._queued, 2);
  release(); await network._chain;
  assert.equal(received.length, 2); assert.equal(received[0].privateRole, "doctor");
  assert.equal(received[1].seq, 999);
});
test("stopping discards pending writes and a new session does not inherit old active lanes", async t => {
  const network = new RelayRoomNetwork({ relayUrl: "http://127.0.0.1" }), started = [], releases = new Map();
  Object.assign(network, { mode: "host", code: "ABC234", secret: "x".repeat(32), _closed: false, _generation: 1 });
  network._request = async (action, data) => {
    if (action === "create") return { secret: "y".repeat(32), connectionId: "new-host" };
    if (action !== "send") return { messages: [] };
    started.push(data.message.seq);
    await new Promise(resolve => releases.set(data.message.seq, resolve));
    return {};
  };
  t.after(() => { network._stop(new Error("test cleanup")); for (const resolve of releases.values()) resolve(); });
  for (let n = 1; n <= 6; n++) {
    network.members.set(`p${n}`, { id: `connection-${n}`, memberId: `p${n}` });
    network.sendTo(`p${n}`, { type: "snapshot", seq: n });
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [1, 2, 3, 4]);
  const oldDrain = network._chain;
  network._stop(new Error("reconnect"));
  await network.create("DEF234");
  network.members.set("p1", { id: "new-connection", memberId: "p1" });
  network.sendTo("p1", { type: "snapshot", seq: 100 });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [1, 2, 3, 4, 100]);
  for (const seq of [1, 2, 3, 4]) releases.get(seq)();
  await oldDrain;
  assert.equal(network._activeWrites, 1); assert.equal(network._activeLanes.has("p1"), true);
  releases.get(100)(); await network._chain;
  assert.equal(network._queued, 0);
  await network.close();
});
test("in-match rejoin keeps a first projection received in the admission poll", async () => {
  const OnlineGame = onlineClass(), online = Object.create(OnlineGame.prototype);
  Object.assign(online, { e: { ui: { root: { querySelector: () => ({ value: "ABC234" }) } } }, profile: () => ({}), home() {}, remember() {}, renderRoom() { assert.fail("A first game projection must not be replaced by the lobby"); },
    makeNetwork() { return { async join() { online.room = { code: "ABC234" }; online.lastPacket = { view: { phase: "day" } }; online.e.state = { phase: "day" }; return "member-1"; } }; } });
  await online.join();
  assert.equal(online.memberId, "member-1"); assert.equal(online.e.state.phase, "day");
});
