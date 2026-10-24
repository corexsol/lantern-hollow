"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { startRelayFixture } = require("./relay-fixture.cjs");
const { generateRoomCode } = require("../network.js");

test("four real browsers exchange private HTTPS relay mailboxes and rejoin a seat", { timeout: 60000 }, async () => {
  const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + "/playwright" : "playwright");
  const fixture = process.env.LANTERN_RELAY_URL ? null : await startRelayFixture();
  const relayUrl = process.env.LANTERN_RELAY_URL || fixture.url;
  const staticServer = http.createServer((request, response) => {
    response.setHeader("Content-Type", request.url === "/relay-network.js" ? "text/javascript" : "text/html");
    response.end(request.url === "/relay-network.js" ? fs.readFileSync(path.resolve(__dirname, "../relay-network.js")) : '<!doctype html><title>Relay browser verification</title><script src="/relay-network.js"></script>');
  });
  await new Promise(resolve => staticServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${staticServer.address().port}`;
  let browser;
  try {
    // The QA container routes public HTTPS through its own proxy CA. This
    // affects only these disposable test contexts, never game visitors.
    const proxyURL=process.env.LANTERN_TEST_PROXY ? new URL(process.env.HTTPS_PROXY||process.env.HTTP_PROXY) : null;
    const proxy=proxyURL?{server:proxyURL.origin,bypass:'localhost,127.0.0.1',...(proxyURL.username?{username:decodeURIComponent(proxyURL.username),password:decodeURIComponent(proxyURL.password)}:{})}:undefined;
    browser = await chromium.launch({ headless: true, executablePath: process.env.LANTERN_CHROMIUM_EXECUTABLE_PATH || undefined, args: ["--no-sandbox"],proxy });
    const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ignoreHTTPSErrors:!!proxy})));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const pageErrors = [];
    pages.forEach((page, index) => page.on("pageerror", error => pageErrors.push(`browser ${index}: ${error.message}`)));
    await Promise.all(pages.map(page => page.goto(url)));
    await Promise.all(pages.map(page => page.evaluate(relayUrl => { window.options = { relayUrl, pollMs: 100, timeoutMs: 20000 }; window.packets = []; window.commands = []; window.leaves = []; }, relayUrl)));
    const code = generateRoomCode();
    await pages[0].evaluate(async code => {
      window.relay = new LanternRelayNetwork.RelayRoomNetwork({ ...options,
        onJoin: (id, hello) => relay.accept(id, `p${hello.profile.n}`),
        onMessage: (message, memberId) => commands.push({ message, memberId }),
        onLeave: id => leaves.push(id),
      });
      await relay.create(code);
    }, code);
    await Promise.all(pages.slice(1).map((page, i) => page.evaluate(async ({ code, n }) => {
      window.token = `browser-secure-token-${n}-abcdefghijklmnopqrstuvwxyz`;
      window.relay = new LanternRelayNetwork.RelayRoomNetwork({ ...options, onMessage: message => packets.push(message) });
      return relay.join(code, { token, profile: { n } });
    }, { code, n: i + 1 })));
    assert.equal(await pages[0].evaluate(() => relay.broadcast(memberId => ({ type: "snapshot", privateFor: memberId }))), 3);
    await pages[1].evaluate(() => relay.send({ type: "chat", text: "hello", actor: "p3", memberId: "p3" }));
    await Promise.all(pages.slice(1).map(page => page.waitForFunction(() => packets.length === 1)));
    await pages[0].waitForFunction(() => commands.length === 1);
    for (let i = 1; i < 4; i++) assert.deepEqual(await pages[i].evaluate(() => packets), [{ type: "snapshot", privateFor: `p${i}` }]);
    assert.deepEqual(await pages[0].evaluate(() => commands), [{ message: { type: "chat", text: "hello" }, memberId: "p1" }]);
    await pages[1].evaluate(() => relay.close());
    await pages[0].waitForFunction(() => leaves.includes("p1"));
    assert.equal(await pages[1].evaluate(async code => {
      window.relay = new LanternRelayNetwork.RelayRoomNetwork(options);
      return relay.join(code, { token, profile: { n: 1 } });
    }, code), "p1");
    await pages[0].evaluate(() => relay.close());
    await Promise.all(pages.slice(1).map(page => page.waitForFunction(() => relay.status === "disconnected")));
    assert.deepEqual(pageErrors, []);
    console.log(`Verified four independent Chromium clients against ${relayUrl}`);
  } finally {
    await browser?.close();
    await new Promise(resolve => staticServer.close(resolve));
    await fixture?.close();
  }
});
