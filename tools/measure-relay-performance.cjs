/* Reproducible transport benchmark. Optional baseline sources must come from the same checkout. */
"use strict";
const path = require("node:path"), { performance } = require("node:perf_hooks");
const { activeRoom } = require("../tests/performance-fixture.cjs");
const { startRelayFixture } = require("../tests/relay-fixture.cjs");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const rttMs = Number(process.env.LANTERN_BENCH_RTT_MS || 150);
async function payloads(count, source) {
  const r = activeRoom(count, source); await r.flush();
  const initial = r.packets.reduce((sum, p) => sum + Buffer.byteLength(JSON.stringify(p.message)), 0) / (count - 1);
  r.packets.length = 0;
  for (let n = 0; n < 40; n++) await r.tick();
  return { initialSnapshotBytes: Math.round(initial), packetsPerSecond: r.packets.length / 10,
    fullSnapshotsPerSecond: r.packets.filter(p => p.message.type === "snapshot").length / 10,
    hostBytesPerSecond: Math.round(r.packets.reduce((sum, p) => sum + Buffer.byteLength(JSON.stringify(p.message)), 0) / 10) };
}
async function queue(count, source) {
  const { RelayRoomNetwork } = require(source || "../relay-network.js");
  const fixture = await startRelayFixture(), origin = "https://corexsol.github.io";
  const host = new RelayRoomNetwork({ relayUrl: fixture.url, origin, pollMs: 25 });
  const guests = [], received = [], nativeRequest = host._request.bind(host);
  host.onJoin = (id, hello) => host.accept(id, `p${hello.profile.n}`);
  try {
    await host.create("ABC234");
    for (let n = 1; n < count; n++) {
      const guest = new RelayRoomNetwork({ relayUrl: fixture.url, origin, pollMs: 25, onMessage: m => { if (m.type === "command-result") received.push(performance.now()); } });
      guests.push(guest); await guest.join("ABC234", { token: `benchmark-player-${n}`, profile: { n } });
    }
    await host._chain;
    // Introduce the same controlled WAN RTT into each real HTTP write. Polls
    // still exercise the actual worker, mailbox and authentication paths.
    host._request = async (action, ...args) => { if (action === "send") await delay(rttMs); return nativeRequest(action, ...args); };
    const started = performance.now();
    host.broadcast(id => ({ type: "snapshot", privateFor: id, seq: 1 }));
    host.sendTo(`p${count - 1}`, { type: "command-result", ok: true });
    await host._chain;
    const drained = performance.now();
    while (!received.length && performance.now() - started < 10000) await delay(10);
    return { writeRoundTripMs: rttMs, writeDrainMs: Math.round(drained - started), lastSeatAcknowledgementMs: Math.round((received[0] || drained) - started) };
  } finally { await Promise.all(guests.map(guest => guest.close())); await host.close(); await fixture.close(); }
}
(async () => {
  const versions = [{ name: "current" }];
  if (process.env.LANTERN_BENCH_BASELINE_ONLINE && process.env.LANTERN_BENCH_BASELINE_RELAY)
    versions.unshift({ name: "baseline", online: path.resolve(process.env.LANTERN_BENCH_BASELINE_ONLINE), relay: path.resolve(process.env.LANTERN_BENCH_BASELINE_RELAY) });
  const result = [];
  for (const version of versions) for (const seats of [4, 12]) result.push({ version: version.name, seats, ...await payloads(seats, version.online), ...await queue(seats, version.relay) });
  console.log(JSON.stringify({ note: "10s idle night; actual localhost HTTP worker plus fixed WAN write RTT; excludes TLS/mobile rendering.", results: result }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
