"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  RoomNetwork,
  ROOM_PREFIX,
  PROTOCOL,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} = require("../network.js");

// A deterministic evented PeerJS seam. Browser integration uses actual PeerJS/WebRTC.
class FakeConnection extends EventEmitter {
  constructor(peer) {
    super();
    this.peer = peer;
    this.open = false;
    this.sent = [];
  }
  send(packet) {
    if (!this.open) throw new Error("closed");
    const copy = structuredClone(packet);
    this.sent.push(copy);
    queueMicrotask(() => {
      if (this.other?.open) this.other.emit("data", copy);
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.emit("close");
    if (this.other && !this.other.closed) this.other.close();
  }
}
class FakePeer extends EventEmitter {
  static peers = new Map();
  static counter = 0;
  constructor(id, options) {
    super();
    if (typeof id === "object") {
      options = id;
      id = null;
    }
    this.id = id || `client-${++FakePeer.counter}`;
    this.options = options;
    this.connections = [];
    if (FakePeer.peers.has(this.id)) {
      queueMicrotask(() =>
        this.emit(
          "error",
          Object.assign(new Error("ID is taken"), { type: "unavailable-id" }),
        ),
      );
    } else {
      FakePeer.peers.set(this.id, this);
      queueMicrotask(() => {
        if (!this.destroyed) this.emit("open", this.id);
      });
    }
  }
  connect(id, options) {
    this.connectOptions = options;
    const local = new FakeConnection(id);
    this.connections.push(local);
    const remotePeer = FakePeer.peers.get(id);
    queueMicrotask(() => {
      if (!remotePeer) {
        this.emit(
          "error",
          Object.assign(new Error("No such peer"), {
            type: "peer-unavailable",
          }),
        );
        return;
      }
      const remote = new FakeConnection(this.id);
      local.other = remote;
      remote.other = local;
      remotePeer.connections.push(remote);
      remotePeer.emit("connection", remote);
      local.open = remote.open = true;
      remote.emit("open");
      local.emit("open");
    });
    return local;
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (FakePeer.peers.get(this.id) === this) FakePeer.peers.delete(this.id);
    this.connections.forEach((c) => c.close());
    this.emit("close");
  }
  reconnect() {
    this.disconnected = false;
    queueMicrotask(() => this.emit("open", this.id));
  }
}
const turn = () => new Promise((resolve) => setImmediate(resolve));
const networks = [];
function net(options = {}) {
  const n = new RoomNetwork({ ...options, timeoutMs: 80 });
  networks.push(n);
  return n;
}
function acceptingHost(options = {}) {
  let host;
  host = net({
    ...options,
    onJoin: (id, hello) => {
      options.onJoin?.(id, hello);
      host.accept(
        id,
        hello.token === "reconnect-token"
          ? "seat-reconnect"
          : `seat-${hello.profile.name}`,
      );
    },
  });
  return host;
}
test.beforeEach(() => {
  global.Peer = FakePeer;
});
test.afterEach(() => {
  networks.splice(0).forEach((n) => n.close());
  FakePeer.peers.forEach((p) => p.destroy());
  FakePeer.peers.clear();
  delete global.Peer;
  delete global.LANTERN_NETWORK_CONFIG;
});

test("room codes use six unambiguous uppercase characters and the versioned prefix", () => {
  assert.equal(ROOM_PREFIX, "lantern-hollow-v3-");
  assert.equal(normalizeRoomCode(" ab2-cd3 "), "AB2CD3");
  assert.ok(isValidRoomCode("AB2CD3"));
  for (const code of [
    "ABICD3",
    "ABOCD3",
    "AB0CD3",
    "AB1CD3",
    "ab2cd3",
    "ABC",
    "ABCDEFZ",
    "ABC EF",
    null,
  ])
    assert.equal(isValidRoomCode(code), false);
  for (let i = 0; i < 100; i++) assert.ok(isValidRoomCode(generateRoomCode()));
});

test("invalid room and missing library errors reject without inventing a room", async () => {
  const statuses = [];
  const n = net({ onStatus: (s, e) => statuses.push([s, e?.code]) });
  await assert.rejects(n.create("ABC"), { code: "invalid-code" });
  delete global.Peer;
  await assert.rejects(n.create("AB2CD3"), { code: "peerjs-unavailable" });
  assert.equal(statuses.at(-1)[0], "error");
  assert.equal(n.peer, null);
});

test("host claims its deterministic room ID and client resolves only after seat acceptance", async () => {
  const received = [];
  let helloSeen;
  global.LANTERN_NETWORK_CONFIG = {
    peerOptions: {
      host: "localhost",
      port: 9000,
      secure: false,
      config: { iceServers: [] },
    },
  };
  const host = acceptingHost({
    onJoin: (id, hello) => {
      helloSeen = hello;
    },
  });
  assert.equal(await host.create("AB2CD3"), "AB2CD3");
  assert.equal(host.peer.id, ROOM_PREFIX + "AB2CD3");
  assert.equal(host.peer.options.host, "localhost");
  const client = net({
    onMessage: (m) => received.push(m),
    peerOptions: { port: 9001 },
  });
  assert.equal(
    await client.join("AB2CD3", {
      token: "secret-A",
      profile: { name: "A" },
      actor: "host",
    }),
    "seat-A",
  );
  assert.equal(client.status, "open");
  assert.equal(client.memberId, "seat-A");
  assert.deepEqual(helloSeen, { token: "secret-A", profile: { name: "A" } });
  assert.equal(client.peer.options.port, 9001);
  assert.equal(client.peer.connectOptions.serialization, "json");
  assert.equal(client.peer.connectOptions.reliable, true);
  assert.equal(
    JSON.stringify(client.peer.connectOptions).includes("secret-A"),
    false,
  );
  host.sendTo("seat-A", { type: "snapshot", private: "only A" });
  await turn();
  assert.deepEqual(received, [{ type: "snapshot", private: "only A" }]);
});

test("authority receives the bound seat and no client supplied actor identity", async () => {
  const actions = [];
  const host = acceptingHost({ onMessage: (m, id) => actions.push([m, id]) });
  await host.create("AB2CD3");
  const client = net();
  await client.join("AB2CD3", { token: "secret-A", profile: { name: "A" } });
  client.send({
    type: "vote",
    target: 2,
    actor: "host",
    actorId: "host",
    memberId: "host",
    playerId: 0,
    sender: "host",
    senderId: "host",
  });
  await turn();
  assert.deepEqual(actions, [[{ type: "vote", target: 2 }, "seat-A"]]);
});

test("unaccepted connections cannot send commands and admission rejection reaches the client", async () => {
  const actions = [];
  const host = net({
    onMessage: (m, id) => actions.push([m, id]),
    onJoin: () => {
      throw Object.assign(new Error("Room is full."), { code: "room-full" });
    },
  });
  await host.create("AB2CD3");
  const client = net();
  await assert.rejects(
    client.join("AB2CD3", { token: "A", profile: { name: "A" } }),
    { code: "room-full" },
  );
  assert.equal(actions.length, 0);
  assert.equal(host.status, "open");
  const raw = new FakePeer();
  await turn();
  const conn = raw.connect(ROOM_PREFIX + "AB2CD3", {});
  await turn();
  const closed = new Promise((resolve) => conn.once("close", resolve));
  conn.send({
    protocol: PROTOCOL,
    type: "message",
    message: { type: "start", actor: "host" },
  });
  await closed;
  assert.equal(actions.length, 0);
  assert.equal(conn.open, false);
  assert.equal(host.status, "open");
});

test("broadcast projects one private payload per authenticated member", async () => {
  const a = [],
    b = [];
  const host = acceptingHost();
  await host.create("AB2CD3");
  const alice = net({ onMessage: (m) => a.push(m) }),
    bob = net({ onMessage: (m) => b.push(m) });
  await alice.join("AB2CD3", { token: "A", profile: { name: "A" } });
  await bob.join("AB2CD3", { token: "B", profile: { name: "B" } });
  assert.equal(
    host.broadcast((id) => ({ type: "snapshot", secret: id })),
    2,
  );
  await turn();
  assert.deepEqual(a, [{ type: "snapshot", secret: "seat-A" }]);
  assert.deepEqual(b, [{ type: "snapshot", secret: "seat-B" }]);
  assert.equal(host.sendTo("not-authenticated", {}), false);
});

test("disconnect reports once and token rejoin reuses the authenticated seat", async () => {
  const left = [];
  const host = acceptingHost({ onLeave: (id) => left.push(id) });
  await host.create("AB2CD3");
  const first = net();
  await first.join("AB2CD3", {
    token: "reconnect-token",
    profile: { name: "A" },
  });
  first.close();
  await turn();
  assert.deepEqual(left, ["seat-reconnect"]);
  const second = net();
  assert.equal(
    await second.join("AB2CD3", {
      token: "reconnect-token",
      profile: { name: "A" },
    }),
    "seat-reconnect",
  );
  const third = net();
  await third.join("AB2CD3", {
    token: "reconnect-token",
    profile: { name: "A" },
  });
  await turn();
  assert.deepEqual(left, ["seat-reconnect"]);
  assert.equal(second.status, "disconnected");
  third.close();
  await turn();
  assert.deepEqual(left, ["seat-reconnect", "seat-reconnect"]);
});

test("room collision is explicit and does not destroy the original room", async () => {
  const first = acceptingHost();
  await first.create("AB2CD3");
  const second = net();
  await assert.rejects(second.create("AB2CD3"), { code: "room-exists" });
  assert.equal(first.status, "open");
  assert.equal(FakePeer.peers.get(ROOM_PREFIX + "AB2CD3"), first.peer);
});

test("missing host, handshake timeout, and host departure are visible", async () => {
  const missing = net();
  await assert.rejects(
    missing.join("AB2CD3", { token: "A", profile: { name: "A" } }),
    { code: "room-not-found" },
  );
  const host = net({ onJoin: () => {} });
  await host.create("AB2CD3");
  const waiting = net();
  await assert.rejects(
    waiting.join("AB2CD3", { token: "A", profile: { name: "A" } }),
    { code: "connection-timeout" },
  );
  host.close();
  const readyHost = acceptingHost();
  await readyHost.create("AB2CD3");
  const statuses = [];
  const client = net({ onStatus: (s, e) => statuses.push([s, e?.code]) });
  await client.join("AB2CD3", { token: "A", profile: { name: "A" } });
  readyHost.close();
  await turn();
  assert.equal(client.status, "disconnected");
  assert.equal(statuses.at(-1)[1], "host-disconnected");
});

test("closing pending connect rejects it and allows another create or join", async () => {
  const host = net({ onJoin: () => {} });
  await host.create("AB2CD3");
  const client = net();
  const joining = client.join("AB2CD3", { token: "A", profile: { name: "A" } });
  await turn();
  client.close();
  await assert.rejects(joining, { code: "connection-closed" });
  assert.equal(await client.create("BC3DE4"), "BC3DE4");
});

// Opt-in: official local PeerServer + the actual vendored PeerJS data channels.
// See NETWORK.md for installing the test-only server dependency and invoking it.
test(
  "real WebRTC connects independent browsers, keeps projections private, and rejoins a seat",
  {
    skip: !process.env.LANTERN_REAL_NETWORK_TEST,
    timeout: 60000,
  },
  async () => {
    const http = require("node:http");
    const fs = require("node:fs");
    const path = require("node:path");
    const {
      startNetworkFixture,
      NETWORK_BROWSER_ARGS,
    } = require("./network-fixture.cjs");
    const { chromium } = require(
      process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
        ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + "/playwright"
        : "playwright",
    );
    const rootDir = path.resolve(__dirname, "..");
    const fixture = await startNetworkFixture();
    const staticServer = http.createServer((req, res) => {
      const filename =
        req.url === "/vendor/peerjs.min.js"
          ? "vendor/peerjs.min.js"
          : req.url === "/network.js"
            ? "network.js"
            : null;
      res.setHeader("Content-Type", filename ? "text/javascript" : "text/html");
      res.end(
        filename
          ? fs.readFileSync(path.join(rootDir, filename))
          : '<!doctype html><title>Real WebRTC transport test</title><script src="/vendor/peerjs.min.js"></script><script src="/network.js"></script>',
      );
    });
    await new Promise((resolve) =>
      staticServer.listen(0, "127.0.0.1", resolve),
    );
    const url = "http://127.0.0.1:" + staticServer.address().port;
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.LANTERN_CHROMIUM_EXECUTABLE_PATH || undefined,
        args: NETWORK_BROWSER_ARGS,
      });
      const contexts = await Promise.all(
        Array.from({ length: 5 }, () => browser.newContext()),
      );
      const pages = await Promise.all(contexts.map((c) => c.newPage()));
      if (process.env.LANTERN_NETWORK_DEBUG)
        pages.forEach((p, i) =>
          p.on("console", (m) =>
            process.stderr.write("browser " + i + ": " + m.text() + "\n"),
          ),
        );
      await Promise.all(pages.map((p) => p.goto(url)));
      const options = {
        ...fixture.peerOptions,
        debug: process.env.LANTERN_NETWORK_DEBUG ? 3 : 0,
      };
      await Promise.all(
        pages.map((p) =>
          p.evaluate((options) => {
            window.LANTERN_NETWORK_CONFIG = { peerOptions: options };
            window.packets = [];
            window.statuses = [];
            window.actions = [];
            window.leaves = [];
          }, options),
        ),
      );
      const host = pages[0];
      await host.evaluate(async () => {
        window.seats = new Map();
        window.network = new LanternNetwork.RoomNetwork({
          onStatus: (s, e) => statuses.push([s, e?.code]),
          onMessage: (m, id) => actions.push({ message: m, memberId: id }),
          onLeave: (id) => leaves.push(id),
          onJoin: (connectionId, hello) => {
            if (hello.token === "reject-me")
              throw Object.assign(new Error("Room is full."), {
                code: "room-full",
              });
            const memberId =
              seats.get(hello.token) || "seat-" + (seats.size + 1);
            seats.set(hello.token, memberId);
            network.accept(connectionId, memberId);
            network.sendTo(memberId, { type: "snapshot", secret: memberId });
          },
        });
        return network.create("AB2CD3");
      });
      const guests = pages.slice(1, 4);
      const memberIds = await Promise.all(
        guests.map((page, i) =>
          page.evaluate(async (i) => {
            window.network = new LanternNetwork.RoomNetwork({
              onMessage: (m) => packets.push(m),
              onStatus: (s, e) => statuses.push([s, e?.code]),
            });
            return network.join("AB2CD3", {
              token: "real-secret-token-" + i,
              profile: { name: "Human " + i },
            });
          }, i),
        ),
      );
      for (let i = 0; i < guests.length; i++) {
        await guests[i].waitForFunction(() => packets.length === 1);
        assert.deepEqual(await guests[i].evaluate(() => packets), [
          { type: "snapshot", secret: memberIds[i] },
        ]);
        assert.equal(
          await guests[i].evaluate(
            () => network._hostConnection.connection.dataChannel.readyState,
          ),
          "open",
        );
      }
      await guests[0].evaluate(() =>
        network.send({
          type: "vote",
          target: 2,
          actor: "host",
          memberId: "host",
        }),
      );
      await host.waitForFunction(() => actions.length === 1);
      assert.deepEqual(await host.evaluate(() => actions), [
        { message: { type: "vote", target: 2 }, memberId: memberIds[0] },
      ]);
      const extra = pages[4];
      const collision = await extra.evaluate(async () => {
        window.network = new LanternNetwork.RoomNetwork();
        try {
          await network.create("AB2CD3");
          return "unexpected-success";
        } catch (e) {
          return e.code;
        }
      });
      assert.equal(collision, "room-exists");
      const rejection = await extra.evaluate(async () => {
        window.network = new LanternNetwork.RoomNetwork();
        try {
          await network.join("AB2CD3", {
            token: "reject-me",
            profile: { name: "Rejected" },
          });
          return "unexpected-success";
        } catch (e) {
          return e.code;
        }
      });
      assert.equal(rejection, "room-full");
      await guests[0].evaluate(() => network.close());
      await host.waitForFunction(() => leaves.length === 1);
      const rejoined = await guests[0].evaluate(() =>
        network.join("AB2CD3", {
          token: "real-secret-token-0",
          profile: { name: "Human 0" },
        }),
      );
      assert.equal(rejoined, memberIds[0]);
      await host.evaluate(() => network.close());
      await Promise.all(
        guests.map((page) =>
          page.waitForFunction(() => network.status === "disconnected"),
        ),
      );
      assert.equal(
        await guests[0].evaluate(() => statuses.at(-1)[1]),
        "host-disconnected",
      );
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => staticServer.close(resolve));
      await fixture.close();
    }
  },
);

