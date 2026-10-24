const test = require("node:test");
const assert = require("node:assert/strict");
const { RoomHost } = require("../multiplayer-core.js");
const { RoleSystem, NightActionSequence } = require("../game.js");
const advanceClock = new WeakMap();

test("public death history hides attack causes and haunter attribution", () => {
  const r = started(6),
    { host, ids } = r;
  host.state.players.forEach((p) => RoleSystem.assign(p, "doctor"));
  RoleSystem.assign(host.state.players[1], "haunter");
  RoleSystem.assign(host.state.players[2], "impostor");
  host.state.players[1].mark = 3;
  phase(host, "night");
  const target = host
    .snapshot(ids[2])
    .view.players.find((p) => p.name === "Human 1").id;
  assert.equal(
    host.command(ids[2], { type: "night", mode: "kill", target }).ok,
    true,
  );
  phase(host, "resolve");
  r.advance(host.remaining * 1000);
  const view = host.snapshot(ids[5]).view;
  assert.ok(
    view.history
      .filter((h) => h.type === "death")
      .every((h) => h.cause === "night" && h.role === "Unknown"),
  );
  assert.equal(
    view.log.some((l) => /haunt/i.test(l.text)),
    false,
  );
});

function room(count = 4) {
  let clock = 100000;
  const host = new RoomHost({
    code: "ABCDEF",
    hostProfile: { name: "Host" },
    now: () => clock,
  });
  const ids = [host.hostId];
  for (let i = 1; i < count; i++)
    ids.push(host.join(`secret-credential-${i}`, { name: `Human ${i}` }));
  const ready = () =>
    ids
      .slice(1)
      .forEach((id) =>
        assert.equal(host.command(id, { type: "ready", ready: true }).ok, true),
      );
  const advance = (ms) => {
    clock += ms;
    host.tick(clock);
  };
  advanceClock.set(host, advance);
  return { host, ids, ready, advance, time: () => clock };
}
function started(count = 4) {
  const r = room(count);
  r.ready();
  assert.equal(r.host.command("host", { type: "start" }).ok, true);
  return r;
}
function phase(host, wanted) {
  for (let i = 0; i < 8 && host.state.phase !== wanted; i++) {
    if (["verdict", "resolve"].includes(host.state.phase)) {
      advanceClock.get(host)(host.remaining * 1000);
      continue;
    }
    const result = host.command("host", { type: "advance" });
    assert.equal(result.ok, true, result.error);
  }
  assert.equal(host.state.phase, wanted);
}

test("only actual connected, ready humans can start; host controls settings", () => {
  const r = room(4),
    { host, ids } = r;
  assert.equal(
    host.command(ids[1], { type: "start", actor: "host" }).ok,
    false,
  );
  assert.equal(host.command("host", { type: "start" }).ok, false);
  assert.equal(
    host.command(ids[1], { type: "settings", settings: { night: 10 } }).ok,
    false,
  );
  r.ready();
  assert.equal(
    host.command("host", { type: "settings", settings: { impostorCount: 2 } })
      .ok,
    false,
  );
  assert.equal(
    host.command("host", {
      type: "settings",
      settings: { enabled: ["not-a-role"] },
    }).ok,
    false,
  );
  assert.equal(
    host.command("host", {
      type: "settings",
      settings: { night: 10, impostorCount: 1, neutralCount: 0 },
    }).ok,
    true,
  );
  host.disconnect(ids[3]);
  assert.equal(host.command("host", { type: "start" }).ok, false);
  assert.equal(host.join("secret-credential-3", { name: "Back" }), ids[3]);
  host.command(ids[3], { type: "ready", ready: true });
  assert.equal(host.command("host", { type: "start" }).ok, true);
  assert.equal(host.state.players.length, 4);
  assert.deepEqual(
    host.state.players.map((p) => p.name),
    ["Host", "Human 1", "Human 2", "Back"],
  );
  assert.equal(host.state.config.online, true);
  assert.equal(host.state.config.revealRoles, false);
  ids.forEach((id) => host.command(id, { type: "ready", ready: true }));
  assert.equal(host.state.phase, "day");
});

