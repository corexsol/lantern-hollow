"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { startRelayFixture } = require("./relay-fixture.cjs");
const origin = "https://corexsol.github.io";
const token = (s) => `secure-player-token-${s}-abcdefghijklmnopqrstuvwxyz`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 6000) { const start = Date.now(); while (!predicate()) { if (Date.now() - start > timeout) throw new Error("Timed out waiting for relay delivery"); await pause(20); } }
async function request(f, code, action, bearer, body = {}, requestOrigin = origin) {
  const response = await fetch(`${f.url}/v1/rooms/${code}/${action}`, { method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
test("HTTPS relay implementation is present", () => assert.ok(existsSync(resolve(__dirname, "../relay-network.js")), "RelayRoomNetwork must implement the real HTTPS transport"));

test("real HTTP worker authenticates admission, private mailboxes, seat reuse, spoof stripping and closure", async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const created = await request(f, "ABC234", "create", null);
  assert.equal(created.status, 201); const host = created.body.secret;
  assert.ok(host.length >= 32);
  assert.equal((await request(f, "ABC234", "create", null)).status, 409);
  assert.equal((await request(f, "ABC234", "poll", token("wrong"))).status, 401);
  assert.equal((await request(f, "ABC234", "poll", host, {}, "https://evil.example")).status, 403);
  const joined = await request(f, "ABC234", "join", null, { token: token("one"), profile: { name: "One" } });
  const second = await request(f, "ABC234", "join", null, { token: token("two"), profile: { name: "Two" } });
  assert.equal(joined.status, 201); assert.equal(second.status, 201);
  const a = joined.body, b = second.body;
  const inbox = await request(f, "ABC234", "poll", host);
  assert.equal(inbox.body.messages.length, 2);
  assert.equal(inbox.body.messages[0].hello.token, token("one"));
  assert.equal((await request(f, "ABC234", "send", a.secret, { message: { type: "chat" } })).status, 403);
  assert.equal((await request(f, "ABC234", "accept", host, { connectionId: a.connectionId, memberId: "p1" })).status, 200);
  assert.equal((await request(f, "ABC234", "accept", host, { connectionId: b.connectionId, memberId: "p2" })).status, 200);
  assert.equal((await request(f, "ABC234", "send", host, { memberId: "p1", message: { type: "snapshot", role: "moon" } })).status, 200);
  const aInbox = (await request(f, "ABC234", "poll", a.secret)).body;
  const bInbox = (await request(f, "ABC234", "poll", b.secret)).body;
  assert.equal(aInbox.messages.find(m => m.type === "message").message.role, "moon");
  assert.equal(bInbox.messages.some(m => m.type === "message"), false);
  assert.equal(JSON.stringify(bInbox).includes(token("one")), false);
  await request(f, "ABC234", "send", a.secret, { message: { type: "chat", actor: "p2", memberId: "p2", text: "hello" } });
  const hostInbox = (await request(f, "ABC234", "poll", host, { after: inbox.body.cursor })).body;
  const command = hostInbox.messages.find(m => m.type === "message");
  assert.equal(command.memberId, "p1"); assert.equal(command.message.actor, undefined); assert.equal(command.message.memberId, undefined);
  const rejoined = (await request(f, "ABC234", "join", null, { token: token("one"), profile: { name: "Again" } })).body;
  assert.notEqual(rejoined.secret, a.secret);
  assert.equal((await request(f, "ABC234", "poll", a.secret)).status, 401);
  assert.equal((await request(f, "ABC234", "accept", host, { connectionId: rejoined.connectionId, memberId: "stolen-seat" })).status, 409);
  assert.equal((await request(f, "ABC234", "accept", host, { connectionId: rejoined.connectionId, memberId: "p1" })).status, 200);
  await request(f, "ABC234", "close", host);
  assert.equal((await request(f, "ABC234", "poll", rejoined.secret)).status, 410);
});

test("real worker bounds payloads and queues and expires a lost host lease", async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const host = (await request(f, "DEF234", "create", null)).body.secret;
  const guest = (await request(f, "DEF234", "join", null, { token: token("bound"), profile: { name: "Bound" } })).body;
  await request(f, "DEF234", "accept", host, { connectionId: guest.connectionId, memberId: "p1" });
  assert.equal((await request(f, "DEF234", "send", guest.secret, { message: { text: "x".repeat(17000) } })).status, 413);
  for (let i = 0; i < 140; i++) {
    const result = await request(f, "DEF234", "send", guest.secret, { message: { type: "chat", text: `${i}` } });
    if (result.status !== 200) { assert.ok([429, 503].includes(result.status)); break; }
  }
  assert.ok(f.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM messages").get().n <= 129);
  f.DB.sqlite.prepare("UPDATE rooms SET lease_until = ?").run(Date.now() - 1);
  assert.equal((await request(f, "DEF234", "poll", guest.secret)).status, 410);
});

test("simultaneous admissions cannot exceed the bounded token seat capacity", async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  await request(f, "JKL234", "create", null);
  // Interleave real SQL reads before writes, as concurrent remote D1 calls can do.
  let readers = 0, release;
  const readBarrier = new Promise(resolve => { release = resolve; });
  f.DB.afterRead = async sql => { if (sql === "SELECT COUNT(*) AS n FROM seats WHERE room_id = ?") { readers++; if (readers === 24) release(); await readBarrier; } };
  const results = await Promise.all(Array.from({ length: 24 }, (_, i) => request(f, "JKL234", "join", null, { token: token(`parallel${i}`), profile: { name: `Player ${i}` } })));
  assert.ok(results.every(r => [201, 409].includes(r.status)), `Admission responses: ${results.map(r => r.status)}`);
  assert.equal(results.filter(r => r.status === 201).length, 16);
  assert.equal(f.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM seats").get().n, 16);
  assert.equal(f.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM messages").get().n, 16);
});

test("a slow guest mailbox retains its latest private snapshot without filling the queue", async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const host = (await request(f, "MNP234", "create", null)).body.secret;
  const guest = (await request(f, "MNP234", "join", null, { token: token("slow"), profile: { name: "Slow" } })).body;
  await request(f, "MNP234", "accept", host, { connectionId: guest.connectionId, memberId: "p1" });
  for (let seq = 0; seq < 140; seq++) assert.equal((await request(f, "MNP234", "send", host, { memberId: "p1", message: { type: "snapshot", seq, privateFor: "p1" } })).status, 200);
  const mailbox = (await request(f, "MNP234", "poll", guest.secret)).body.messages;
  assert.equal(mailbox.length, 2);
  assert.deepEqual(mailbox.find(m => m.type === "message").message, { type: "snapshot", seq: 139, privateFor: "p1" });
});

test("a full host mailbox retries stale guest leave notifications after acknowledgements free capacity", async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const host = (await request(f, "TUV234", "create", null)).body.secret;
  const guest = (await request(f, "TUV234", "join", null, { token: token("stale-full"), profile: { name: "Stale" } })).body;
  await request(f, "TUV234", "accept", host, { connectionId: guest.connectionId, memberId: "p1" });
  for (let i = 0; i < 127; i++) assert.equal((await request(f, "TUV234", "send", guest.secret, { message: { type: "chat", text: "x" } })).status, 200);
  f.DB.sqlite.prepare("UPDATE seats SET seen_at = ?").run(Date.now() - 90001);
  const first = (await request(f, "TUV234", "poll", host)).body;
  assert.equal(f.DB.sqlite.prepare("SELECT status FROM seats").get().status, "accepted");
  const second = (await request(f, "TUV234", "poll", host, { after: first.cursor })).body;
  const third = (await request(f, "TUV234", "poll", host, { after: second.cursor })).body;
  assert.equal(f.DB.sqlite.prepare("SELECT status FROM seats").get().status, "left");
  const leaves = [...first.messages, ...second.messages, ...third.messages].filter(m => m.type === "leave");
  assert.equal(leaves.length, 1); assert.equal(leaves[0].memberId, "p1");
});

test("fast host ticks coalesce pending snapshots per member while preserving latest state", async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const { RelayRoomNetwork } = require("../relay-network.js");
  const received = [];
  let host;
  host = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 30, origin, onJoin: id => host.accept(id, "p1") });
  const guest = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 30, origin, onMessage: message => received.push(message) });
  t.after(() => host.close()); t.after(() => guest.close());
  await host.create("QRS234"); await guest.join("QRS234", { token: token("ticks"), profile: { name: "Ticks" } });
  for (let seq = 0; seq < 1000; seq++) assert.equal(host.sendTo("p1", { type: "snapshot", seq }), true);
  await until(() => received.some(message => message.seq === 999));
  assert.equal(host.status, "open");
});