test("asynchronous admission errors reject without binding a seat", async () => {
  const host = net({
    onJoin: async () => {
      await turn();
      throw Object.assign(new Error("Match in progress."), {
        code: "match-started",
      });
    },
  });
  await host.create("AB2CD3");
  const client = net();
  await assert.rejects(
    client.join("AB2CD3", { token: "A", profile: { name: "A" } }),
    { code: "match-started" },
  );
  assert.equal(host.members.size, 0);
});

test("signaling reconnect preserves established encrypted data connections", async () => {
  const statuses = [],
    messages = [];
  const host = acceptingHost({
    onStatus: (s, e) => statuses.push([s, e?.code]),
    onMessage: (m, id) => messages.push([m, id]),
  });
  await host.create("AB2CD3");
  const client = net();
  await client.join("AB2CD3", { token: "A", profile: { name: "A" } });
  const reopened = new Promise((resolve) => host.peer.once("open", resolve));
  host.peer.disconnected = true;
  host.peer.emit("disconnected");
  assert.deepEqual(statuses.at(-1), ["connecting", "signaling-reconnecting"]);
  assert.equal(client.send({ type: "chat", text: "still connected" }), true);
  await turn();
  assert.deepEqual(messages, [
    [{ type: "chat", text: "still connected" }, "seat-A"],
  ]);
  await reopened;
  assert.equal(host.status, "open");
  assert.equal(host.members.size, 1);
});