test("reconnect requires the secret and a match cannot acquire new players", () => {
  const { host, ids } = started();
  host.disconnect(ids[2]);
  assert.equal(
    host.snapshot(ids[1]).room.members.find((m) => m.id === ids[2]).connected,
    false,
  );
  assert.throws(
    () => host.join("different-secret-credential", { name: "Human 2" }),
    /progress|started/i,
  );
  assert.equal(host.join("secret-credential-2", { name: "Human 2" }), ids[2]);
  assert.equal(host.snapshot(ids[1]).room.members.length, 4);
  assert.equal(
    host.snapshot(ids[1]).room.members.find((m) => m.id === ids[2]).connected,
    true,
  );
  assert.doesNotMatch(
    JSON.stringify(host.snapshot(ids[1])),
    /secret-credential/,
  );
  assert.equal(
    host.command("unknown", { type: "ready", ready: true }).ok,
    false,
  );
  host.disconnect(ids[2]);
  assert.equal(host.command(ids[2], { type: "ready", ready: true }).ok, false);
});

test("votes bind to the authenticated seat and remap every public ballot", () => {
  const { host, ids } = started();
  phase(host, "vote");
  assert.equal(
    host.command(ids[2], {
      type: "vote",
      actor: 0,
      memberId: "host",
      target: 1,
    }).ok,
    true,
  );
  assert.equal(host.command(ids[2], { type: "vote", target: 999 }).ok, false);
  const own = host.snapshot(ids[2]);
  assert.equal(own.view.players[0].name, "Human 2");
  assert.deepEqual(own.visibleVotes, [{ actor: 0, target: 1 }]);
  assert.deepEqual(host.snapshot("host").visibleVotes, [
    { actor: 2, target: 0 },
  ]);
  assert.equal(
    host.command(ids[1], { type: "advance", actor: "host" }).ok,
    false,
  );
  assert.equal(host.command(ids[1], { type: "pause", paused: true }).ok, false);
  assert.equal(
    host.command(ids[1], { type: "kick", memberId: "host" }).ok,
    false,
  );
});

test("projection whitelists public state and remaps own clues and target maps", () => {
  const { host, ids } = started(6);
  const s = host.state;
  s.players.forEach((p, i) =>
    RoleSystem.assign(p, i === 2 ? "lookout" : i === 0 ? "impostor" : "doctor"),
  );
  s.players[3].intel = [{ text: "UNAUTHORIZED PRIVATE CLUE", target: 2 }];
  s.players[3].known = { 2: { alignment: "neutral" } };
  s.players[3].bombs = [1, 2];
  s.players[3].mark = 2;
  s.players[3].cover = "sorcerer";
  s.players[2].intel = [
    {
      day: 1,
      text: "Your visitors.",
      target: 0,
      people: [1, 2, 5],
      alignment: null,
    },
  ];
  s.players[2].known = {
    0: { alignment: "impostors", day: 1 },
    5: { alignment: "innocents", day: 1 },
  };
  s.players[2].bombs = [0, 5];
  s.players[2].mark = 5;
  s.pressure = [{ target: 1, day: 2, actor: 3 }];
  phase(host, "night");
  const packet = host.snapshot(ids[2]),
    v = packet.view;
  assert.deepEqual(
    v.players.map((p) => p.id),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    v.players.map((p) => p.name),
    ["Human 2", "Host", "Human 1", "Human 3", "Human 4", "Human 5"],
  );
  assert.equal(v.players[0].role, "lookout");
  assert.equal(v.players[0].charges, 2);
  assert.deepEqual(v.players[0].intel[0].people, [2, 0, 5]);
  assert.equal(v.players[0].intel[0].target, 1);
  assert.deepEqual(Object.keys(v.players[0].known).sort(), ["1", "5"]);
  assert.deepEqual(v.players[0].bombs, [1, 5]);
  assert.equal(v.players[0].mark, 5);
  assert.deepEqual(v.allowedTargets.ability, [1, 2, 0, 3, 4, 5]);
  v.players
    .slice(1)
    .forEach((p) =>
      [
        "role",
        "faction",
        "cover",
        "charges",
        "bombs",
        "mark",
        "intel",
        "known",
        "suspicion",
        "belief",
        "memory",
        "trust",
        "cleaned",
        "framedUntil",
        "personalWin",
      ].forEach((k) => assert.equal(Object.hasOwn(p, k), false, k)),
    );
  assert.doesNotMatch(
    JSON.stringify(packet),
    /UNAUTHORIZED PRIVATE CLUE|"rng"|"seed"|"personality"/,
  );
  assert.deepEqual(v.events, []);
});

