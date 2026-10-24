const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { RoleSystem } = require("../game.js");
const localePath = path.join(__dirname, "../locale.js");
const locale = fs.existsSync(localePath) ? require(localePath) : {};

test("Arabic translates every role, ability, description and objective", () => {
  assert.equal(typeof locale.setLanguage, "function");
  locale.setLanguage("ar");
  for (const role of Object.values(RoleSystem.roles)) {
    for (const text of [
      role.name,
      role.verb,
      role.description,
      role.objective,
    ]) {
      assert.match(locale.t(text), /[\u0600-\u06ff]/, text);
      assert.notEqual(locale.t(text), text);
    }
  }
});

test("Arabic translates cinematic captions and online controls", () => {
  assert.equal(typeof locale.t, "function");
  locale.setLanguage("ar");
  for (const text of [
    "HOLD ON…",
    "REVIVING…",
    "SAVED!",
    "VEST HELD!",
    "PROTECTED!",
    "YOU WERE KILLED",
    "ATTACK LANDED",
    "ACTION BLOCKED",
    "PROTECTION SET",
    "RESTING…",
    "ACTION COMPLETE",
    "CREATE ROOM",
    "JOIN ROOM",
    "ROOM CODE",
    "COPY CODE",
    "COPY LINK",
    "READY",
    "NOT READY",
    "START MATCH",
    "WAITING FOR HOST",
    "ROOM FULL",
    "ROOM NOT FOUND",
    "CONNECTION LOST",
    "RECONNECTING",
    "LEAVE ROOM",
    "HOST",
    "CONNECTED",
    "DISCONNECTED",
    "CUSTOM GAME",
    "IMPOSTORS",
    "RANDOM",
    "NEUTRALS",
    "ENABLED ROLES",
    "DAY TIMER",
    "VOTE TIMER",
    "NIGHT TIMER",
    "MINIMUM 4 PLAYERS",
    "EVERYONE MUST BE READY",
    "ONLY THE HOST CAN DO THAT",
    "HOST LEFT",
    "REMATCH",
    "RESUME",
    "ONLINE WITH FRIENDS",
    "seconds",
    "Enter a valid six-character room code.",
    "My latest clue: ",
  ])
    assert.match(locale.t(text), /[\u0600-\u06ff]/, text);
});

test("dynamic private clues retain names and translate system templates", () => {
  assert.equal(typeof locale.setLanguage, "function");
  locale.setLanguage("ar");
  const fixtures = [
    ["Doctor appears aligned with Impostors.", ["Doctor"]],
    ["Your trap intercepted Noor at Ready’s house.", ["Noor", "Ready"]],
    ["Ready’s visitors: Noor, Doctor.", ["Ready", "Noor", "Doctor"]],
    ["Noor visited: Ready, Doctor.", ["Noor", "Ready", "Doctor"]],
    ["Your revenge is bound to Noor.", ["Noor"]],
    ["A bomb is planted at Ready’s house.", ["Ready"]],
    [
      "An anonymous exposure says Noor appears aligned with Innocents.",
      ["Noor"],
    ],
    ["Your exposure of Noor was published.", ["Noor"]],
    ["You stole Noor’s role: Doctor. Your objective has changed.", ["Noor"]],
    ["Noor was lost during the night.", ["Noor"]],
    ["Noor was exiled with 3 votes.", ["Noor"]],
    ["Noor begins with one vote from a Provoker.", ["Noor"]],
    ["Noor’s haunting carried Ready away.", ["Noor", "Ready"]],
    ["Day 3. The council is open.", ["3"]],
    ["Night 4. The village returns home.", ["4"]],
    ["Your vest is active. 1 remain.", ["1"]],
    ["I trust Noor. We need stronger evidence before voting.", ["Noor"]],
    ["I suspect Noor. Can you explain your night action?", ["Noor"]],
  ];
  for (const [source, names] of fixtures) {
    const translated = locale.t(source);
    assert.match(translated, /[\u0600-\u06ff]/, source);
    for (const name of names)
      assert.ok(translated.includes(name), `${source}: ${name}`);
  }
});