test("oversized commands are refused and malformed authenticated traffic loses only its own seat", async () => {
  const left = [],
    actions = [];
  const host = acceptingHost({
    onLeave: (id) => left.push(id),
    onMessage: (m) => actions.push(m),
  });
  await host.create("AB2CD3");
  const alice = net(),
    bob = net();
  await alice.join("AB2CD3", { token: "A", profile: { name: "A" } });
  await bob.join("AB2CD3", { token: "B", profile: { name: "B" } });
  assert.equal(alice.send({ type: "chat", text: "x".repeat(17000) }), false);
  alice._hostConnection.connection.send({
    protocol: PROTOCOL,
    type: "message",
    message: ["not", "a", "command"],
  });
  await turn();
  assert.deepEqual(left, ["seat-A"]);
  assert.deepEqual(actions, []);
  assert.equal(host.status, "open");
  assert.equal(bob.status, "open");
});

test("explicit string rejection preserves the visible room admission reason", async () => {
  let host;
  host = net({
    onJoin: (id) => host.reject(id, "A match is already in progress."),
  });
  await host.create("AB2CD3");
  const client = net();
  await assert.rejects(
    client.join("AB2CD3", { token: "A", profile: { name: "A" } }),
    { code: "join-rejected", message: "A match is already in progress." },
  );
});