test("night commands cannot impersonate another actor, bypass role mode, or submit invalid guesses", () => {
  const { host, ids } = started(6);
  host.state.players.forEach((p, i) =>
    RoleSystem.assign(
      p,
      i === 0 ? "impostor" : i === 2 ? "sorcerer" : "doctor",
    ),
  );
  phase(host, "night");
  assert.equal(
    host.command(ids[1], { type: "night", actor: 0, mode: "kill", target: 1 })
      .ok,
    false,
  );
  assert.equal(
    host.command(ids[1], {
      type: "night",
      actor: 0,
      mode: "detonate",
      target: null,
    }).ok,
    false,
  );
  assert.equal(
    host.command(ids[2], {
      type: "night",
      mode: "ability",
      target: 1,
      guess: "fake-role",
    }).ok,
    false,
  );
  assert.equal(
    host.command(ids[1], {
      type: "night",
      actor: 0,
      mode: "ability",
      target: 0,
    }).ok,
    true,
  );
  assert.equal(
    host.command("host", { type: "night", mode: "kill", target: 3 }).ok,
    true,
  );
  assert.equal(host.command("host", { type: "advance" }).ok, true);
  assert.equal(host.state.players[3].alive, false);
  assert.equal(host.state.players[0].alive, true);
  assert.equal(host.state.players[1].alive, true);
});

test("wall clock is authoritative, paused time freezes and cinematic outcomes wait for dawn", () => {
  const r = started(6),
    { host, ids } = r;
  host.state.players.forEach((p, i) =>
    RoleSystem.assign(p, i === 0 ? "impostor" : "doctor"),
  );
  phase(host, "day");
  r.advance(1100);
  assert.equal(host.snapshot("host").remaining, 63.9);
  host.command("host", { type: "pause", paused: true });
  const before = host.snapshot("host").remaining;
  r.advance(60000);
  assert.equal(host.snapshot("host").remaining, before);
  host.command("host", { type: "pause", paused: false });
  r.advance(63900);
  assert.equal(host.state.phase, "vote");
  phase(host, "night");
  host.command("host", { type: "night", mode: "kill", target: 3 });
  host.command("host", { type: "advance" });
  assert.equal(host.state.phase, "resolve");
  assert.equal(host.state.players[3].alive, false);
  const observer = host.snapshot(ids[1]);
  assert.equal(
    observer.view.players.find((p) => p.name === "Human 3").alive,
    true,
  );
  assert.equal(observer.view.winner, null);
  assert.doesNotMatch(JSON.stringify(observer.view.log), /lost during/);
  assert.deepEqual(observer.scenes, [{ kind: "sleep", subject: 0 }]);
  const attacker = host.snapshot("host");
  assert.equal(attacker.scenes[0].kind, "attack");
  assert.equal(
    host.duration,
    Math.max(
      ...Object.values(host.nightResult.privateScenesByViewer).map(
        (s) => new NightActionSequence(s).totalDuration,
      ),
    ) + 0.4,
  );
  r.advance(3300);
  assert.equal(host.state.phase, "resolve");
  r.advance(10000);
  assert.equal(host.state.phase, "morning");
  const dawn = host.snapshot(ids[1]);
  assert.equal(
    dawn.view.players.find((p) => p.name === "Human 3").alive,
    false,
  );
  assert.equal(
    dawn.view.players.find((p) => p.name === "Human 3").publicRole,
    "Unknown",
  );
  assert.doesNotMatch(JSON.stringify(dawn.view.log), /Role:/);
});