test("RoomNetwork API exchanges private packets across four independent HTTP clients", async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const { RelayRoomNetwork } = require("../relay-network.js");
  const commands = [], snapshots = [[], [], []], leaves = [];
  let host;
  host = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 30, origin, onJoin: (id, hello) => host.accept(id, `p${hello.profile.n}`), onMessage: (message, actor) => commands.push({ message, actor }), onLeave: id => leaves.push(id) });
  t.after(() => host.close()); await host.create("GHJ234");
  const guests = [];
  for (let n = 1; n <= 3; n++) {
    const guest = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 30, origin, onMessage: message => snapshots[n - 1].push(message) }); guests.push(guest); t.after(() => guest.close());
    assert.equal(await guest.join("GHJ234", { token: token(n), profile: { n } }), `p${n}`);
  }
  assert.equal(host.broadcast(id => ({ type: "snapshot", privateFor: id })), 3);
  guests[0].send({ type: "chat", actor: "p3", text: "one" });
  await until(() => snapshots.every(list => list.length) && commands.length);
  snapshots.forEach((list, n) => assert.equal(list[0].privateFor, `p${n + 1}`));
  assert.equal(commands[0].actor, "p1"); assert.equal(commands[0].message.actor, undefined);
  await guests[0].close(); await until(() => leaves.includes("p1"));
  const replacement = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 30, origin }); t.after(() => replacement.close());
  assert.equal(await replacement.join("GHJ234", { token: token(1), profile: { n: 1 } }), "p1");
  await host.close(); await until(() => replacement.status === "disconnected");
});

