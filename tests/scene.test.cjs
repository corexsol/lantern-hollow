const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture({ width = 1440, height = 900, reduced = false } = {}) {
  const operations = [];
  const gradient = { addColorStop() {} };
  const c = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "measureText") return (text) => ({ width: String(text).length * 7 });
      if (String(key).startsWith("create")) return () => gradient;
      return (...args) => operations.push([key, ...args]);
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const sandbox = {
    window: {}, document: { readyState: "loading", addEventListener() {} },
    innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    Image: class { constructor() { this.complete = false; this.naturalWidth = 0; } },
    Path2D: class {}, console,
  };
  vm.createContext(sandbox);
  for (const file of ["game.js", "scene.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), sandbox);
  const players = Array.from({ length: 8 }, (_, id) => ({ id, name: "Human " + id,
    color: "#8bbd9e", hat: "leaf", alive: true, x: 720, y: 450,
    tx: 720, ty: 450, bubbleTime: 0 }));
  const state = { phase: "day", day: 1, players, player: (id) => players.find((p) => p.id === id), alive: () => players.filter((p) => p.alive) };
  const e = { state, preview: null, settings: { reduced }, screen: "game", selected: null,
    visiblePlayer: (id) => state.player(id), validTargets: () => [], visibleVotes: [],
    nightTarget: null, notebook: { ratings: {} } };
  const scene = new sandbox.window.LanternSceneRenderer(e, { style: {}, getContext: () => c });
  return { sandbox, e, scene, operations, players };
}

test("cottage targeting survives portrait layout, pan, zoom and cinematic framing", () => {
  for (const width of [390, 1440]) {
    const { scene, players, e } = fixture({ width, height: 844 });
    e.state.phase = "night";
    scene.zoom = 1.35;
    scene.pan = { x: 35, y: -28 };
    scene.focus = { x: 770, y: 400, amount: .8 };
    for (const player of players) {
      const h = player.house, tr = scene.transform();
      const x = h.x * tr.z + tr.ox, y = (h.y - 45) * tr.z + tr.oy;
      assert.equal(scene.hit(x, y), player.id);
      assert.equal(scene.map.houses.find((house) => house.id === player.id), h);
    }
  }
});

test("night animation stays at the projected target cottage and recovers a saved victim", () => {
  const { sandbox, scene, e, operations, players } = fixture();
  e.state.phase = "resolve";
  e.nightSequence = new sandbox.window.LanternCore.NightActionSequence([
    { kind: "save", subject: 3, healer: "anonymous", style: "attack" },
  ]);
  const visitors = [], bodies = [];
  scene.nightVisitor = (...args) => visitors.push(args);
  scene.character = (player) => bodies.push(player);
  e.nightSequence.elapsed = 2.6;
  scene.drawNightScene();
  assert.equal(scene.nightFocus().house, players[3].house);
  assert.equal(bodies[0].id, 3);
  assert.ok(operations.some(([kind, angle]) => kind === "rotate" && Math.abs(angle) > 1.4), "victim visibly collapses after impact");
  assert.equal(visitors.some((args) => args[2] === true), false);
  assert.equal(operations.some(([kind]) => kind === "setTransform"), false, "night action must remain in the world camera");
  operations.length = 0;
  visitors.length = 0;
  bodies.length = 0;
  e.nightSequence.elapsed = 5;
  scene.drawNightScene();
  assert.ok(visitors.some((args) => args[2] === true), "an anonymous healer arrives");
  assert.ok(visitors.every((args) => args.length === 5 && args.every((v) => typeof v === "number" || typeof v === "boolean")));
  assert.equal(operations.some(([kind, angle]) => kind === "rotate" && Math.abs(angle) > .01), false, "saved victim stands again");
  assert.equal(bodies[0].deadFace, false);
});

test("pause freezes camera, residents and landscape; reduced motion still preserves story beats", () => {
  const { sandbox, scene, e, players } = fixture({ reduced: true });
  e.state.phase = "resolve";
  e.nightSequence = new sandbox.window.LanternCore.NightActionSequence([{ kind: "death", subject: 2 }]);
  e.nightSequence.elapsed = 2.8;
  scene.draw(.1);
  assert.ok(scene.focus.amount > .95);
  const before = { time: scene.time, focus: { ...scene.focus }, x: players[0].x, y: players[0].y };
  e.paused = true;
  scene.draw(.1);
  assert.equal(scene.time, before.time);
  assert.deepEqual({ ...scene.focus }, before.focus);
  assert.equal(players[0].x, before.x);
  assert.equal(players[0].y, before.y);
});

test("public resident art and house art never read role or faction metadata", () => {
  const { scene, players } = fixture();
  for (const key of ["role", "faction", "publicRole"])
    Object.defineProperty(players[0], key, { get() { throw new Error("private art lookup: " + key); } });
  assert.doesNotThrow(() => scene.character(players[0]));
  assert.doesNotThrow(() => scene.house(players[0].house, players[0]));
});

test("vote-out caption stays generic even when the clock carries a role", () => {
  const { sandbox, scene, e, players } = fixture();
  e.state.phase = "verdict";
  e.voteOut = new sandbox.window.LanternCore.VoteOutSequence(players[1], "Impostor");
  e.voteOut.elapsed = 4;
  const labels = [];
  scene.text = (text) => labels.push(text);
  scene.drawVoteOut();
  assert.ok(labels.includes("ELIMINATED"));
  assert.equal(labels.includes("Impostor"), false);
});


test("a multi-house blast animates its projected targets, never the bomber's own body", () => {
  const { sandbox, scene, e } = fixture();
  e.state.phase = "resolve";
  e.nightSequence = new sandbox.window.LanternCore.NightActionSequence([
    { kind: "blast", subject: 0, targets: [{ subject: 2, outcome: "killed" }, { subject: 5, outcome: "blocked" }] },
  ]);
  e.nightSequence.elapsed = 2.7;
  const bodies = [], visitors = [];
  scene.character = (player) => bodies.push(player.id);
  scene.nightVisitor = (...args) => visitors.push(args);
  scene.drawNightScene();
  assert.deepEqual(bodies, [2, 5]);
  assert.equal(visitors.length, 0, "an explosion never invents an attacking visitor");
});