test("verdict hides death and result publication until its presentation ends", () => {
  const r = started(6),
    { host, ids } = r;
  host.state.players.forEach((p, i) =>
    RoleSystem.assign(p, i === 0 ? "impostor" : "doctor"),
  );
  phase(host, "vote");
  // Every authenticated voter chooses Human 3 in their own local ID mapping.
  ids.forEach((id) => {
    const packet = host.snapshot(id);
    const target = packet.view.players.find((p) => p.name === "Human 3").id;
    assert.equal(host.command(id, { type: "vote", target }).ok, true);
  });
  host.command("host", { type: "advance" });
  const packet = host.snapshot(ids[2]);
  assert.equal(host.state.phase, "verdict");
  assert.equal(packet.verdict.target, 3);
  assert.equal(packet.view.players[3].alive, true);
  assert.equal(
    packet.view.history.some((h) => h.type === "death" && h.target === 3),
    false,
  );
  assert.doesNotMatch(JSON.stringify(packet.view.log), /was exiled/);
  r.advance(8000);
  assert.equal(host.state.phase, "night");
  assert.equal(host.snapshot(ids[2]).view.players[3].alive, false);
  assert.equal(host.snapshot(ids[2]).view.players[3].publicRole, "Unknown");
});

test("chat phase and length are validated; rematch returns to lobby and kick revokes a token", () => {
  const { host, ids } = started();
  assert.equal(host.command(ids[1], { type: "chat", text: "hello" }).ok, false);
  phase(host, "day");
  assert.equal(
    host.command(ids[1], { type: "chat", speaker: 0, text: "مرحبا <friend>" })
      .ok,
    true,
  );
  assert.equal(host.snapshot(ids[1]).view.log.at(-1).speaker, 0);
  assert.equal(host.snapshot("host").view.log.at(-1).speaker, 1);
  assert.equal(host.snapshot("host").view.log.at(-1).text, "مرحبا <friend>");
  assert.equal(
    host.command(ids[1], { type: "chat", text: "x".repeat(181) }).ok,
    false,
  );
  assert.equal(host.command("host", { type: "rematch" }).ok, false);
  host.state.phase = "end";
  assert.equal(host.command(ids[1], { type: "rematch" }).ok, false);
  assert.equal(host.command("host", { type: "rematch" }).ok, true);
  assert.equal(host.snapshot("host").room.phase, "lobby");
  assert.equal(host.snapshot("host").view, undefined);
  assert.equal(
    host.command("host", { type: "kick", memberId: ids[1] }).ok,
    true,
  );
  assert.equal(host.command(ids[1], { type: "ready", ready: true }).ok, false);
  assert.notEqual(
    host.join("secret-credential-1", { name: "New seat" }),
    ids[1],
  );
});

test("final results reveal roles only after end and snapshot mutations cannot alter authority", () => {
  const { host, ids } = started();
  const snap = host.snapshot(ids[1]);
  snap.room.members[0].name = "Changed";
  snap.room.settings.enabled.length = 0;
  snap.view.players[0].intel.push({ text: "forged" });
  assert.equal(host.snapshot("host").room.members[0].name, "Host");
  assert.ok(host.snapshot("host").room.settings.enabled.length);
  assert.equal(host.state.players[1].intel.length, 0);
  host.state.phase = "end";
  host.state.winner = { key: 2, label: "Human wins", winners: [1, 2] };
  const final = host.snapshot(ids[2]);
  final.view.players.forEach((p) => assert.ok(p.role));
  assert.equal(final.view.winner.key, 0);
  assert.deepEqual(final.view.winner.winners, [2, 0]);
});

