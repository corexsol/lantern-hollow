const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  GameState,
  RoleSystem,
  NightActionResolver,
  VotingSystem,
} = require("../game.js");
const roster = Array.from({ length: 4 }, (_, i) => ({
  name: "Friend " + i,
  color: ["#ffb576", "#79cae8", "#dba9e9", "#9bdca7"][i],
  hat: "none",
  glasses: false,
  accessory: "none",
}));
test("an online match contains exactly the joined human roster and chosen impostor count", () => {
  const s = new GameState({
    online: true,
    roster,
    count: 4,
    impostorCount: 1,
    neutralCount: 0,
    seed: 4,
  });
  assert.equal(s.players.length, 4);
  assert.deepEqual(
    s.players.map((p) => p.name),
    roster.map((p) => p.name),
  );
  assert.equal(s.players.filter((p) => p.faction === "impostors").length, 1);
  assert.equal(s.players.filter((p) => p.faction === "neutral").length, 0);
});
test("random impostors stay below half the lobby and respect enabled roles", () => {
  let seen = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const s = new GameState({
      online: true,
      count: 8,
      impostorCount: "random",
      neutralCount: 0,
      enabled: ["doctor", "impostor"],
      seed,
    });
    const n = s.players.filter((p) => p.faction === "impostors").length;
    assert.ok(n >= 1 && n <= 3);
    seen.add(n);
    assert.ok(s.players.every((p) => ["doctor", "impostor"].includes(p.role)));
  }
  assert.ok(seen.size > 1);
});
test("death never publishes the role in public player metadata, history or logs", () => {
  const s = new GameState({ online: true, count: 6, seed: 3 });
  s.players.forEach((p) => RoleSystem.assign(p, "doctor"));
  RoleSystem.assign(s.players[1], "impostor");
  new NightActionResolver(s).resolve([{ actor: 1, target: 2, mode: "kill" }]);
  assert.equal(s.players[2].publicRole, "Unknown");
  assert.equal(s.history.find((e) => e.target === 2).role, "Unknown");
  assert.equal(
    s.log.some((l) => l.text.includes("Role:")),
    false,
  );
  const v = new GameState({ online: true, count: 6, seed: 2 });
  v.players.forEach((p) => RoleSystem.assign(p, "doctor"));
  RoleSystem.assign(v.players[2], "impostor");
  new VotingSystem(v).resolve(
    v.players.map((p) => ({ actor: p.id, target: 1 })),
  );
  assert.equal(v.players[1].publicRole, "Unknown");
  assert.equal(
    v.log.some((l) => l.text.includes("Role:")),
    false,
  );
});
test("each night viewer receives only their own anonymous private scene", () => {
  const s = new GameState({ online: true, count: 6, seed: 3 });
  s.players.forEach((p) => RoleSystem.assign(p, "doctor"));
  RoleSystem.assign(s.players[2], "impostor");
  const r = new NightActionResolver(s).resolve([
    { actor: 2, target: 3, mode: "kill" },
    { actor: 4, target: 3, mode: "ability" },
  ]);
  assert.deepEqual(r.privateScenesByViewer[3], [
    { kind: "save", subject: 3, healer: "anonymous", style: "shadow" },
  ]);
  assert.deepEqual(r.privateScenesByViewer[4], [
    { kind: "save", subject: 3, healer: "self", style: "shadow" },
  ]);
  assert.equal(r.privateScenesByViewer[2][0].outcome, "blocked");
});
test("revenge deaths do not identify the dead haunter in public news", () => {
  const s = new GameState({ online: true, count: 6, seed: 3 });
  s.players.forEach((p) => RoleSystem.assign(p, "doctor"));
  RoleSystem.assign(s.players[1], "haunter");
  s.players[1].mark = 2;
  s.eliminate(1, "vote");
  assert.equal(s.players[2].alive, false);
  assert.equal(
    s.log.some((l) => l.text.includes(s.players[1].name)),
    false,
  );
  assert.equal(
    s.log.some((l) => /haunt/i.test(l.text)),
    false,
  );
});