test("lobby token rejoin gets its initial snapshot after a pre-accept authoritative roster broadcast", async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const { RelayRoomNetwork } = require("../relay-network.js");
  const { RoomHost } = require("../multiplayer-core.js");
  const originalPackets = [], rejoinedPackets = [], leaves = [];
  const nativeFetch = global.fetch;
  let staleSends = 0;
  global.fetch = async (url, options) => {
    const response = await nativeFetch(url, options);
    if (String(url).startsWith(f.url) && String(url).endsWith("/send") && response.status === 409 && (await response.clone().json()).error.code === "member-disconnected") staleSends++;
    return response;
  };
  t.after(() => { global.fetch = nativeFetch; });
  let host, authority, broadcasts = 0;
  host = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 25, origin,
    onJoin: (connectionId, hello) => {
      // RoomHost.join emits its roster change synchronously, before admission.
      const memberId = authority.join(hello.token, hello.profile);
      host.accept(connectionId, memberId);
      host.sendTo(memberId, authority.snapshot(memberId));
    },
    onLeave: id => leaves.push(id),
  });
  t.after(() => host.close()); await host.create("KLM234");
  authority = new RoomHost({ code: "KLM234", hostProfile: { name: "Host" }, onChange: () => { broadcasts++; host.broadcast(id => authority.snapshot(id)); } });
  const original = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 25, origin, onMessage: packet => originalPackets.push(packet) });
  const rejoined = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 25, origin, onMessage: packet => rejoinedPackets.push(packet) });
  t.after(() => original.close()); t.after(() => rejoined.close());
  const memberId = await original.join("KLM234", { token: token("lobby-reload"), profile: { name: "Original" } });
  await until(() => originalPackets.length > 0); await host._chain;
  // A replacement tab reuses the browser token without a graceful leave.
  assert.equal(await rejoined.join("KLM234", { token: token("lobby-reload"), profile: { name: "Reloaded" } }), memberId);
  await host._chain;
  assert.equal(staleSends, 1);
  assert.equal(host.members.get(memberId).id, rejoined.connectionId);
  assert.deepEqual(leaves, []);
  await until(() => rejoinedPackets.length > 0, 1000);
  assert.equal(rejoinedPackets[0].room.members.find(member => member.id === memberId).name, "Reloaded");
  assert.equal(broadcasts, 2, "The rejoined lobby must not require a later roster broadcast");
});

