/* Human multiplayer UI. Only RoomHost may resolve rules; the renderer sees a private projection. */
(() => {
  "use strict";
  const C = window.LanternCore,
    L = window.LanternLocale,
    { RoomHost } = window.LanternMultiplayer;
  const { RoomNetwork, generateRoomCode, normalizeRoomCode, isValidRoomCode } =
    window.LanternNetwork;
  const {
    esc,
    iconSVG,
    avatar,
    RoleSystem,
    GameState,
    NightActionSequence,
    VoteOutSequence,
  } = C;
  const t = (s) => L.t(s);
  L.register({
    "Make a room. Invite your friends. Trust nobody.":
      "أنشئ غرفة وادعُ أصدقاءك. لا تثق بأحد.",
    "The room creator must keep this tab open.":
      "يجب أن يُبقي منشئ الغرفة هذه الصفحة مفتوحة.",
    "A connection service helps browsers find each other. Some networks require a relay.":
      "تساعد خدمة اتصال المتصفحات على الوصول لبعضها. قد تحتاج بعض الشبكات إلى خادم ترحيل.",
    "Your character": "شخصيتك",
    "Connection settings": "إعدادات الاتصال",
    "Room code copied.": "تم نسخ رمز الغرفة.",
    "Invite link copied.": "تم نسخ رابط الدعوة.",
    You: "أنت",
    "Rejoin room": "العودة إلى الغرفة",
    "Everyone must be ready.": "يجب أن يكون جميع اللاعبين جاهزين.",
    "At least 4 friends are needed.": "تحتاج إلى ٤ لاعبين على الأقل.",
    "The host left. This room has ended.": "غادر المضيف وانتهت الغرفة.",
    "The connection was lost. Rejoin with the same browser to recover your seat.":
      "انقطع الاتصال. عُد من المتصفح نفسه لاستعادة مكانك.",
    "Only the host can advance the phase.":
      "المضيف وحده يستطيع الانتقال إلى المرحلة التالية.",
    "Room not found. Check the code and make sure the host is online.":
      "الغرفة غير موجودة. تحقق من الرمز ومن اتصال المضيف.",
    "Could not connect. Try another network or configure a TURN relay.":
      "تعذر الاتصال. جرّب شبكة أخرى أو اضبط خادم ترحيل TURN.",
    "A room already uses this code. Create another room.":
      "رمز الغرفة مستخدم. أنشئ غرفة أخرى.",
    "Leave this room?": "مغادرة الغرفة؟",
    "Leaving ends the room for everyone.":
      "عند مغادرتك تنتهي الغرفة لجميع اللاعبين.",
    "Your seat stays reserved while the host is online.":
      "يبقى مكانك محفوظًا ما دام المضيف متصلًا.",
    "You were removed from this room.": "أُزلت من هذه الغرفة.",
    Stay: "البقاء",
    Leave: "مغادرة",
    "Remove player": "إزالة اللاعب",
    "Leave match": "مغادرة المباراة",
    "Ready for the next day": "جاهز لليوم التالي",
    "Waiting for friends": "بانتظار الأصدقاء",
    "No role is revealed when a player dies.": "لا يُكشف دور اللاعب عند موته.",
    "Innocent roles": "أدوار الأبرياء",
    "Impostor roles": "أدوار المنتحلين",
    "Neutral roles": "الأدوار المحايدة",
    "Choose your name before joining.": "اختر اسمك قبل الانضمام.",
  });
  const STYLE = `
  .online-language{position:fixed;inset-inline-end:24px;top:22px;z-index:30;background:#fff2cf;border:3px solid #26324b;border-radius:14px;padding:10px 15px;font-weight:900;color:#26324b;box-shadow:0 4px #26324b}
  [data-online-home] .menu-logo{left:28%;top:27%}.online-menu{position:fixed;right:8%;top:50%;transform:translateY(-50%);width:360px;padding:27px;background:#fff4d5;border:4px solid #26324b;border-radius:28px;box-shadow:0 9px #26324b;color:#26324b}.online-menu .btn{width:100%;margin:7px 0}.online-menu p{font-size:13px;line-height:1.55;margin:10px 0 18px}.room-code-input{font-size:27px!important;letter-spacing:7px;text-align:center;direction:ltr;text-transform:uppercase;width:100%;border:3px solid #26324b!important;border-radius:15px!important;padding:12px!important;background:#fffdf0!important}.online-divider{margin:12px 0;display:flex;gap:10px;align-items:center;font-size:10px;font-weight:900;color:#738095}.online-divider:before,.online-divider:after{content:'';height:2px;background:#d2ccb6;flex:1}.online-small{font-size:11px!important;color:#738095}.online-character{background:none;color:#26324b;padding:8px;display:flex;gap:7px;align-items:center;margin:auto}.online-character>svg{width:33px;height:42px}.online-status{font-size:12px;text-align:center;min-height:24px;padding-top:12px}.online-status.error{color:#ad4658}.online-status.busy{color:#407d94}.online-home-title{font-size:20px;letter-spacing:1px;margin:0}.online-foot{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);font-weight:900;font-size:10px;color:#fff9dd;text-shadow:0 2px #26324b;white-space:nowrap}
  .room-shell{position:fixed;inset:88px 30px 25px;margin:auto;max-width:1060px;max-height:780px;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;color:#26324b}.room-main,.room-options{background:#fff4d5;border:4px solid #26324b;border-radius:25px;box-shadow:0 7px #26324b;padding:24px;overflow:auto}.room-top{display:flex;justify-content:space-between;gap:12px;align-items:center}.room-top h2{font-size:23px;margin:0}.room-code{font-size:38px;letter-spacing:7px;font-weight:900;direction:ltr;display:inline-block;padding:5px 12px;background:#ffe08b;border:3px solid #26324b;border-radius:16px;margin:17px 0 11px}.room-share{display:flex;gap:8px;flex-wrap:wrap}.room-share button{padding:8px 12px;background:#e0e9e5;border:2px solid #26324b;border-radius:11px;font-weight:900;font-size:11px}.room-people{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:23px 0}.room-person{position:relative;display:flex;align-items:center;flex-direction:column;gap:8px;min-height:143px;border:3px solid #d4cfbb;background:#f8ebcd;border-radius:18px;padding:13px 7px}.room-person.ready{border-color:#478e75;background:#d7f0d8}.room-person.offline{opacity:.55}.room-person>svg{height:66px;width:52px}.room-person b{font-size:12px;overflow-wrap:anywhere;text-align:center}.room-person small{font-size:9px;font-weight:900;color:#5d7c74}.room-person .kick{position:absolute;top:4px;right:5px;background:none;padding:3px;color:#93616a}.room-placeholder{border:2px dashed #d4cfbb;display:grid;place-items:center;border-radius:18px;color:#afa991;min-height:143px;font-size:32px}.room-bottom{display:flex;gap:12px;flex-wrap:wrap}.room-bottom .btn{flex:1}.room-note{font-size:11px;color:#6e7e89;line-height:1.6;margin:16px 0 0}.room-options h3{font-size:17px;margin:0 0 18px}.room-options label{display:block;font-size:11px;font-weight:900;margin:13px 0 6px}.room-options select,.room-options input[type=number]{width:100%;background:#fffbed;border:2px solid #a7b1b5;border-radius:10px;padding:9px;color:#26324b}.room-options details{margin-top:18px;border-top:2px solid #ded6c0;padding-top:14px}.room-options summary{font-size:12px;font-weight:900;cursor:pointer}.online-role-options{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:15px}.online-role-options label{display:flex;align-items:center;gap:7px;margin:0;padding:7px 3px;font-size:10px}.online-role-options input{accent-color:#439879}.connection-warning{position:fixed;inset:90px auto auto 50%;transform:translateX(-50%);width:min(590px,88vw);background:#fff0cc;border:3px solid #26324b;border-radius:17px;padding:15px;z-index:40;color:#26324b;font-size:13px;text-align:center;box-shadow:0 4px #26324b}.connection-warning .btn{margin-top:10px;font-size:12px}.room-badge{font-size:10px;direction:ltr;position:fixed;top:83px;left:50%;transform:translateX(-50%);color:#fff3cf;font-weight:900;text-shadow:0 2px #26324b;z-index:2;letter-spacing:2px}.role-ready-wait{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:900;color:#fff0c1}.online-shell-rtl .online-menu{right:auto;left:8%}.online-shell-rtl[data-online-home] .menu-logo{left:72%}.online-shell-rtl .menu-logo strong{letter-spacing:0;font-family:Tahoma,Arial,sans-serif;font-size:80px}.online-shell-rtl .menu-logo span{letter-spacing:0}
  @media(max-width:700px){.online-language{top:15px;inset-inline-end:14px;padding:8px 12px;font-size:12px}[data-online-home] .menu-logo,.online-shell-rtl[data-online-home] .menu-logo{left:50%;top:12%}.online-shell-rtl .menu-logo strong{font-size:54px}.online-menu,.online-shell-rtl .online-menu{left:50%;right:auto;top:auto;bottom:12%;transform:translateX(-50%);width:min(345px,calc(100vw - 34px));padding:19px}.online-menu p{font-size:12px;margin-bottom:10px}.online-menu .btn{padding:11px 14px;font-size:13px}.online-foot{font-size:8px;bottom:15px}.room-shell{inset:73px 12px 17px;display:block;overflow:auto;padding-bottom:10px}.room-main,.room-options{padding:17px;border-radius:21px;overflow:visible}.room-options{margin-top:15px}.room-people{gap:8px;margin:18px 0}.room-person{min-height:124px;padding:9px 3px}.room-person>svg{height:57px;width:45px}.room-person b{font-size:10px}.room-placeholder{min-height:124px}.room-code{font-size:31px}.room-bottom .btn{padding:12px;font-size:12px}.room-top h2{font-size:20px}.room-badge{top:66px;font-size:8px}.connection-warning{top:85px}.room-options .online-role-options{grid-template-columns:repeat(3,1fr)}}
  @media(max-height:700px) and (min-width:700px){.online-menu{padding:18px;top:51%}.online-menu .btn{padding:10px}.room-shell{top:65px}.online-language{top:12px}}
  `;
  class OnlineGame {
    constructor(engine) {
      this.e = engine;
      this.network = null;
      this.authority = null;
      this.memberId = null;
      this.room = null;
      this.status = "";
      this.busy = false;
      this.sceneKey = null;
      this.rolePresented = false;
      this.lastSent = 0;
      const style = document.createElement("style");
      style.textContent = STYLE;
      document.head.append(style);
      if (engine.config.name === "You") engine.config.name = "Friend";
      this.token = this.loadSession()?.token || this.secret();
      this.install();
      L.observe(engine.ui.root);
      this.home();
      this.timer = setInterval(() => {
        if (this.authority) this.authority.tick(Date.now());
      }, 250);
      window.addEventListener("beforeunload", (event) => {
        if (this.authority && this.room?.members.length > 1) {
          event.preventDefault();
          event.returnValue = "";
        }
      });
      window.addEventListener(
        "keydown",
        (event) => {
          if (
            event.code !== "Space" ||
            this.e.screen !== "game" ||
            this.e.ui.modalName ||
            /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)
          )
            return;
          event.preventDefault();
          event.stopImmediatePropagation();
          this.command({ type: "pause", paused: !this.e.paused });
        },
        true,
      );
    }
    secret() {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    loadSession() {
      try {
        return JSON.parse(
          sessionStorage.getItem("lantern-room-session") || "null",
        );
      } catch {
        return null;
      }
    }
    remember(code) {
      try {
        sessionStorage.setItem(
          "lantern-room-session",
          JSON.stringify({ code, token: this.token, host: !!this.authority }),
        );
      } catch {}
    }
    profile() {
      const p = this.e.config;
      return {
        name: p.name.trim() || "Friend",
        color: p.color,
        hat: p.hat,
        glasses: p.glasses,
        accessory: p.accessory,
      };
    }
    get isHost() {
      return !!this.authority;
    }
    languageButton() {
      return `<button class="online-language" data-act="language" data-no-i18n>${L.language === "ar" ? "English" : "العربية"}</button>`;
    }
    install() {
      const e = this.e,
        ui = e.ui;
      const handle = ui.handle.bind(ui);
      ui.handle = (action, data) => {
        if (!this.handle(action, data)) handle(action, data);
        L.refresh(ui.root);
      };
      const change = ui.change.bind(ui);
      ui.change = (node) => {
        if (node.dataset.setting) {
          this.setting(node);
          return;
        }
        if (node.dataset.onlineRole) {
          const enabled = new Set(this.room.settings.enabled);
          node.checked
            ? enabled.add(node.dataset.onlineRole)
            : enabled.delete(node.dataset.onlineRole);
          this.command({
            type: "settings",
            settings: { enabled: [...enabled] },
          });
          return;
        }
        change(node);
      };
      ui.home = () => this.home();
      ui.lobby = () => (this.room ? this.renderRoom() : this.home());
      const actions = ui.refreshActions.bind(ui);
      ui.refreshActions = () => {
        actions();
        const node = ui.root.querySelector("#lh-actions");
        if (!node || !e.state) return;
        if (e.state.phase === "reveal") {
          node.innerHTML = `<span class="role-ready-wait">${iconSVG("heart", 24)} ${t("Waiting for friends")}</span>`;
        } else if (!this.isHost)
          node
            .querySelectorAll('[data-act="advance"]')
            .forEach((button) => button.remove());
      };
      ui.settings = () => this.settings();
      const result = ui.results.bind(ui);
      ui.results = () => {
        result();
        const b = ui.layer.querySelector('[data-act="restart"]');
        if (b) {
          b.textContent = t(this.isHost ? "REMATCH" : "WAITING FOR HOST");
          b.disabled = !this.isHost;
        }
        L.refresh(ui.layer);
      };
      const rawText = e.scene.text.bind(e.scene);
      e.scene.text = (text, ...args) => {
        if (text === "PAUSED" && L.language === "ar" && e.scene.w < 700)
          args[2] = 30;
        return rawText(t(String(text)), ...args);
      };
      e.start = () => this.command({ type: "start" });
      e.update = (dt) => this.update(dt);
      e.advance = () => this.command({ type: "advance" });
      e.chat = (text) =>
        this.command({ type: "chat", text: String(text).trim().slice(0, 180) });
      e.quick = (kind) => {
        const s = e.state,
          q = s?.player(e.selected);
        if (kind === "clue") {
          const c = s?.players[0].intel.at(-1);
          if (c) e.chat(t("My latest clue: ") + t(c.text));
          else ui.toast(t("You have no private clue to share yet."));
        } else if (q?.alive && q.id !== 0)
          e.chat(
            kind === "defend"
              ? t(`I trust ${q.name}. We need stronger evidence before voting.`)
              : t(`I suspect ${q.name}. Can you explain your night action?`),
          );
      };
      e.setVote = (target, lock) => {
        e.vote = target;
        e.voteLocked = false;
        if (lock) this.command({ type: "vote", target });
        ui.refresh();
      };
      e.validTargets = () => {
        if (e.state?.phase !== "night") return [];
        return (e.state.allowedTargets?.[e.nightMode] || [])
          .map((id) => e.state.player(id))
          .filter(Boolean);
      };
      e.confirmNight = () => {
        if (
          e.nightMode !== "detonate" &&
          !e.validTargets().some((p) => p.id === e.nightTarget)
        ) {
          ui.toast(t("Select a valid house first."));
          return;
        }
        this.command({
          type: "night",
          mode: e.nightMode,
          target: e.nightMode === "detonate" ? null : e.nightTarget,
          guess: e.guess,
        });
      };
      e.resolveVote = e.resolveNight = () => {};
    }
    home() {
      const e = this.e,
        ui = e.ui;
      if (this.room) return this.renderRoom();
      ui.closeModal();
      e.state = null;
      e.nightSequence = null;
      e.voteOut = null;
      e.nightBefore = null;
      e.paused = false;
      e.screen = "home";
      e.preview = null;
      e.makePreview();
      ui.root.dataset.screen = "home";
      ui.root.setAttribute("data-online-home", "");
      ui.root.classList.toggle("online-shell-rtl", L.language === "ar");
      ui.root.classList.remove("chat-open");
      const code =
        new URL(location.href).searchParams.get("room") ||
        this.loadSession()?.code ||
        "";
      ui.screen.innerHTML = `${this.languageButton()}<div class="menu-logo"><span>LANTERN</span><strong>HOLLOW</strong></div><section class="online-menu"><h2 class="online-home-title">${t("ONLINE WITH FRIENDS")}</h2><p>${t("Make a room. Invite your friends. Trust nobody.")}</p><button class="online-character" data-act="customize" title="${t("Your character")}">${avatar(this.profile())}<b class="name" data-no-i18n>${esc(this.e.config.name)}</b>${iconSVG("settings", 18)}</button><button class="btn primary" data-act="create-room" ${this.busy ? "disabled" : ""}>${iconSVG("play", 23)} ${t("CREATE ROOM")}</button><div class="online-divider">${t("JOIN ROOM")}</div><input class="room-code-input" id="online-code" aria-label="${t("ROOM CODE")}" maxlength="6" value="${esc(normalizeRoomCode(code))}" placeholder="ABC234" autocomplete="off" spellcheck="false"><button class="btn light" data-act="join-room" ${this.busy ? "disabled" : ""}>${iconSVG("arrow", 23)} ${t("JOIN ROOM")}</button><div class="online-status ${this.busy ? "busy" : this.status ? "error" : ""}" role="status" id="online-status">${esc(t(this.status))}</div><p class="online-small">${t("The room creator must keep this tab open.")}</p></section><span class="online-foot">${t("ONLINE WITH FRIENDS")} · 4–12 ${t("Players")}</span>`;
      ui.screen
        .querySelector("#online-code")
        .addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") this.join();
        });
      L.refresh(ui.root);
    }
    makeNetwork() {
      const NetworkClass = window.LANTERN_NETWORK_CONFIG?.transport !== "webrtc" && window.LanternRelayNetwork && window.LANTERN_NETWORK_CONFIG?.relayUrl ? window.LanternRelayNetwork.RelayRoomNetwork : RoomNetwork;
      const network = new NetworkClass({
        peerOptions: window.LANTERN_NETWORK_CONFIG?.peerOptions || {},
        onStatus: (status, error) => {
          if (network !== this.network) return;
          this.connectionStatus = status;
          if (status === "error") this.failure(error);
          if (status === "disconnected" && this.room) {
            if (error?.code === "host-disconnected" && error.status === 410)
              this.leave("The host left. This room has ended.");
            else this.lost();
          }
        },
        onJoin: (connectionId, hello) => {
          try {
            const memberId = this.authority.join(hello.token, hello.profile);
            network.accept(connectionId, memberId);
            this.sendSnapshot(memberId);
            this.broadcast();
          } catch (error) {
            network.reject(connectionId, error.message);
          }
        },
        onMessage: (packet, memberId) => {
          if (network !== this.network) return;
          if (this.authority) {
            const result = this.authority.command(memberId, packet);
            network.sendTo(memberId, {
              type: "command-result",
              command: packet.type,
              ...result,
            });
            this.broadcast();
          } else this.receive(packet);
        },
        onLeave: (memberId) => {
          if (this.authority) {
            this.authority.disconnect(memberId);
            this.broadcast();
          }
        },
      });
      this.network = network;
      return network;
    }
    async create() {
      if (this.busy) return;
      this.busy = true;
      this.status = "CONNECTING";
      this.home();
      try {
        this.network?.close();
        const code = generateRoomCode();
        const network = this.makeNetwork();
        await network.create(code);
        this.authority = new RoomHost({
          code,
          hostProfile: this.profile(),
          now: () => Date.now(),
          onChange: () => this.broadcast(),
        });
        this.memberId = this.authority.hostId;
        this.busy = false;
        this.rolePresented = false;
        this.remember(code);
        this.broadcast();
      } catch (error) {
        this.busy = false;
        this.authority = null;
        this.failure(error);
        this.home();
      }
    }
    async join() {
      if (this.busy) return;
      const code = normalizeRoomCode(
        this.e.ui.root.querySelector("#online-code")?.value ||
          this.loadSession()?.code ||
          "",
      );
      if (!isValidRoomCode(code)) {
        this.status = "Enter a valid six-character room code.";
        this.home();
        return;
      }
      this.busy = true;
      this.status = "CONNECTING";
      this.home();
      try {
        this.network?.close();
        this.authority = null;
        const network = this.makeNetwork();
        this.memberId = await network.join(code, {
          token: this.token,
          profile: this.profile(),
        });
        this.remember(code);
        this.busy = false;
        this.status = "";
        if (this.room) this.renderRoom();
      } catch (error) {
        this.busy = false;
        this.failure(error);
        this.home();
      }
    }
    failure(error) {
      const code = error?.code || error?.type;
      this.status =
        code === "room-not-found" || code === "peer-unavailable"
          ? "Room not found. Check the code and make sure the host is online."
          : code === "room-exists" || code === "unavailable-id"
            ? "A room already uses this code. Create another room."
            : error?.message ||
              "Could not connect. Try another network or configure a TURN relay.";
      if (this.room) this.lost();
      else if (!this.busy) this.home();
    }
    lost() {
      if (this.authority) {this.leave("The room service disconnected. This room has ended.");return;}
      this.e.paused = true;
      this.connectionLost = true;
      const ui = this.e.ui;
      ui.root.querySelector(".connection-warning")?.remove();
      const node = document.createElement("div");
      node.className = "connection-warning";
      node.innerHTML = `<div>${t("The connection was lost. Rejoin with the same browser to recover your seat.")}</div><button class="btn primary" data-act="reconnect">${t("Rejoin room")}</button><button class="btn light" data-act="leave-room">${t("Leave")}</button>`;
      ui.root.append(node);
    }
    sendSnapshot(id) {
      const packet = this.authority?.snapshot(id);
      if (!packet) return;
      if (id === this.authority.hostId) this.receive(packet);
      else this.network?.sendTo(id, packet);
    }
    broadcast() {
      if (!this.authority || !this.network) return;
      for (const member of this.authority.members)
        if (member.connected) this.sendSnapshot(member.id);
    }
    command(message) {
      if (!this.room) {
        this.e.ui.toast(t("ROOM NOT FOUND"));
        return;
      }
      if (this.authority) {
        const result = this.authority.command(this.memberId, message);
        if (!result.ok) this.e.ui.toast(t(result.error));
        if (result.ok && message.type === "kick")
          this.network.sendTo(message.memberId, { type: "removed" });
        this.broadcast();
        return result;
      }
      if (this.connectionLost) {
        this.lost();
        return;
      }
      this.network.send(message);
    }
    receive(packet) {
      if (packet.type === "room-ended" || packet.type === "removed") {
        this.leave(
          packet.type === "room-ended"
            ? "The host left. This room has ended."
            : "You were removed from this room.",
        );
        return;
      }
      if (packet.type === "command-result") {
        if (!packet.ok) this.e.ui.toast(t(packet.error));
        return;
      }
      if (packet.type !== "snapshot") return;
      this.connectionLost = false;
      this.e.ui.root.querySelector(".connection-warning")?.remove();
      this.room = packet.room;
      this.lastPacket = packet;
      L.setUserNames(this.room.members.map((m) => m.name));
      if (!packet.view) {
        this.rolePresented = false;
        this.resultsPresented = false;
        this.sceneKey = null;
        this.renderRoom();
        return;
      }
      const e = this.e,
        ui = e.ui,
        old = e.state,
        phase = packet.view.phase,
        changed = phase !== old?.phase;
      const view = Object.assign(
        Object.create(GameState.prototype),
        packet.view,
      );
      view.players.forEach((p) => {
        const previous = old?.player(p.id);
        p.x=previous?.x??720;p.y=previous?.y??430;
        p.tx=previous?.tx??720;p.ty=previous?.ty??430;
        p.bubbleTime=p.bubble&&p.bubble!==previous?.bubble?4.5:previous?.bubbleTime||0;
        p.blink=p.id*.43;
      });
      e.state = view;
      e.preview = null;
      e.nightBefore = null;
      e.screen = "game";
      e.paused = packet.paused;
      e.duration = packet.duration;
      e.remaining = packet.remaining;
      e.elapsed = packet.duration - packet.remaining;
      e.visibleVotes = packet.visibleVotes || [];
      e.humanActions = view.ownActions || [];
      if (!old || old.players.length !== view.players.length)
        e.scene.map.layout(view.players);
      else view.players.forEach((p, i) => (p.house = e.scene.map.houses[i]));
      if (changed) {
        e.scene.transition(phase);
        e.selected = null;
        e.playerVisit = null;
        e.scene.effects = [];
        if (phase === "night") {
          e.nightMode =
            view.players[0].faction === "impostors"
              ? "kill"
              : view.players[0].role === "bomber"
                ? "plant"
                : "ability";
          e.nightTarget = null;
        }
        if (phase !== "resolve") e.nightSequence = null;
        if (phase !== "verdict") e.voteOut = null;
        if (phase === "day" || phase === "morning") e.audio.play("morning");
        if (phase === "night") e.audio.play("night");
      }
      if (packet.verdict) {
        if (!e.voteOut || e.voteOut.target !== packet.verdict.target || changed)
          e.voteOut = new VoteOutSequence(
            view.player(packet.verdict.target),
            "Unknown",
          );
        this.animateVote(
          Math.max(0, packet.verdict.elapsed - e.voteOut.elapsed),
        );
      }
      if (phase === "resolve" && packet.scenes) {
        if (this.sceneKey !== packet.sceneKey || !e.nightSequence) {
          e.nightSequence = new NightActionSequence(packet.scenes);
          this.sceneKey = packet.sceneKey;
          e.scene.banner = null;
        }
        this.animateNight(
          Math.max(0, packet.sceneElapsed - e.nightSequence.elapsed),
        );
      }
      if (changed) {
        ui.closeModal();
        ui.root.removeAttribute("data-online-home");
        ui.showGame();
        const badge = document.createElement("div");
        badge.className = "room-badge";
        badge.textContent = this.room.code;
        ui.screen.append(badge);
      } else ui.refresh();
      e.vote = view.ownVote?.target ?? (changed ? null : e.vote);
      e.voteLocked = !!view.ownVote;
      ui.refreshActions();
      if (phase === "reveal" && !this.rolePresented) {
        this.rolePresented = true;
        ui.roleReveal();
      }
      if (phase === "end" && !this.resultsPresented) {
        this.resultsPresented = true;
        ui.results();
      }
      L.refresh(ui.root);
    }
    animateVote(dt) {
      const e = this.e;
      if (!e.voteOut) return;
      for (const event of e.voteOut.update(dt)) {
        if (event === "death") {
          e.audio.impact("attacked");
          e.scene.shake = e.settings.reduced ? 0 : 9;
          e.scene.particles.burst(720, 442, e.voteOut.appearance.color, 26);
        }
      }
    }
    animateNight(dt) {
      const e = this.e;
      if (!e.nightSequence) return;
      for (const event of e.nightSequence.update(dt)) {
        if (event.type === "impact")
          e.audio.impact(
            event.scene.style === "blast" || event.scene.kind === "blast"
              ? "explosion"
              : "attacked",
          );
        if (event.type === "heal") e.audio.play("morning");
      }
    }
    update(dt) {
      const e = this.e;
      if (!e.state || e.screen !== "game" || e.paused || this.connectionLost)
        return;
      e.remaining = Math.max(0, e.remaining - dt);
      if (e.state.phase === "verdict") this.animateVote(dt);
      if (e.state.phase === "resolve") this.animateNight(dt);
      e.ui.tick();
    }
    renderRoom() {
      if (!this.room) return this.home();
      const ui = this.e.ui,
        room = this.room;
      const signature = JSON.stringify(room) + L.language + this.memberId;
      if (signature === this.lobbySignature && this.e.screen === "room") return;
      this.lobbySignature = signature;
      ui.closeModal();
      this.e.state = null;
      this.e.preview = null;
      this.e.makePreview();
      this.e.screen = "room";
      this.e.paused = false;
      ui.root.dataset.screen = "lobby";
      ui.root.removeAttribute("data-online-home");
      ui.root.classList.toggle("online-shell-rtl", L.language === "ar");
      const me = room.members.find((m) => m.id === this.memberId),
        canStart =
          room.members.length >= 4 &&
          room.members.every((m) => m.ready && m.connected),
        settings = room.settings,
        maxBad = Math.max(1, Math.floor((room.members.length - 1) / 2));
      const option = (value, label, current) =>
        `<option value="${value}" ${String(value) === String(current) ? "selected" : ""}>${esc(t(label))}</option>`;
      ui.screen.innerHTML = `${this.languageButton()}<main class="room-shell"><section class="room-main"><div class="room-top"><h2>${t("Waiting for friends")}</h2><button class="small light" data-act="leave-room" title="${t("LEAVE ROOM")}">${iconSVG("back", 23)}</button></div><div class="room-code" data-no-i18n>${esc(room.code)}</div><div class="room-share"><button data-act="copy-code">${t("COPY CODE")}</button><button data-act="copy-link">${t("COPY LINK")}</button></div><div class="room-people">${room.members.map((member) => `<div class="room-person ${member.ready ? "ready" : ""} ${member.connected ? "" : "offline"}">${this.isHost && member.id !== room.hostId ? `<button class="kick" data-act="kick" data-member="${esc(member.id)}" title="${t("Remove player")}">×</button>` : ""}${avatar(member)}<b class="name" data-no-i18n>${esc(member.name)}${member.id === this.memberId ? " · " + t("You") : ""}</b><small>${member.id === room.hostId ? t("HOST") + " · " : ""}${t(!member.connected ? "DISCONNECTED" : member.ready ? "READY" : "NOT READY")}</small></div>`).join("")}${Array.from({ length: Math.max(0, 4 - room.members.length) }, () => '<div class="room-placeholder">+</div>').join("")}</div><div class="room-bottom"><button class="btn ${me?.ready ? "light" : "primary"}" data-act="ready">${iconSVG(me?.ready ? "check" : "heart", 22)} ${t(me?.ready ? "READY" : "NOT READY")}</button>${this.isHost ? `<button class="btn primary" data-act="start-match" ${canStart ? "" : "disabled"}>${iconSVG("play", 22)} ${t("START MATCH")}</button>` : `<span class="room-note">${t("WAITING FOR HOST")}</span>`}</div><p class="room-note">${t(room.members.length < 4 ? "At least 4 friends are needed." : !canStart ? "Everyone must be ready." : "The room creator must keep this tab open.")}</p><p class="room-note">${t("No role is revealed when a player dies.")}</p></section><aside class="room-options"><h3>${t("CUSTOM GAME")}</h3><label>${t("IMPOSTORS")}</label><select data-setting="impostorCount" aria-label="${t("IMPOSTORS")}" ${this.isHost ? "" : "disabled"}>${option("random", "RANDOM", settings.impostorCount)}${Array.from({ length: maxBad }, (_, i) => option(i + 1, String(i + 1), settings.impostorCount)).join("")}</select><label>${t("NEUTRALS")}</label><select data-setting="neutralCount" aria-label="${t("NEUTRALS")}" ${this.isHost ? "" : "disabled"}>${[0, 1, 2, 3].map((n) => option(n, String(n), settings.neutralCount)).join("")}</select>${[
        ["discussion", "DAY TIMER"],
        ["voting", "VOTE TIMER"],
        ["night", "NIGHT TIMER"],
      ]
        .map(
          ([key, label]) =>
            `<label>${t(label)} · ${t("seconds")}</label><input type="number" min="5" max="600" data-setting="${key}" value="${settings[key]}" aria-label="${t(label)}" ${this.isHost ? "" : "disabled"}>`,
        )
        .join(
          "",
        )}<details><summary>${t("ENABLED ROLES")}</summary><div class="online-role-options">${Object.entries(
        RoleSystem.roles,
      )
        .map(
          ([key, role]) =>
            `<label title="${esc(t(role.description))}"><input type="checkbox" data-online-role="${key}" ${settings.enabled.includes(key) ? "checked" : ""} ${this.isHost ? "" : "disabled"}>${iconSVG(key, 20)}${esc(t(role.name))}</label>`,
        )
        .join("")}</div></details></aside></main>`;
      L.refresh(ui.root);
    }
    setting(node) {
      const key = node.dataset.setting,
        value =
          key === "impostorCount" && node.value === "random"
            ? "random"
            : Number(node.value);
      this.command({ type: "settings", settings: { [key]: value } });
    }
    async copy(kind) {
      const code = this.room.code;
      const url = new URL(location.href);
      url.searchParams.set("room", code);
      url.hash = "";
      const value = kind === "code" ? code : url.href;
      try {
        await navigator.clipboard.writeText(value);
        this.e.ui.toast(
          t(kind === "code" ? "Room code copied." : "Invite link copied."),
        );
      } catch {
        this.e.ui.modal(
          t("COPY LINK"),
          `<input readonly value="${esc(value)}" dir="ltr" style="width:100%" onclick="this.select()">`,
        );
      }
    }
    settings() {
      const e = this.e;
      e.ui.modal(
        t("Settings"),
        `<div data-online-settings><h2>${t("Settings")}</h2><button class="btn light" data-act="language" data-no-i18n>${L.language === "ar" ? "English" : "العربية"}</button><div class="field"><label>${t("Sound volume")}</label><input id="lh-volume" type="range" min="0" max="100" value="${e.settings.volume * 100}"></div><div class="divider"></div><label>${t("Mute all sound")} <input id="lh-sound" type="checkbox" ${e.settings.muted ? "checked" : ""}></label><div class="divider"></div><label>${t("Reduce decorative motion")} <input id="lh-motion" type="checkbox" ${e.settings.reduced ? "checked" : ""}></label><p>${t("The room creator must keep this tab open.")}</p><p class="tiny">${t("A connection service helps browsers find each other. Some networks require a relay.")}</p><button class="btn light wide" data-act="resetcamera">${t("Reset camera")}</button></div>`,
      );
    }
    leave(message = "") {
      const wasHost = this.isHost,
        network = this.network;
      if (wasHost) network?.broadcast(() => ({ type: "room-ended" }));
      this.room = null;
      this.authority = null;
      this.network = null;
      if (wasHost) setTimeout(() => network?.close(), 60);
      else network?.close();
      this.memberId = null;
      this.rolePresented = false;
      this.resultsPresented = false;
      this.lobbySignature = null;
      this.connectionLost = false;
      this.e.ui.root.querySelector(".connection-warning")?.remove();
      this.status = message;
      this.busy = false;
      this.home();
    }
    handle(action, data) {
      const e = this.e,
        ui = e.ui;
      switch (action) {
        case "language": {
          const inSettings = !!ui.layer.querySelector("[data-online-settings]");
          L.setLanguage(L.language === "ar" ? "en" : "ar");
          ui.root.classList.toggle("online-shell-rtl", L.language === "ar");
          if (this.room && !e.state) {
            this.lobbySignature = null;
            this.renderRoom();
          } else if (!this.room) this.home();
          else {
            ui.refresh();
            if (inSettings) this.settings();
            L.refresh(ui.root);
          }
          return true;
        }
        case "create-room":
          this.create();
          return true;
        case "join-room":
          this.join();
          return true;
        case "reconnect":
          this.room = null;
          this.connectionLost = false;
          this.join();
          return true;
        case "copy-code":
          this.copy("code");
          return true;
        case "copy-link":
          this.copy("link");
          return true;
        case "ready": {
          const me = this.room.members.find((m) => m.id === this.memberId);
          this.command({ type: "ready", ready: !me?.ready });
          return true;
        }
        case "start-match":
          this.command({ type: "start" });
          return true;
        case "kick":
          this.command({ type: "kick", memberId: data.member });
          return true;
        case "revealcontinue":
          ui.closeModal();
          this.command({ type: "ready", ready: true });
          return true;
        case "pause":
          this.command({ type: "pause", paused: !e.paused });
          return true;
        case "advance":
          if (!this.isHost) {
            ui.toast(t("Only the host can advance the phase."));
            return true;
          }
          this.command({ type: "advance" });
          return true;
        case "restart":
          ui.closeModal();
          this.command({ type: "rematch" });
          return true;
        case "home":
        case "menuconfirm":
        case "leave-room":
          if (this.room) {
            ui.modal(
              t("Leave this room?"),
              `<h2>${t("Leave this room?")}</h2><p>${t(this.isHost ? "Leaving ends the room for everyone." : "Your seat stays reserved while the host is online.")}</p><div class="two"><button class="btn light" data-act="closemodal">${t("Stay")}</button><button class="btn primary" data-act="leave-confirm">${t("Leave")}</button></div>`,
            );
          } else this.home();
          return true;
        case "leave-confirm":
          this.leave();
          return true;
        case "lobby":
        case "randomize":
          this.home();
          return true;
      }
      return false;
    }
  }
  window.OnlineGame = OnlineGame;
})();
