const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const { chromium } = require(
  process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
    ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + "/playwright"
    : "playwright",
);
const {
  startNetworkFixture,
  NETWORK_BROWSER_ARGS,
} = require("./network-fixture.cjs");
const {startRelayFixture}=require("./relay-fixture.cjs");
const useWebRTC=process.env.LANTERN_USE_WEBRTC==="1";
const root = path.resolve(__dirname, "..");
const web = http.createServer((req, res) => {
  let file = path.resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://local").pathname),
  );
  if (file === root) file += "/index.html";
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    let body = fs.readFileSync(file);
    if (file.endsWith("/game.js"))
      body = body
        .toString()
        .replace(
          "const engine = new GameEngine();",
          "const engine = new GameEngine();window.testEngine=engine;",
        );
    res.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : file.endsWith(".webp") ? "image/webp" : file.endsWith(".woff2") ? "font/woff2" : "text/html; charset=utf-8",
    );
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
let fixture, browser;
const waitPhase = (page, phase) =>
  page.waitForFunction((p) => window.testEngine?.state?.phase === p, phase, {
    timeout: 30000,
  });
(async () => {
  try {
    await new Promise((r) => web.listen(0, "127.0.0.1", r));
    fixture = useWebRTC ? await startNetworkFixture() : process.env.LANTERN_RELAY_URL ? {url:process.env.LANTERN_RELAY_URL,close:async()=>{}} : await startRelayFixture();
    const proxyURL=process.env.LANTERN_TEST_PROXY ? new URL(process.env.HTTPS_PROXY||process.env.HTTP_PROXY) : null;
    const proxy=proxyURL?{server:proxyURL.origin,bypass:'localhost,127.0.0.1',...(proxyURL.username?{username:decodeURIComponent(proxyURL.username),password:decodeURIComponent(proxyURL.password)}:{})}:undefined;
    browser = await chromium.launch({
      proxy,
      headless: true,
      executablePath:
        process.env.LANTERN_CHROMIUM_EXECUTABLE_PATH ||
        chromium.executablePath(),
      args: NETWORK_BROWSER_ARGS,
    });
    const errors = [],
      pages = [];
    for (let i = 0; i < 4; i++) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },ignoreHTTPSErrors:!!proxy,
      });
      await context.addInitScript(config=>{window.LANTERN_NETWORK_CONFIG=config;},useWebRTC?{transport:"webrtc",peerOptions:fixture.peerOptions}:{transport:"relay",relayUrl:fixture.url});
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.stack));
      await page.goto("http://127.0.0.1:" + web.address().port);
      await page.locator('[data-act="create-room"]').waitFor();
      await page.evaluate((i) => {
        testEngine.config.name = "Human" + i;
        testEngine.config.color = LanternCore.COLORS[i];
        testEngine.save();
        testEngine.online.home();
      }, i);
      pages.push(page);
    }
    const host = pages[0];
    await host.locator('[data-act="create-room"]').click();
    await host.locator(".room-code").waitFor();
    const code = await host.locator(".room-code").innerText();
    for (const page of pages.slice(1)) {
      await page.locator("#online-code").fill(code);
      await page.locator('[data-act="join-room"]').click();
      await page.locator(".room-code").waitFor();
    }
    await host.waitForFunction(
      () => testEngine.online.room.members.length === 4,
    );
    const lobbyReturn = pages[3];
    const lobbySeat = await lobbyReturn.evaluate(()=>testEngine.online.memberId);
    await lobbyReturn.reload();
    await lobbyReturn.locator('[data-act="join-room"]').click();
    await lobbyReturn.locator('.room-code').waitFor();
    assert.equal(await lobbyReturn.evaluate(()=>testEngine.online.memberId),lobbySeat,'rejoining the lobby must restore the same seat and first projection');
    await host.evaluate(() =>
      testEngine.online.command({
        type: "settings",
        settings: {
          enabled: ["doctor", "impostor"],
          discussion: 60,
          voting: 5,
          night: 60,
        },
      }),
    );
    for (const page of pages.slice(1))
      await page.locator('[data-act="ready"]').click();
    await host
      .locator('[data-act="start-match"]')
      .waitFor({ state: "visible" });
    await host.waitForFunction(
      () => !document.querySelector('[data-act="start-match"]').disabled,
    );
    await host.locator('[data-act="start-match"]').click();
    for (const page of pages) {
      await page.locator('[data-act="revealcontinue"]').waitFor();
      await page.locator('[data-act="revealcontinue"]').click();
    }
    await host.screenshot({path:root+'/tests/v4-lobby.png'});
    for(const page of pages)await waitPhase(page,'night');
    for(const page of pages)assert.equal(await page.evaluate(()=>testEngine.state.players.slice(1).some(p=>p.role)),false);
    const roles = await Promise.all(
        pages.map((p) => p.evaluate(() => testEngine.state.players[0].role)),
      ),
      killer = roles.indexOf("impostor"),
      doctors = roles
        .map((role, i) => (role === "doctor" ? i : -1))
        .filter((i) => i >= 0),
      victim = doctors[0],
      healer = doctors[1];
    const act = async (page, targetName) => {
      await page.evaluate((name) => {
        const e = testEngine;
        e.select(e.state.players.find((p) => p.name === name).id);
      }, targetName);
      await page.locator('[data-act="nightconfirm"]').click();
      await page.waitForFunction(() => testEngine.humanActions.length > 0);
    };
    await act(pages[killer], "Human" + victim);
    await act(pages[healer], "Human" + victim);
    for(const page of pages)await page.locator('[data-act="finish-night"]').click();
    await waitPhase(host,"resolve");
    await pages[victim].waitForFunction(
      () => testEngine.nightSequence?.current?.kind === "save",
    );
    assert.equal(
      await pages[victim].evaluate(
        () => testEngine.nightSequence.current.healer,
      ),
      "anonymous",
    );
    await pages[healer].waitForFunction(()=>testEngine.nightSequence?.current?.kind==='save');
    assert.equal(
      await pages[healer].evaluate(
        () => testEngine.nightSequence.current.healer,
      ),
      "self",
    );
    await pages[victim].waitForFunction(
      () => testEngine.nightSequence.time > 4,
    );
    await pages[victim].screenshot({
      path: root + "/tests/online-anonymous-save.png",
    });
    for (const page of pages) await waitPhase(page, "day");
    await host.screenshot({path:root+"/tests/v4-day.png"});
    assert.equal(
      await pages[victim].evaluate(() => testEngine.state.players[0].alive),
      true,
    );
    const reconnectPage = pages[2],
      seat = await reconnectPage.evaluate(() => testEngine.online.memberId);
    await reconnectPage.reload();
    await reconnectPage.locator('[data-act="join-room"]').waitFor();
    await reconnectPage.locator('[data-act="join-room"]').click();
    await waitPhase(reconnectPage, "day");
    assert.equal(
      await reconnectPage.evaluate(() => testEngine.online.memberId),
      seat,
    );
    assert.equal(
      await host.evaluate(() => testEngine.online.room.members.length),
      4,
    );
    await pages[1].evaluate(()=>testEngine.online.command({type:'advance'}));
    await pages[1].locator('#lh-chat-form input').fill('مرحبا Human2');await pages[1].locator('#lh-chat-form input').press('Enter');
    await host.waitForFunction(()=>document.querySelector('#lh-chatlog').textContent.includes('مرحبا Human2'));
    await host.evaluate(() =>
      testEngine.online.command({ type: "pause", paused: true }),
    );
    await reconnectPage.waitForFunction(() => testEngine.paused);
    await reconnectPage.evaluate(() => LanternLocale.setLanguage("ar"));
    await reconnectPage.evaluate(() => {
      testEngine.ui.refresh();
      LanternLocale.refresh(testEngine.ui.root);
    });
    await reconnectPage.setViewportSize({ width: 390, height: 844 });
    await reconnectPage.waitForTimeout(100);
    await reconnectPage.screenshot({
      path: root + "/tests/arabic-online-phone.png",
    });
    assert.equal(await reconnectPage.getAttribute("html", "dir"), "rtl");
    assert.equal(
      await reconnectPage.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await host.evaluate(() => {
      testEngine.online.command({ type: "pause", paused: false });
      testEngine.online.command({ type: "advance" });
    });
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      await waitPhase(page, "vote");
      if (i === victim) await page.locator('[data-act="skipvote"]').click();
      else {
        await page.evaluate((name) => {
          testEngine.select(
            testEngine.state.players.find((p) => p.name === name).id,
          );
        }, "Human" + victim);
        await page.locator('[data-act="voteconfirm"]').click();
      }
    }
    await host.waitForFunction(() => testEngine.voteOut?.roleVisible);
    assert.equal(
      await host.evaluate(() => testEngine.voteOut.revealedRole),
      "Unknown",
    );
    await host.screenshot({
      path: root + "/tests/online-hidden-role-vote.png",
    });
    const removed = pages[3],
      removedId = await removed.evaluate(() => testEngine.online.memberId);
    await host.evaluate(
      (memberId) => testEngine.online.command({ type: "kick", memberId }),
      removedId,
    );
    await removed.waitForFunction(
      () =>
        testEngine.online.room === null &&
        testEngine.online.status === "You were removed from this room.",
    );
    await host.evaluate(() => testEngine.online.leave());
    for (const page of pages.slice(1, 3))
      await page.waitForFunction(
        () =>
          testEngine.online.room === null &&
          testEngine.online.status === "The host left. This room has ended.",
      );

    assert.deepEqual(errors, []);
    console.log(
      "Four independent humans completed village flow over real transport: ready, private roles, chat, host authority, vote, anonymous save, reconnection, pause, Arabic phone hidden death role, kick notification and explicit host departure passed.",
    );
  } finally {
    if (browser) await browser.close();
    if (fixture) await fixture.close();
    await new Promise((r) => web.close(r));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