for (const action of ["accept", "reject"]) test(`a stale ${action} cannot mutate a rotated reconnect session`, async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const code = action === "accept" ? "WXY234" : "XYZ234";
  const host = (await request(f, code, "create", null)).body.secret;
  const first = (await request(f, code, "join", null, { token: token(action), profile: { name: "First" } })).body;
  let reached, release, paused = false;
  const reachedRead = new Promise(resolve => { reached = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  f.DB.afterRead = async sql => { if (!paused && sql === "SELECT * FROM seats WHERE room_id = ? AND connection_id = ? AND status = 'pending'") { paused = true; reached(); await barrier; } };
  const stale = request(f, code, action, host, { connectionId: first.connectionId, memberId: "p1", error: { code: "join-rejected", message: "Old join" } });
  await reachedRead;
  const current = (await request(f, code, "join", null, { token: token(action), profile: { name: "Current" } })).body;
  release();
  assert.equal((await stale).status, 409);
  assert.equal(f.DB.sqlite.prepare("SELECT status FROM seats").get().status, "pending");
  assert.equal(f.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM messages WHERE recipient = ?").get(first.connectionId).n, 0);
  assert.equal((await request(f, code, "accept", host, { connectionId: current.connectionId, memberId: "p1" })).status, 200);
  assert.equal((await request(f, code, "poll", current.secret)).body.messages[0].type, "accepted");
});

for (const action of ["accept", "reject"]) test(`${action} rolls back when its notification INSERT fails and delivers on retry`, async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const code = action === "accept" ? "RST234" : "STU234";
  const host = (await request(f, code, "create", null)).body.secret;
  const guest = (await request(f, code, "join", null, { token: token(`atomic-${action}`), profile: { name: "Atomic" } })).body;
  let failed = false;
  f.DB.beforeRun = async sql => { if (!failed && sql.startsWith("INSERT INTO messages")) { failed = true; throw new Error("Injected transient notification write failure"); } };
  const packet = { connectionId: guest.connectionId, memberId: "p1", error: { code: "join-rejected", message: "Admission declined" } };
  assert.equal((await request(f, code, action, host, packet)).status, 500);
  assert.equal(failed, true);
  const seat = f.DB.sqlite.prepare("SELECT status, member_id FROM seats").get();
  assert.equal(seat.status, "pending"); assert.equal(seat.member_id, null);
  assert.equal(f.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM messages WHERE recipient = ?").get(guest.connectionId).n, 0);
  assert.equal((await request(f, code, action, host, packet)).status, 200);
  const inbox = (await request(f, code, "poll", guest.secret)).body.messages;
  assert.equal(inbox.length, 1); assert.equal(inbox[0].type, action === "accept" ? "accepted" : "rejected");
});

test("a guest whose heartbeat expired gets an explicit reconnect response on resuming poll", async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const host = (await request(f, "FGH234", "create", null)).body.secret;
  const guest = (await request(f, "FGH234", "join", null, { token: token("expired"), profile: { name: "Expired" } })).body;
  await request(f, "FGH234", "accept", host, { connectionId: guest.connectionId, memberId: "p1" });
  f.DB.sqlite.prepare("UPDATE seats SET seen_at = ?").run(Date.now() - 90001);
  await request(f, "FGH234", "poll", host);
  const resumed = await request(f, "FGH234", "poll", guest.secret);
  assert.equal(resumed.status, 410); assert.equal(resumed.body.error.code, "seat-disconnected");
  const rejoined = (await request(f, "FGH234", "join", null, { token: token("expired"), profile: { name: "Back" } })).body;
  assert.equal((await request(f, "FGH234", "accept", host, { connectionId: rejoined.connectionId, memberId: "p1" })).status, 200);
});

for (const mode of ["503", "429", "network", "committed"]) test(`a transient ${mode} send failure retries while polling stays alive and delivers once`, async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const { RelayRoomNetwork } = require("../relay-network.js");
  const delivered = [], states = [], attempts = [], nativeFetch = global.fetch;
  let faulted = false, hostPolls = 0;
  global.fetch = async (url, options) => {
    if (String(url).startsWith(f.url) && String(url).endsWith("/poll") && options.headers.Authorization === `Bearer ${host.secret}`) hostPolls++;
    if (String(url).startsWith(f.url) && String(url).endsWith("/send") && JSON.parse(options.body).message?.testFault === mode) {
      attempts.push(JSON.parse(options.body));
      if (!faulted) {
        faulted = true;
        if (mode === "503" || mode === "429") return new Response(JSON.stringify({ error: { code: "service-error", message: "Try again" } }), { status: Number(mode), headers: { "Content-Type": "application/json" } });
        if (mode === "committed") { const response = await nativeFetch(url, options); await response.arrayBuffer(); }
        throw new TypeError("A deterministic network fault");
      }
    }
    return nativeFetch(url, options);
  };
  t.after(() => { global.fetch = nativeFetch; });
  let host;
  host = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 25, origin, onJoin: id => host.accept(id, "p1"), onMessage: message => delivered.push(message), onStatus: state => states.push(state) });
  const guest = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 25, origin, onMessage: message => delivered.push(message) });
  t.after(() => host.close()); t.after(() => guest.close());
  const code = mode === "503" ? "BCD234" : mode === "network" ? "CDE234" : "EFG234";
  await host.create(code); await guest.join(code, { token: token(mode), profile: { name: mode } });
  const pollsBefore = hostPolls;
  const sender = mode === "503" ? host : guest;
  const message = { type: mode === "503" ? "snapshot" : "chat", testFault: mode, text: "exactly once" };
  assert.equal(mode === "503" ? host.sendTo("p1", message) : guest.send(message), true);
  await until(() => faulted);
  await pause(70);
  assert.equal(sender._closed, false);
  assert.equal(host.members.size, 1);
  assert.ok(hostPolls > pollsBefore, "Host lease polling must continue during send retry backoff");
  await until(() => attempts.length === 2 && delivered.length > 0);
  await sender._chain; await pause(100);
  assert.deepEqual(delivered, [message]);
  assert.equal(attempts.length, 2);
  assert.match(attempts[0].message.__lanternRelayPacketId, /^[a-f0-9]{32}$/);
  assert.equal(attempts[0].message.__lanternRelayPacketId, attempts[1].message.__lanternRelayPacketId);
  assert.ok(!states.includes("error"));
  assert.equal(host.status, "open");
});