test("Insane cover stays secret after death and teammates learn only their shared faction", () => {
  const { host, ids } = started(6);
  const s = host.state;
  s.players.forEach((p, i) =>
    RoleSystem.assign(
      p,
      i === 1
        ? "insane"
        : i === 0
          ? "impostor"
          : i === 2
            ? "cleaner"
            : "doctor",
    ),
  );
  s.players[1].cover = "lookout";
  let own = host.snapshot(ids[1]).view.players[0];
  assert.equal(own.role, "lookout");
  assert.equal(own.cover, null);
  s.eliminate(1, "attacked");
  own = host.snapshot(ids[1]).view.players[0];
  assert.equal(own.role, "lookout");
  assert.equal(own.cover, null);
  const ally = host.snapshot("host").view.players[2];
  assert.equal(ally.faction, "impostors");
  assert.equal(Object.hasOwn(ally, "role"), false);
  assert.equal(
    Object.hasOwn(
      host.snapshot(ids[3]).view.players.find((p) => p.name === "Human 2"),
      "faction",
    ),
    false,
  );
  s.phase = "end";
  assert.equal(host.snapshot(ids[1]).view.players[0].role, "insane");
});

test("non-host killers receive only their own scenes and targets are remapped consistently", () => {
  const { host, ids } = started(6);
  host.state.players.forEach((p, i) =>
    RoleSystem.assign(
      p,
      i === 0 ? "impostor" : i === 3 ? "serialkiller" : "doctor",
    ),
  );
  phase(host, "night");
  assert.equal(
    host.command(ids[3], {
      type: "night",
      actor: 0,
      mode: "ability",
      target: 5,
    }).ok,
    true,
  );
  assert.equal(
    host.command(ids[3], { type: "night", mode: "ability", target: 4 }).ok,
    false,
  );
  assert.equal(host.command("host", { type: "advance" }).ok, true);
  assert.deepEqual(host.snapshot(ids[3]).scenes, [
    { kind: "attack", subject: 5, style: "shadow", outcome: "killed" },
  ]);
  assert.deepEqual(host.snapshot(ids[5]).scenes, [
    { kind: "death", subject: 0, style: "shadow" },
  ]);
  assert.deepEqual(host.snapshot(ids[2]).scenes, [
    { kind: "sleep", subject: 0 },
  ]);
  assert.equal(host.snapshot(ids[5]).view.players[0].alive, true);
  assert.equal(host.snapshot(ids[3]).view.ownActions[0].actor, 0);
});

test("a winning exile cannot publish winner roles through the verdict snapshot", () => {
  const r = started(),
    { host, ids } = r;
  host.state.players.forEach((p, i) =>
    RoleSystem.assign(p, i === 0 ? "impostor" : "doctor"),
  );
  phase(host, "vote");
  ids.forEach((id) => {
    const target = host
      .snapshot(id)
      .view.players.find((p) => p.name === "Host").id;
    host.command(id, { type: "vote", target });
  });
  host.command("host", { type: "advance" });
  assert.ok(host.state.winner);
  const packet = host.snapshot(ids[1]);
  assert.equal(packet.view.phase, "verdict");
  assert.equal(packet.view.winner, null);
  assert.equal(
    Object.hasOwn(
      packet.view.players.find((p) => p.name === "Host"),
      "role",
    ),
    false,
  );
  assert.equal(packet.view.players.find((p) => p.name === "Host").alive, true);
  assert.equal(host.command("host", { type: "advance" }).ok, false);
  r.advance(host.remaining * 1000);
  assert.equal(host.state.phase, "end");
  assert.equal(host.snapshot(ids[1]).view.winner.key, "innocents");
});

test("full rooms, malformed packets and forbidden hidden-state settings are rejected", () => {
  const { host, ids } = room(12);
  assert.throws(
    () => host.join("extra-seat-secret", { name: "Extra" }),
    /full/i,
  );
  assert.throws(() => host.join("", {}), /token/i);
  for (const message of [
    null,
    [],
    true,
    "start",
    {},
    { type: "night", target: 0 },
    { type: "not-a-command" },
  ])
    assert.equal(host.command(ids[1], message).ok, false);
  for (const settings of [
    { seed: 1 },
    { revealRoles: true },
    { roster: [] },
    { discussion: Infinity },
    { night: 0 },
    { neutralCount: -1 },
    { impostorCount: 6 },
  ])
    assert.equal(
      host.command("host", { type: "settings", settings }).ok,
      false,
    );
  assert.equal(
    host.command("host", {
      type: "settings",
      settings: {
        impostorCount: "random",
        neutralCount: 3,
        enabled: ["doctor", "impostor", "survivor"],
      },
    }).ok,
    true,
  );
});

