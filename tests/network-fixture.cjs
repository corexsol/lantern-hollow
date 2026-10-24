"use strict";
// Test-only real networking infrastructure. There is no simulated data transport.
const { spawn } = require("node:child_process");
const dgram = require("node:dgram");
const NETWORK_BROWSER_ARGS = [
  "--no-sandbox",
  "--allow-loopback-in-peer-connection",
  "--disable-features=WebRtcHideLocalIpsWithMdns",
];
function peerServerModule() {
  for (const candidate of [
    process.env.LANTERN_PEER_SERVER_MODULE,
    "peer",
    "/tmp/lantern-peer-test/node_modules/peer",
  ].filter(Boolean)) {
    try {
      return require.resolve(candidate);
    } catch (_) {}
  }
  throw new Error(
    "Install peer@1.0.2 for real networking tests, or set LANTERN_PEER_SERVER_MODULE to its module path.",
  );
}
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
  });
}
async function startNetworkFixture() {
  let child,
    stunServer,
    closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (stunServer) {
      try {
        stunServer.close();
      } catch (_) {}
    }
    await stopChild(child);
  };
  try {
    // The official PeerServer retains housekeeping timers after server.close().
    // A child process gives the fixture an explicit, complete teardown boundary.
    child = spawn(
      process.execPath,
      [
        "-e",
        `
      const {PeerServer}=require(process.env.LANTERN_FIXTURE_PEER_SERVER_MODULE);
      PeerServer({port:0,host:'127.0.0.1',path:'/'},server=>process.send(server.address().port));
    `,
      ],
      {
        stdio: ["ignore", "ignore", "pipe", "ipc"],
        env: {
          ...process.env,
          LANTERN_FIXTURE_PEER_SERVER_MODULE: peerServerModule(),
        },
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4096);
    });
    const signalPort = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error("Local PeerServer startup timed out. " + stderr)),
        5000,
      );
      child.once("message", (port) => {
        clearTimeout(timer);
        resolve(port);
      });
      child.once("error", (failure) => {
        clearTimeout(timer);
        reject(failure);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(
          new Error(
            "Local PeerServer exited before starting: " + code + " " + stderr,
          ),
        );
      });
    });
    // Real RFC 5389 STUN Binding responses, including XOR-MAPPED-ADDRESS.
    // This supplies localhost srflx candidates even in containers that prohibit
    // interface enumeration. No game data passes through this STUN service.
    stunServer = dgram.createSocket("udp4");
    stunServer.on("message", (request, remote) => {
      if (
        request.length < 20 ||
        request.readUInt16BE(0) !== 1 ||
        request.readUInt32BE(4) !== 0x2112a442
      )
        return;
      const response = Buffer.alloc(32);
      response.writeUInt16BE(0x0101, 0);
      response.writeUInt16BE(12, 2);
      response.writeUInt32BE(0x2112a442, 4);
      request.copy(response, 8, 8, 20);
      response.writeUInt16BE(0x0020, 20);
      response.writeUInt16BE(8, 22);
      response[25] = 1;
      response.writeUInt16BE(remote.port ^ 0x2112, 26);
      remote.address
        .split(".")
        .forEach(
          (octet, i) => (response[28 + i] = Number(octet) ^ response[4 + i]),
        );
      stunServer.send(response, remote.port, remote.address);
    });
    await new Promise((resolve, reject) => {
      stunServer.once("error", reject);
      stunServer.bind(0, "127.0.0.1", resolve);
    });
    return {
      peerOptions: {
        host: "127.0.0.1",
        port: signalPort,
        path: "/",
        secure: false,
        config: {
          iceServers: [{ urls: "stun:127.0.0.1:" + stunServer.address().port }],
        },
      },
      close,
    };
  } catch (failure) {
    await close();
    throw failure;
  }
}
module.exports = { startNetworkFixture, NETWORK_BROWSER_ARGS };