test("receive dedupe is scoped to the authenticated sender and strips packet IDs", async t => {
  const f = await startRelayFixture(); t.after(() => f.close());
  const { RelayRoomNetwork } = require("../relay-network.js");
  const delivered = [];
  let host;
  host = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 25, origin, onJoin: (id, hello) => host.accept(id, `p${hello.profile.n}`), onMessage: (message, actor) => delivered.push({ message, actor }) });
  t.after(() => host.close()); await host.create("HJK234");
  const guests = [];
  for (const n of [1, 2]) {
    const guest = new RelayRoomNetwork({ relayUrl: f.url, pollMs: 25, origin }); guests.push(guest); t.after(() => guest.close());
    await guest.join("HJK234", { token: token(`dedupe${n}`), profile: { n } });
  }
  const message = { type: "chat", text: "same transport id", __lanternRelayPacketId: "a".repeat(32), actor: "p9" };
  for (const guest of guests) for (let copy = 0; copy < 2; copy++) assert.equal((await request(f, "HJK234", "send", guest.secret, { message })).status, 200);
  const last = f.DB.sqlite.prepare("SELECT MAX(id) AS id FROM messages WHERE recipient = 'host'").get().id;
  await until(() => host.cursor >= last);
  assert.deepEqual(delivered, [1, 2].map(n => ({ message: { type: "chat", text: "same transport id" }, actor: `p${n}` })));
});