test("user text and exact name collisions stay intact", () => {
  assert.equal(typeof locale.setUserNames, "function");
  locale.setLanguage("ar");
  locale.setUserNames(["Doctor", "READY", "nobody", "سارة"]);
  for (const name of ["Doctor", "READY", "nobody", "سارة"])
    assert.equal(locale.t(name), name);
  assert.equal(
    locale.t("This is my custom chat about Doctor and READY"),
    "This is my custom chat about Doctor and READY",
  );
  assert.ok(
    locale.t("Doctor appears aligned with Neutral.").includes("Doctor"),
  );
  locale.setUserNames([]);
});

test("language changes are reversible and registered labels participate", () => {
  assert.equal(typeof locale.register, "function");
  locale.register({ "Invitation copied": "تم نسخ الدعوة" });
  locale.setLanguage("ar");
  assert.equal(locale.language, "ar");
  assert.equal(locale.t("Invitation copied"), "تم نسخ الدعوة");
  const translatedClue = locale.t("Noor visited: no house.");
  locale.setLanguage("en");
  assert.equal(locale.language, "en");
  assert.equal(locale.t("Doctor"), "Doctor");
  assert.equal(locale.t("تم نسخ الدعوة"), "Invitation copied");
  assert.equal(locale.t(translatedClue), "Noor visited: no house.");
  locale.setLanguage("unsupported");
  assert.equal(locale.language, "en");
});

test("room validation and connection failures are understandable in Arabic", () => {
  locale.setLanguage("ar");
  for (const message of [
    "The room is full.",
    "Only the host can do that.",
    "A match is already in progress.",
    "Settings are locked during a match.",
    "Everyone must be ready.",
    "Impostors must be fewer than half the players.",
    "Choose a valid target.",
    "Your vote is already locked.",
    "Night actions are closed.",
    "That room code is already in use. Create another room.",
    "Room not found. Check the code and make sure the host is online.",
    "This browser does not support the required WebRTC connection.",
    "Cannot reach the connection service. Check your internet connection.",
    "Browsers could not establish a connection. Try another network or configure a TURN relay.",
    "The host disconnected. Rejoin when the host is online.",
    "Connection timed out. Check the code and network, then try again.",
  ])
    assert.match(locale.t(message), /[\u0600-\u06ff]/, message);
});

