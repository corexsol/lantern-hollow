const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const { chromium } = require(
  process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
    ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + "/playwright"
    : "playwright",
);
const root = path.resolve(__dirname, "..");
const server = http.createServer((req, res) => {
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
      file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
(async () => {
  let browser;
  try {
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.LANTERN_CHROMIUM_EXECUTABLE_PATH ||
        chromium.executablePath(),
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.stack));
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.waitForTimeout(300);
    if (errors.length) console.log(errors);
    assert.equal(await page.locator('.entrance-panel').count(),1,'the game should open on the new village entrance');
    assert.equal(await page.evaluate(()=>testEngine.scene.constructor.name),'LanternSceneRenderer');
    assert.equal(
      await page.locator('[data-act="create-room"]').count(),
      1,
      "must show real multiplayer creation instead of offline bot play",
    );
    assert.equal(await page.locator('[data-act="join-room"]').count(), 1);
    await page.locator('#lh-name').fill('Omar');
    assert.equal(await page.evaluate(()=>testEngine.config.name),'Omar','entrance edits must reach the profile before another control rerenders it');
    await page.reload();
    assert.equal(await page.locator('#lh-name').inputValue(),'Omar','the edited name persists');
    await page.locator('[data-act="language"]').click();
    assert.equal(await page.getAttribute("html", "dir"), "rtl");
    assert.ok((await page.locator("body").innerText()).includes("غرفة"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: root + "/tests/arabic-home.png" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log("Online menu, Arabic switch and phone layout passed.");
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