test("default lobby names and requested colors become distinct authoritative identities", () => {
  const host = new RoomHost({
    code: "ABCDEF",
    hostProfile: { name: "Friend", color: "#ef8a62" },
  });
  const ids = Array.from({ length: 11 }, (_, i) =>
    host.join(`same-default-token-${i}`, { name: "Friend", color: "#ef8a62" }),
  );
  const members = host.snapshot("host").room.members;
  assert.deepEqual(
    members.map((m) => m.name),
    ["Friend", ...Array.from({ length: 11 }, (_, i) => `Friend ${i + 2}`)],
  );
  assert.equal(new Set(members.map((m) => m.color)).size, 12);
  assert.equal(members[1].color, "#5daecd");
  assert.equal(members[2].color, "#aa8bd5");
  assert.deepEqual(
    ids,
    members.slice(1).map((m) => m.id),
  );
});

test("case-insensitive names receive an 18-character suffix and unique requested colors are honored", () => {
  const name = "ABCDEFGHIJKLMNOPQR";
  const host = new RoomHost({
    code: "ABCDEF",
    hostProfile: { name, color: "#ef8a62" },
  });
  host.join("long-name-token-1", {
    name: name.toLowerCase(),
    color: "#aa8bd5",
  });
  host.join("long-name-token-2", {
    name: name.toLowerCase(),
    color: "#aa8bd5",
  });
  const members = host.snapshot("host").room.members;
  assert.deepEqual(
    members.map((m) => m.name),
    [name, "abcdefghijklmnop 2", "abcdefghijklmnop 3"],
  );
  assert.equal(members[1].color, "#aa8bd5");
  assert.equal(members[2].color, "#5daecd");
  assert.ok(members.every((m) => m.name.length <= 18));
});

test("lobby reconnect excludes its own seat and keeps assigned fallback identities stable", () => {
  const requested = { name: "Friend", color: "#ef8a62" };
  const host = new RoomHost({ code: "ABCDEF", hostProfile: requested });
  const first = host.join("same-identity-token-1", requested);
  const second = host.join("same-identity-token-2", requested);
  const third = host.join("same-identity-token-3", requested);
  const before = host
    .snapshot("host")
    .room.members.find((m) => m.id === second);
  host.disconnect(second);
  assert.equal(host.join("same-identity-token-2", requested), second);
  let after = host.snapshot("host").room.members.find((m) => m.id === second);
  assert.equal(after.name, before.name);
  assert.equal(after.color, before.color);
  // A vacancy before the existing seat must not renumber/recolor that same person.
  assert.equal(
    host.command("host", { type: "kick", memberId: first }).ok,
    true,
  );
  host.disconnect(second);
  host.join("same-identity-token-2", requested);
  after = host.snapshot("host").room.members.find((m) => m.id === second);
  assert.equal(after.name, before.name);
  assert.equal(after.color, before.color);
  // An explicit profile change may request a now-unused name and color.
  host.disconnect(third);
  host.join("same-identity-token-3", { name: "New friend", color: "#5daecd" });
  const members = host.snapshot("host").room.members;
  assert.equal(members.find((m) => m.id === third).name, "New friend");
  assert.equal(members.find((m) => m.id === third).color, "#5daecd");
  assert.equal(new Set(members.map((m) => m.color)).size, members.length);
});

test("names remove bidi formatting controls while preserving Arabic letters", () => {
  const host = new RoomHost({
    code: "ABCDEF",
    hostProfile: { name: "\u202eصديق\u202c" },
  });
  host.join("arabic-name-token-1", { name: "\u2067صديق\u2069" });
  host.join("arabic-name-token-2", {
    name: "\u061c\u200fمرحبا\u202a\u202b\u202d\u200e",
  });
  assert.deepEqual(
    host.snapshot("host").room.members.map((m) => m.name),
    ["صديق", "صديق 2", "مرحبا"],
  );
});