test("DOM refresh translates labels and attributes without altering inputs, names, chat or SVG", async (t) => {
  if (!fs.existsSync(localePath))
    return t.skip("Locale module not implemented yet");
  const { chromium } = require("playwright");
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/tmp/chromium") ? "/tmp/chromium" : undefined);
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`<main id="fixture">
    <button id="label" title="Your role" aria-label="Your role">Doctor</button>
    <input id="input" value="Doctor" placeholder="Say something…">
    <textarea id="notes" placeholder="Your notes…">READY</textarea>
    <span class="name">Doctor</span><p data-no-i18n>READY</p>
    <div class="chatline chat"><strong>Doctor:</strong> READY</div>
    <div class="chatline"><strong>Noor:</strong> Doctor</div>
    <div class="chatline system">Day 2. The council is open.</div>
    <svg><path d="M0 0 L2 2"/></svg><code class="room-code">ABCDEF</code>
    <select><option>none</option><option value="leaf">leaf</option></select>
  </main>`);
  await page.addScriptTag({ path: localePath });
  const result = await page.evaluate(async () => {
    LanternLocale.observe(document.getElementById("fixture"));
    LanternLocale.setLanguage("ar");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const q = (s) => document.querySelector(s);
    const arabic = {
      label: q("#label").textContent,
      title: q("#label").title,
      placeholder: q("#input").placeholder,
      input: q("#input").value,
      notes: q("#notes").value,
      notesPlaceholder: q("#notes").placeholder,
      name: q(".name").textContent,
      raw: q("[data-no-i18n]").textContent,
      chats: [...document.querySelectorAll(".chatline:not(.system)")].map(
        (n) => n.textContent,
      ),
      system: q(".system").textContent,
      path: q("path").getAttribute("d"),
      code: q(".room-code").textContent,
      dir: document.documentElement.dir,
      optionValues: [...q("select").options].map((n) => n.value),
    };
    const late = document.createElement("button");
    late.id = "late";
    late.textContent = "CREATE ROOM";
    q("main").append(late);
    q("#label").textContent = "Tracker";
    await new Promise((resolve) => setTimeout(resolve, 20));
    const later = {
      label: q("#label").textContent,
      late: q("#late").textContent,
    };
    LanternLocale.setLanguage("en");
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      arabic,
      later,
      english: {
        label: q("#label").textContent,
        title: q("#label").title,
        placeholder: q("#input").placeholder,
        late: q("#late").textContent,
      },
      dir: document.documentElement.dir,
    };
  });
  assert.equal(result.arabic.label, "الطبيب");
  assert.match(result.arabic.title, /[\u0600-\u06ff]/);
  assert.match(result.arabic.placeholder, /[\u0600-\u06ff]/);
  assert.equal(result.arabic.input, "Doctor");
  assert.equal(result.arabic.notes, "READY");
  assert.match(result.arabic.notesPlaceholder, /[\u0600-\u06ff]/);
  assert.equal(result.arabic.name, "Doctor");
  assert.equal(result.arabic.raw, "READY");
  assert.deepEqual(result.arabic.chats, ["Doctor: READY", "Noor: Doctor"]);
  assert.match(result.arabic.system, /[\u0600-\u06ff]/);
  assert.equal(result.arabic.path, "M0 0 L2 2");
  assert.equal(result.arabic.code, "ABCDEF");
  assert.equal(result.arabic.dir, "rtl");
  assert.deepEqual(result.arabic.optionValues, ["none", "leaf"]);
  assert.equal(result.later.label, "المتعقب");
  assert.match(result.later.late, /[\u0600-\u06ff]/);
  assert.deepEqual(result.english, {
    label: "Tracker",
    title: "Your role",
    placeholder: "Say something…",
    late: "CREATE ROOM",
  });
  assert.equal(result.dir, "ltr");
});

test("Arabic persists after reload and observing translated UI settles without a mutation loop", async (t) => {
  const { chromium } = require("playwright");
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/tmp/chromium") ? "/tmp/chromium" : undefined);
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("http://lantern.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<main><button>START MATCH</button></main>",
    }),
  );
  await page.goto("http://lantern.test/");
  await page.addScriptTag({ path: localePath });
  const first = await page.evaluate(async () => {
    let mutationCount = 0;
    new MutationObserver((records) => {
      mutationCount += records.length;
    }).observe(document.querySelector("main"), {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    LanternLocale.observe(document.querySelector("main"));
    LanternLocale.setLanguage("ar");
    await new Promise((resolve) => setTimeout(resolve, 25));
    const settled = mutationCount;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return {
      settled,
      final: mutationCount,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
    };
  });
  assert.ok(first.settled > 0);
  assert.equal(first.final, first.settled);
  assert.deepEqual(
    { lang: first.lang, dir: first.dir },
    { lang: "ar", dir: "rtl" },
  );
  await page.reload();
  await page.addScriptTag({ path: localePath });
  const reloaded = await page.evaluate(() => {
    LanternLocale.observe(document.querySelector("main"));
    return {
      language: LanternLocale.language,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      label: document.querySelector("button").textContent,
    };
  });
  assert.equal(reloaded.language, "ar");
  assert.equal(reloaded.lang, "ar");
  assert.equal(reloaded.dir, "rtl");
  assert.match(reloaded.label, /[\u0600-\u06ff]/);
});
