/* Host authority and per-viewer wire projections. No transport or DOM dependency. */
(() => {
  "use strict";
  const Core =
    typeof module !== "undefined" && module.exports
      ? require("./game.js")
      : globalThis.LanternCore;
  const {
    GameState,
    RoleSystem,
    NightActionResolver,
    VotingSystem,
    NightActionSequence,
    VoteOutSequence,
  } = Core;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const PUBLIC_PLAYER = [
    "name",
    "color",
    "hat",
    "glasses",
    "accessory",
    "x",
    "y",
    "tx",
    "ty",
    "blink",
    "bubble",
    "bubbleTime",
  ];
  const COLORS = [
    "#ef8a62",
    "#5daecd",
    "#aa8bd5",
    "#edc45c",
    "#82b878",
    "#d9779d",
    "#71c9b6",
    "#c79c70",
    "#8b9ce0",
    "#dbaa47",
    "#c77570",
    "#82ad93",
  ];
  const roleKeys = Object.keys(RoleSystem.roles);
  function profile(raw = {}, index = 0) {
    const p = isObject(raw) ? raw : {};
    return {
      name:
        String(p.name || "Friend")
          .replace(
            /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
            "",
          )
          .trim()
          .slice(0, 18) || "Friend",
      color:
        typeof p.color === "string" && COLORS.includes(p.color.toLowerCase())
          ? p.color.toLowerCase()
          : COLORS[index % COLORS.length],
      hat: ["none", "leaf", "cap", "flower", "crown"].includes(p.hat)
        ? p.hat
        : "leaf",
      glasses: p.glasses === true,
      accessory: ["none", "scarf"].includes(p.accessory) ? p.accessory : "none",
    };
  }
  const publicText = (item) =>
    item.kind === "chat"
      ? item.text
      : String(item.text || "").replace(/\s*Role:\s*[^.]*\./g, "");
  class RoomHost {
    constructor({
      code,
      hostProfile = {},
      onChange = () => {},
      now = () => Date.now(),
    } = {}) {
      if (
        typeof code !== "string" ||
        !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)
      )
        throw new Error("Enter a six-character room code.");
      this.code = code;
      this.hostId = "host";
      this.onChange = onChange;
      this._now = now;
      this.seq = 0;
      this.state = null;
      this.paused = false;
      this.duration = 0;
      this.elapsed = 0;
      this._lastTime = Number(now());
      this._nextMember = 1;
      this.members = [
        {
          id: this.hostId,
          ...profile(hostProfile),
          ready: true,
          connected: true,
        },
      ];
      this._tokens = new Map();
      this._kicked = new Set();
      this._seats = new Map();
      this._requestedProfiles = new Map([[this.hostId, profile(hostProfile)]]);
      this.settings = {
        discussion: 65,
        voting: 24,
        night: 32,
        impostorCount: 1,
        neutralCount: 0,
        enabled: [...roleKeys],
      };
      this._votes = new Map();
      this._actions = new Map();
      this._nightFinished = new Set();
      this._concealed = null;
      this.nightResult = null;
      this._verdict = null;
      this.sceneKey = 0;
    }
    get remaining() {
      return Math.max(0, this.duration - this.elapsed);
    }
    _emit() {
      this.seq++;
      this.onChange(this);
    }
    _member(id) {
      return this.members.find((m) => m.id === id && !this._kicked.has(id));
    }
    _phase() {
      return this.state ? this.state.phase : "lobby";
    }
    _assignProfile(raw, member = null) {
      const assigned = profile(raw),
        requested = { ...assigned };
      const others = this.members.filter((m) => m.id !== member?.id);
      const names = new Set(others.map((m) => m.name.toLowerCase()));
      const colors = new Set(others.map((m) => m.color));
      const previous = member ? this._requestedProfiles.get(member.id) : null;
      // Repeating the same requested profile keeps its assigned identity even
      // when an earlier seat has left and a lower numbered fallback is free.
      if (
        previous?.name.toLowerCase() === requested.name.toLowerCase() &&
        !names.has(member.name.toLowerCase())
      )
        assigned.name = member.name;
      else {
        let suffix = 2;
        while (names.has(assigned.name.toLowerCase())) {
          const ending = ` ${suffix++}`;
          assigned.name = requested.name.slice(0, 18 - ending.length) + ending;
        }
      }
      if (previous?.color === requested.color && !colors.has(member.color))
        assigned.color = member.color;
      else if (colors.has(assigned.color))
        assigned.color = COLORS.find((color) => !colors.has(color));
      return { assigned, requested };
    }
    join(token, rawProfile = {}) {
      if (typeof token !== "string" || token.length < 8 || token.length > 256)
        throw new Error("Invalid reconnect token.");
      const existing = this._tokens.get(token);
      if (existing) {
        const member = this._member(existing);
        if (!member) throw new Error("This seat is no longer available.");
        member.connected = true;
        if (!this.state) {
          const { assigned, requested } = this._assignProfile(
            rawProfile,
            member,
          );
          Object.assign(member, assigned);
          this._requestedProfiles.set(existing, requested);
        }
        this._emit();
        return existing;
      }
      if (this.state) throw new Error("A match is already in progress.");
      if (this.members.length >= 12) throw new Error("The room is full.");
      const id = `member-${this._nextMember++}`;
      const { assigned, requested } = this._assignProfile(rawProfile);
      this.members.push({ id, ...assigned, ready: false, connected: true });
      this._requestedProfiles.set(id, requested);
      this._tokens.set(token, id);
      this._emit();
      return id;
    }
    disconnect(memberId) {
      const member = this._member(memberId);
      if (!member || !member.connected) return;
      member.connected = false;
      if (!this.state) member.ready = false;
      this._emit();
    }
    _validateSettings(candidate) {
      const n = Math.max(4, this.members.length),
        maxBad = Math.floor((n - 1) / 2);
      for (const key of ["discussion", "voting", "night"])
        if (
          !Number.isFinite(candidate[key]) ||
          candidate[key] < 5 ||
          candidate[key] > 600
        )
          return "Timers must be between 5 and 600 seconds.";
      if (
        candidate.impostorCount !== "random" &&
        (!Number.isInteger(candidate.impostorCount) ||
          candidate.impostorCount < 1 ||
          candidate.impostorCount > maxBad)
      )
        return "Impostors must be fewer than half the players.";
      const bad =
        candidate.impostorCount === "random" ? 1 : candidate.impostorCount;
      if (
        !Number.isInteger(candidate.neutralCount) ||
        candidate.neutralCount < 0 ||
        candidate.neutralCount > n - bad - 1
      )
        return "Leave at least one Innocent in the match.";
      if (
        !Array.isArray(candidate.enabled) ||
        !candidate.enabled.length ||
        candidate.enabled.length > roleKeys.length ||
        candidate.enabled.some((k) => !roleKeys.includes(k))
      )
        return "Choose valid roles.";
      const has = (f) =>
        candidate.enabled.some((k) => RoleSystem.roles[k].faction === f);
      if (
        !has("innocents") ||
        !has("impostors") ||
        (candidate.neutralCount && !has("neutral"))
      )
        return "Enable a role for every selected faction.";
      return null;
    }
    _mapping(memberId) {
      const own = this._seats.get(memberId);
      if (own === undefined || !this.state) return null;
      const ordered = [
        own,
        ...this.state.players.map((p) => p.id).filter((id) => id !== own),
      ];
      const local = new Map(ordered.map((id, index) => [id, index]));
      return {
        own,
        ordered,
        toLocal: (id) =>
          id === null || id === undefined ? null : (local.get(id) ?? null),
        toCanonical: (id) =>
          Number.isInteger(id) && id >= 0 && id < ordered.length
            ? ordered[id]
            : null,
      };
    }
    _setPhase(phase) {
      this.state.phase = phase;
      this.elapsed = 0;
      this.duration =
        {
          reveal: 9999,
          day: this.settings.discussion,
          vote: this.settings.voting,
          verdict: this._verdict
            ? (VoteOutSequence?.TIMES.end || 6.8) + 0.6
            : 7,
          night: this.settings.night,
          resolve: this._resolveDuration || 3.6,
          morning: 3,
          end: 9999,
        }[phase] || 0;
      if (phase === "day")
        this.state.addLog(
          `Day ${Math.max(1,this.state.day-1)}. The council is open.`,
          "system",
        );
      if (phase === "vote") {
        this._votes.clear();
        this.state.ballots = [];
        this.state.addLog("The ballot is open. A tie means no exile.", "event");
        this.state.pressure
          .filter((p) => p.day === this.state.day)
          .forEach((p) =>
            this.state.addLog(
              `${this.state.player(p.target).name} begins with one vote from a Provoker.`,
              "event",
            ),
          );
      }
      if (phase === "night") {
        this._actions.clear();
        this._nightFinished.clear();
        this._verdict = null;
        this._concealed = null;
        this.nightResult = null;
        this.state.players.forEach((p) => {
          p.bubble = "";
          p.bubbleTime = 0;
        });
        this.state.addLog(
          `Night ${this.state.day}. The village returns home.`,
          "system",
        );
      }
      if (phase === "morning" || phase === "end") this._concealed = null;
      this.sceneKey++;
    }
    _start() {
      if (this.state) return "A match is already in progress.";
      if (this.members.length < 4 || this.members.length > 12)
        return "A match needs 4 to 12 players.";
      if (this.members.some((m) => !m.connected || !m.ready))
        return "Every player must be connected and ready.";
      const invalid = this._validateSettings(this.settings);
      if (invalid) return invalid;
      const values = new Uint32Array(1);
      const seed = globalThis.crypto?.getRandomValues
        ? globalThis.crypto.getRandomValues(values)[0]
        : Math.floor(Math.random() * 0x100000000);
      this._seats = new Map(this.members.map((m, i) => [m.id, i]));
      this.state = new GameState({
        ...copy(this.settings),
        online: true,
        revealRoles: false,
        count: this.members.length,
        roster: this.members.map((m) => profile(m)),
        seed,
      });
      this.state.addLog(
        "Welcome to Lantern Hollow. Listen carefully: a confident claim is not proof.",
        "event",
      );
      this.members.forEach((m) => {
        m.ready = false;
      });
      this.paused = false;
      this._lastTime = Number(this._now());
      this._setPhase("reveal");
      return null;
    }
    _advance(force = false) {
      const s = this.state;
      if (!s) return "The match has not started.";
      if (this.paused) return "The match is paused.";
      switch (s.phase) {
        case "reveal":
          this._setPhase("night");
          break;
        case "day":
          this._setPhase("vote");
          break;
        case "vote": {
          this._concealed = copy(s);
          const result = new VotingSystem(s).resolve([...this._votes.values()]);
          this._verdict =
            result.exiled === null ? null : { target: result.exiled };
          this._setPhase("verdict");
          break;
        }
        case "verdict":
          if (this.elapsed < this.duration && !force)
            return "Wait for the verdict to finish.";
          this._concealed = null;
          if (s.winner) this._setPhase("end");
          else this._setPhase("night");
          break;
        case "night": {
          this._concealed = copy(s);
          this.nightResult = new NightActionResolver(s).resolve([
            ...this._actions.values(),
          ]);
          const all = this.nightResult.privateScenesByViewer || {
            0: this.nightResult.privateScenes,
          };
          this._resolveDuration =
            Math.max(
              0,
              ...Object.values(all).map(
                (scenes) => new NightActionSequence(scenes).totalDuration,
              ),
            ) + 0.4;
          this._setPhase("resolve");
          break;
        }
        case "resolve":
          if (this.elapsed < this.duration && !force)
            return "Wait for the night scenes to finish.";
          this._concealed = null;
          if (s.winner) {
            this._setPhase("end");
            break;
          }
          s.day++;
          s.checkWin();
          this._setPhase(s.winner ? "end" : "morning");
          break;
        case "morning":
          this._setPhase("day");
          break;
        default:
          return "This phase cannot advance.";
      }
      return null;
    }
    command(memberId, message) {
      if (!isObject(message) || typeof message.type !== "string")
        return { ok: false, error: "Invalid command." };
      const member = this._member(memberId);
      if (!member || !member.connected)
        return { ok: false, error: "Your seat is disconnected." };
      this.tick(this._now());
      const type = message.type,
        hostOnly = ["settings", "start", "advance", "pause", "rematch", "kick"];
      if (hostOnly.includes(type) && memberId !== this.hostId)
        return { ok: false, error: "Only the host can do that." };
      let error = null;
      const phase = this._phase(),
        mapping = this._mapping(memberId),
        p = mapping ? this.state.player(mapping.own) : null;
      switch (type) {
        case "ready":
          if (!["lobby", "reveal"].includes(phase))
            error = "Ready checks are closed.";
          else if (typeof message.ready !== "boolean")
            error = "Choose a ready status.";
          else {
            member.ready = message.ready;
            if (
              phase === "reveal" &&
              this.members.every((m) => m.connected && m.ready)
            )
              this._setPhase("night");
          }
          break;
        case "settings": {
          if (phase !== "lobby") {
            error = "Settings are locked during a match.";
            break;
          }
          if (!isObject(message.settings)) {
            error = "Invalid settings.";
            break;
          }
          const permitted = [
            "discussion",
            "voting",
            "night",
            "impostorCount",
            "neutralCount",
            "enabled",
          ];
          if (
            Object.keys(message.settings).some((k) => !permitted.includes(k))
          ) {
            error = "Invalid settings.";
            break;
          }
          const settings = { ...this.settings, ...message.settings };
          error = this._validateSettings(settings);
          if (!error) {
            this.settings = copy(settings);
            this.settings.enabled = [...new Set(this.settings.enabled)];
          }
          break;
        }
        case "start":
          error = this._start();
          break;
        case "advance":
          error = this._advance();
          break;
        case "pause":
          if (!this.state || phase === "end")
            error = "There is no active match.";
          else if (typeof message.paused !== "boolean")
            error = "Choose a pause status.";
          else this.paused = message.paused;
          break;
        case "vote": {
          if (phase !== "vote" || !p?.alive || this.paused) {
            error = "Voting is closed.";
            break;
          }
          const target =
            message.target === null
              ? null
              : mapping.toCanonical(message.target);
          if (
            message.target !== null &&
            (target === null || !this.state.player(target)?.alive)
          ) {
            error = "Choose a living player.";
            break;
          }
          if (this._votes.has(p.id)) {
            error = "Your vote is already locked.";
            break;
          }
          this._votes.set(p.id, { actor: p.id, target });
          if (this.state.players.every((q) => !q.alive || this._votes.has(q.id)))
            error = this._advance();
          break;
        }
        case "finish-night":
          if (phase !== "night" || !p?.alive || this.paused)
            error = "Night actions are closed.";
          else if (this._nightFinished.has(p.id))
            error = "Your night is already finished.";
          else {
            this._nightFinished.add(p.id);
            // Disconnected living seats retain their turn until they reconnect
            // or the bounded phase timer expires; leaving cannot force results.
            if (
              this.state.players.every(
                (q) => !q.alive || this._nightFinished.has(q.id),
              )
            )
              error = this._advance();
          }
          break;
        case "night": {
          if (
            phase !== "night" ||
            !p?.alive ||
            this.paused ||
            this._nightFinished.has(p.id)
          ) {
            error = "Night actions are closed.";
            break;
          }
          const mode = message.mode || "ability";
          if (
            !["ability", "kill", "plant", "detonate"].includes(mode) ||
            (mode === "kill" && p.faction !== "impostors") ||
            (["plant", "detonate"].includes(mode) && p.role !== "bomber") ||
            (mode === "ability" && p.role === "impostor")
          ) {
            error = "That ability is unavailable.";
            break;
          }
          if (p.role === "survivor" && mode === "ability" && p.charges <= 0) {
            error = "You have no vests left.";
            break;
          }
          let target =
            mode === "detonate" ? null : mapping.toCanonical(message.target);
          if (
            mode === "detonate" &&
            !p.bombs.some((id) => this.state.player(id)?.alive)
          ) {
            error = "There are no planted bombs.";
            break;
          }
          if (
            mode !== "detonate" &&
            (target === null ||
              !RoleSystem.targets(this.state, p, mode).some(
                (q) => q.id === target,
              ))
          ) {
            error = "Choose a valid target.";
            break;
          }
          if (
            p.role === "sorcerer" &&
            mode === "ability" &&
            !roleKeys.includes(message.guess)
          ) {
            error = "Choose a valid role guess.";
            break;
          }
          const slot = `${p.id}:${mode === "kill" ? "kill" : "ability"}`;
          if (this._actions.has(slot)) {
            error = "Your action is already locked.";
            break;
          }
          const action = { actor: p.id, mode, target };
          if (p.role === "sorcerer" && mode === "ability")
            action.guess = message.guess;
          this._actions.set(slot, action);
          break;
        }
        case "chat":
          if (phase !== "day" || !p?.alive || this.paused)
            error = "Conversation is closed.";
          else if (
            typeof message.text !== "string" ||
            !message.text.trim() ||
            message.text.length > 180 ||
            /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message.text)
          )
            error = "Write a message of 1 to 180 characters.";
          else this.state.addLog(message.text, "chat", p.id);
          break;
        case "rematch":
          if (phase !== "end") {
            error = "Finish this match first.";
            break;
          }
          this.state = null;
          this.duration = 0;
          this.elapsed = 0;
          this.paused = false;
          this._concealed = null;
          this._verdict = null;
          this.nightResult = null;
          this._votes.clear();
          this._actions.clear();
          this._nightFinished.clear();
          this._seats.clear();
          this.members = this.members.filter((m) => !this._kicked.has(m.id));
          this.members.forEach((m) => {
            m.ready = m.id === this.hostId;
          });
          this.sceneKey++;
          break;
        case "kick": {
          const target = this._member(message.memberId);
          if (!target || target.id === this.hostId) {
            error = "Choose another player.";
            break;
          }
          this._kicked.add(target.id);
          target.connected = false;
          target.ready = false;
          this._requestedProfiles.delete(target.id);
          for (const [token, id] of this._tokens)
            if (id === target.id) this._tokens.delete(token);
          if (!this.state)
            this.members = this.members.filter((m) => m.id !== target.id);
          break;
        }
        default:
          error = "Invalid command.";
      }
      if (error) return { ok: false, error };
      this._emit();
      return { ok: true };
    }
    tick(time = this._now()) {
      time = Number(time);
      if (!Number.isFinite(time)) return;
      let delta = Math.max(0, (time - this._lastTime) / 1000);
      this._lastTime = Math.max(this._lastTime, time);
      if (
        !delta ||
        !this.state ||
        this.paused ||
        ["reveal", "end"].includes(this.state.phase)
      )
        return;
      for (let guard = 0; delta > 0 && guard < 100; guard++) {
        const step = Math.min(delta, this.remaining);
        this.elapsed += step;
        delta -= step;
        if (this.remaining <= 0) {
          const error = this._advance(true);
          if (error || ["reveal", "end"].includes(this.state.phase)) break;
        } else break;
      }
      this._emit();
    }
    snapshot(memberId) {
      const member = this._member(memberId);
      if (!member) return null;
      const publicState = this._concealed || this.state;
      const living = publicState?.players.filter((p) => p.alive);
      const packet = {
        type: "snapshot",
        seq: this.seq,
        serverTime: this._lastTime,
        remaining: this.remaining,
        duration: this.duration,
        paused: this.paused,
        room: {
          code: this.code,
          hostId: this.hostId,
          members: this.members.map((m) => ({
            id: m.id,
            ...profile(m),
            ready: m.ready,
            connected: m.connected,
          })),
          settings: copy(this.settings),
          phase: this._phase(),
          aliveCount: living ? living.length : this.members.length,
          finishedCount: living
            ? living.filter((p) => this._nightFinished.has(p.id)).length
            : 0,
        },
        visibleVotes: [],
        sceneElapsed: 0,
        sceneKey: this.sceneKey,
      };
      if (!this.state) return packet;
      const m = this._mapping(memberId),
        s = this._concealed || this.state,
        final = this.state.phase === "end";
      const ref = (id) => m.toLocal(id);
      const ballot = (b) => ({ actor: ref(b.actor), target: ref(b.target) });
      const clue = (c) => {
        const out = {};
        for (const key of ["day", "text", "alignment", "kind", "symbol"])
          if (c[key] !== undefined) out[key] = c[key];
        if (c.target !== undefined) out.target = ref(c.target);
        if (Array.isArray(c.people)) out.people = c.people.map(ref);
        return out;
      };
      const own = s.players[m.own];
      const players = m.ordered.map((id) => {
        const p = s.players[id],
          out = { id: ref(id) };
        for (const key of PUBLIC_PLAYER)
          if (p[key] !== undefined) out[key] = p[key];
        out.alive = p.alive;
        out.publicRole = final
          ? RoleSystem.roles[p.role].name
          : p.publicRole === null
            ? null
            : "Unknown";
        if (final) {
          out.role = p.role;
          out.faction = p.faction;
          out.cover = null;
        } else if (
          id !== m.own &&
          own.faction === "impostors" &&
          p.faction === "impostors"
        )
          out.faction = "impostors";
        if (id === m.own) {
          out.role = final ? p.role : p.role === "insane" ? p.cover : p.role;
          out.cover = null;
          out.faction = p.faction;
          out.charges = p.charges;
          out.bombs = (p.bombs || []).map(ref);
          out.mark = ref(p.mark);
          out.intel = (p.intel || []).map(clue);
          out.known = {};
          for (const [target, value] of Object.entries(p.known || {}))
            out.known[ref(Number(target))] = copy(value);
          out.personalWin = p.personalWin;
        }
        return out;
      });
      const view = {
        config: {
          online: true,
          revealRoles: false,
          count: players.length,
          ...copy(this.settings),
        },
        day: s.day,
        phase: this.state.phase,
        winner: null,
        players,
        log: s.log.map((item) => ({
          day: item.day,
          text: publicText(item),
          kind: item.kind,
          speaker: ref(item.speaker),
          ...(item.gesture ? { gesture: clue(item.gesture) } : {}),
        })),
        history: [],
        ballots: (s.ballots || []).map(ballot),
        events: [],
        pressure: (s.pressure || [])
          .filter((p) => p.day <= s.day)
          .map((p) => ({ target: ref(p.target), day: p.day })),
        lastNight: (s.lastNight || []).map((text) => publicText({ text })),
        publicExposures: (s.publicExposures || []).map((e) => ({
          target: ref(e.target),
          alignment: e.alignment,
        })),
        noDeath: s.noDeath,
        ready: member.ready,
        nightFinished: this._nightFinished.has(m.own),
        ownVote: this._votes.has(m.own) ? ballot(this._votes.get(m.own)) : null,
        ownActions: [...this._actions.values()]
          .filter((a) => a.actor === m.own)
          .map((a) => ({ ...a, actor: 0, target: ref(a.target) })),
        allowedTargets: { ability: [], kill: [], plant: [], detonate: [] },
      };
      view.history = (s.history || []).flatMap((h) =>
        h.type === "death"
          ? [
              {
                day: h.day,
                type: "death",
                target: ref(h.target),
                cause: h.cause === "vote" ? "vote" : "night",
                role: "Unknown",
              },
            ]
          : h.type === "vote"
            ? [
                {
                  day: h.day,
                  type: "vote",
                  ballots: h.ballots.map(ballot),
                  exiled: ref(h.exiled),
                },
              ]
            : [],
      );
      if (this.state.phase === "night" && own.alive && !view.nightFinished)
        for (const mode of ["ability", "kill", "plant"]) {
          if (
            (mode === "kill" && own.faction !== "impostors") ||
            (mode === "plant" && own.role !== "bomber") ||
            (mode === "ability" && own.role === "impostor") ||
            (mode === "ability" && own.role === "survivor" && own.charges <= 0)
          )
            continue;
          view.allowedTargets[mode] = RoleSystem.targets(
            this.state,
            this.state.player(m.own),
            mode,
          ).map((p) => ref(p.id));
        }
      if (final && this.state.winner)
        view.winner = {
          key:
            typeof this.state.winner.key === "number"
              ? ref(this.state.winner.key)
              : this.state.winner.key,
          label: this.state.winner.label,
          winners: this.state.winner.winners.map(ref),
        };
      packet.view = view;
      packet.visibleVotes = [...this._votes.values()].map(ballot);
      if (this.state.phase === "verdict" && this._verdict)
        packet.verdict = {
          target: ref(this._verdict.target),
          elapsed: this.elapsed,
        };
      if (this.state.phase === "resolve") {
        const scenes = this.nightResult?.privateScenesByViewer?.[m.own] ||
          (m.own === 0 ? this.nightResult?.privateScenes : null) || [
            { kind: "sleep", subject: m.own },
          ];
        const scene = (x) => {
          const out = { kind: x.kind, subject: ref(x.subject) };
          for (const key of ["style", "outcome", "icon"])
            if (x[key] !== undefined) out[key] = x[key];
          if (x.healer === "self" || x.healer === "anonymous")
            out.healer = x.healer;
          if (Array.isArray(x.targets)) out.targets = x.targets.map(scene);
          return out;
        };
        packet.scenes = scenes.map(scene);
        packet.sceneElapsed = this.elapsed;
      }
      return packet;
    }
  }
  const exported = { RoomHost };
  if (typeof module !== "undefined" && module.exports)
    module.exports = exported;
  if (typeof window !== "undefined") window.LanternMultiplayer = exported;
})();
