/* Lantern Hollow browser transport. Requires the locally vendored PeerJS 1.5.5. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LanternNetwork = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const ROOM_PREFIX = "lantern-hollow-v3-";
  const PROTOCOL = "lantern-hollow-v3";
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const IDENTITY_FIELDS = [
    "actor",
    "actorId",
    "memberId",
    "playerId",
    "sender",
    "senderId",
  ];
  const noop = function () {};
  const plain = (value) =>
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
  const isValidRoomCode = (code) =>
    typeof code === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(code);
  const normalizeRoomCode = (code) =>
    String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]/g, "");
  function generateRoomCode() {
    const bytes = new Uint8Array(6);
    if (!root.crypto || !root.crypto.getRandomValues)
      throw error(
        "secure-random-unavailable",
        "Secure randomness is unavailable in this browser.",
      );
    root.crypto.getRandomValues(bytes);
    // There are exactly 32 symbols, so this introduces no modulo bias.
    return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join(
      "",
    );
  }
  function error(code, message) {
    const result = new Error(message);
    result.code = code;
    result.type = code;
    return result;
  }
  function admissionError(value) {
    const code =
      typeof value?.code === "string" && /^[a-z0-9-]{1,64}$/.test(value.code)
        ? value.code
        : "join-rejected";
    const message = typeof value === "string" ? value : value?.message;
    return error(
      code,
      typeof message === "string"
        ? message.slice(0, 500)
        : "Unable to join this room.",
    );
  }
  function peerError(value) {
    const type = value?.type || value?.code;
    const messages = {
      "unavailable-id": [
        "room-exists",
        "That room code is already in use. Create another room.",
      ],
      "peer-unavailable": [
        "room-not-found",
        "Room not found. Check the code and make sure the host is online.",
      ],
      "browser-incompatible": [
        "browser-incompatible",
        "This browser does not support the required WebRTC connection.",
      ],
      network: [
        "signaling-unavailable",
        "Cannot reach the connection service. Check your internet connection.",
      ],
      "server-error": [
        "signaling-unavailable",
        "Cannot reach the connection service. Check your internet connection.",
      ],
      "socket-error": [
        "signaling-unavailable",
        "The connection service is unavailable. Try connecting again.",
      ],
      "socket-closed": [
        "signaling-unavailable",
        "The connection service closed. Try connecting again.",
      ],
      webrtc: [
        "webrtc-error",
        "Browsers could not establish a connection. Try another network or configure a TURN relay.",
      ],
    };
    const mapped = messages[type];
    return mapped
      ? error(mapped[0], mapped[1])
      : error(
          "connection-error",
          "Unable to establish the room connection. Try again.",
        );
  }
  function jsonObject(value, limit) {
    if (!plain(value)) return null;
    try {
      const serialized = JSON.stringify(value);
      if (serialized.length > limit) return null;
      return JSON.parse(serialized);
    } catch (_) {
      return null;
    }
  }
  function helloValue(value) {
    if (
      !plain(value) ||
      typeof value.token !== "string" ||
      !value.token.trim() ||
      value.token.length > 256
    )
      return null;
    const profile = jsonObject(value.profile, 4096);
    return profile ? { token: value.token, profile } : null;
  }

  class RoomNetwork {
    constructor({
      onMessage = noop,
      onStatus = noop,
      onJoin = noop,
      onLeave = noop,
      peerOptions = {},
      timeoutMs,
    } = {}) {
      const config = root.LANTERN_NETWORK_CONFIG || {};
      this.onMessage = onMessage;
      this.onStatus = onStatus;
      this.onJoin = onJoin;
      this.onLeave = onLeave;
      this.peerOptions = { ...(config.peerOptions || {}), ...peerOptions };
      this.timeoutMs = Math.max(
        20,
        Number(timeoutMs || config.timeoutMs) || 15000,
      );
      this.peer = null;
      this.status = "disconnected";
      this.mode = null;
      this.code = null;
      this.memberId = null;
      this.connections = new Map();
      this.members = new Map();
      this._timers = new Set();
      this._connectionCounter = 0;
      this._closed = true;
      this._pending = null;
      this._hostConnection = null;
      this._signalingTimer = null;
      this._reconnectTimer = null;
    }
    create(code) {
      return this._begin("host", code, null);
    }
    join(code, hello) {
      const validHello = helloValue(hello);
      if (!validHello)
        return this._invalid(
          "invalid-hello",
          "A player profile and reconnect token are required.",
        );
      return this._begin("client", code, validHello);
    }
    _invalid(code, message) {
      const failure = error(code, message);
      this._status("error", failure);
      return Promise.reject(failure);
    }
    _begin(mode, code, hello) {
      if (!isValidRoomCode(code))
        return this._invalid(
          "invalid-code",
          "Enter a six-character room code using letters and numbers.",
        );
      if (typeof root.Peer !== "function")
        return this._invalid(
          "peerjs-unavailable",
          "The connection library could not load. Reload the page and try again.",
        );
      this._stop(
        error("connection-closed", "The previous connection was closed."),
      );
      this.mode = mode;
      this.code = code;
      this.memberId = mode === "host" ? "host" : null;
      this._closed = false;
      this._status("connecting");
      const promise = new Promise((resolve, reject) => {
        this._pending = { resolve, reject };
      });
      this._operationTimer = this._timer(
        () =>
          this._fail(
            error(
              "connection-timeout",
              "Connection timed out. Check the code and network, then try again.",
            ),
          ),
        this.timeoutMs,
      );
      let peer;
      try {
        peer =
          mode === "host"
            ? new root.Peer(ROOM_PREFIX + code, this.peerOptions)
            : new root.Peer(this.peerOptions);
        this.peer = peer;
        peer.on("open", () => {
          if (this._closed || this.peer !== peer) return;
          this._clearTimer(this._signalingTimer);
          this._clearTimer(this._reconnectTimer);
          this._signalingTimer = this._reconnectTimer = null;
          if (mode === "host") {
            this._status("open");
            this._settle(code);
          } else if (this._hostConnection) {
            if (this.memberId) this._status("open");
          } else {
            try {
              // Do not put the secret reconnect token in signaling metadata.
              const connection = peer.connect(ROOM_PREFIX + code, {
                serialization: "json",
                reliable: true,
                metadata: { protocol: PROTOCOL },
              });
              this._attach(connection, hello);
            } catch (failure) {
              this._fail(peerError(failure));
            }
          }
        });
        peer.on("connection", (connection) => {
          if (this._closed || this.peer !== peer || mode !== "host") {
            connection.close();
            return;
          }
          this._attach(connection, null);
        });
        peer.on("call", (call) => call.close());
        peer.on("error", (failure) => {
          if (this._closed || this.peer !== peer) return;
          // Per-connection errors are handled on DataConnection. An unrelated
          // failed inbound negotiation must not destroy an established host.
          if (
            mode === "host" &&
            !this._pending &&
            ["peer-unavailable", "webrtc"].includes(failure?.type)
          )
            return;
          this._fail(peerError(failure));
        });
        peer.on("disconnected", () => {
          if (this._closed || this.peer !== peer) return;
          if (this._pending) {
            this._fail(peerError({ type: "network" }));
            return;
          }
          this._status(
            "connecting",
            error(
              "signaling-reconnecting",
              "Reconnecting to the connection service. Existing players may remain connected.",
            ),
          );
          if (!this._signalingTimer)
            this._signalingTimer = this._timer(() => {
              this._signalingTimer = null;
              this._status(
                "error",
                error(
                  "signaling-unavailable",
                  "Cannot reconnect to the connection service. Existing players may remain connected.",
                ),
              );
            }, this.timeoutMs);
          this._clearTimer(this._reconnectTimer);
          this._reconnectTimer = this._timer(
            () => {
              this._reconnectTimer = null;
              try {
                if (!peer.destroyed) peer.reconnect();
              } catch (failure) {
                this._fail(peerError(failure));
              }
            },
            Math.min(1000, this.timeoutMs / 4),
          );
        });
        peer.on("close", () => {
          if (this._closed || this.peer !== peer) return;
          const failure = error(
            mode === "client" ? "host-disconnected" : "room-disconnected",
            mode === "client"
              ? "The host disconnected. Rejoin when the host is online."
              : "The room connection closed.",
          );
          const pending = !!this._pending;
          this._stop(failure);
          this._status(pending ? "error" : "disconnected", failure);
        });
      } catch (failure) {
        this._fail(peerError(failure));
      }
      return promise;
    }
    _attach(connection, hello) {
      const entry = {
        id: "connection-" + ++this._connectionCounter,
        connection,
        memberId: null,
        hello: null,
        closed: false,
        rejected: false,
      };
      this.connections.set(entry.id, entry);
      if (this.mode === "client") this._hostConnection = entry;
      entry.timer = this._timer(() => {
        if (this.mode === "client")
          this._fail(
            error(
              "connection-timeout",
              "Connection timed out. Check the code and network, then try again.",
            ),
          );
        else
          this.reject(
            entry.id,
            error(
              "connection-timeout",
              "Connection timed out. Try joining again.",
            ),
          );
      }, this.timeoutMs);
      connection.on("open", () => {
        if (this._closed || entry.closed) return;
        if (this.mode === "client")
          this._sendPacket(entry, { type: "hello", hello });
      });
      connection.on("data", (packet) => this._receive(entry, packet));
      connection.on("error", (failure) => {
        if (this._closed || entry.closed) return;
        if (this.mode === "client") this._fail(peerError(failure));
        else this._drop(entry);
      });
      connection.on("close", () => {
        if (this._closed || entry.closed) return;
        if (this.mode === "client") {
          const failure = error(
            "host-disconnected",
            "The host disconnected. Rejoin when the host is online.",
          );
          const pending = !!this._pending;
          this._stop(failure);
          this._status(pending ? "error" : "disconnected", failure);
        } else this._drop(entry);
      });
      return entry;
    }
    _receive(entry, packet) {
      if (this._closed || entry.closed || entry.rejected) return;
      if (
        !plain(packet) ||
        packet.protocol !== PROTOCOL ||
        typeof packet.type !== "string"
      ) {
        this._badPacket(entry);
        return;
      }
      if (this.mode === "host") {
        if (!entry.memberId) {
          const hello =
            packet.type === "hello" && !entry.hello
              ? helloValue(packet.hello)
              : null;
          if (!hello) {
            this._badPacket(entry);
            return;
          }
          entry.hello = hello;
          try {
            Promise.resolve(this.onJoin(entry.id, hello)).catch((failure) =>
              this.reject(entry.id, admissionError(failure)),
            );
          } catch (failure) {
            this.reject(entry.id, admissionError(failure));
          }
          return;
        }
        if (packet.type !== "message") {
          this._badPacket(entry);
          return;
        }
        const message = jsonObject(packet.message, 16384);
        if (!message) {
          this._badPacket(entry);
          return;
        }
        for (const key of IDENTITY_FIELDS) delete message[key];
        // Identity comes exclusively from this authenticated DataConnection.
        this.onMessage(message, entry.memberId);
      } else {
        if (packet.type === "rejected") {
          this._fail(admissionError(packet.error));
          return;
        }
        if (!this.memberId) {
          if (
            packet.type !== "accepted" ||
            !this._validMemberId(packet.memberId)
          ) {
            this._badPacket(entry);
            return;
          }
          this.memberId = packet.memberId;
          entry.memberId = packet.memberId;
          this._clearTimer(entry.timer);
          this._status("open");
          this._settle(this.memberId);
          return;
        }
        if (packet.type !== "message") {
          this._badPacket(entry);
          return;
        }
        const message = jsonObject(packet.message, 262144);
        if (!message) {
          this._badPacket(entry);
          return;
        }
        this.onMessage(message, "host");
      }
    }
    _validMemberId(memberId) {
      return (
        typeof memberId === "string" &&
        memberId.length > 0 &&
        memberId.length <= 128 &&
        memberId !== "host"
      );
    }
    accept(connectionId, memberId) {
      const entry = this.connections.get(connectionId);
      if (
        this.mode !== "host" ||
        !entry ||
        entry.closed ||
        entry.rejected ||
        !entry.hello ||
        entry.memberId
      )
        return false;
      if (!this._validMemberId(memberId)) {
        this.reject(
          connectionId,
          error("join-rejected", "Unable to join this room."),
        );
        return false;
      }
      const previous = this.members.get(memberId);
      entry.memberId = memberId;
      this.members.set(memberId, entry);
      this._clearTimer(entry.timer);
      // The token was validated by RoomHost.join. Replacing a stale connection
      // must not disconnect the newly authenticated incarnation of that seat.
      if (previous && previous !== entry) this._drop(previous, true);
      return this._sendPacket(entry, { type: "accepted", memberId });
    }
    reject(connectionId, failure) {
      const entry = this.connections.get(connectionId);
      if (
        this.mode !== "host" ||
        !entry ||
        entry.closed ||
        entry.rejected ||
        entry.memberId
      )
        return false;
      const rejection = admissionError(failure);
      this._sendPacket(entry, {
        type: "rejected",
        error: { code: rejection.code, message: rejection.message },
      });
      entry.rejected = true;
      this._clearTimer(entry.timer);
      // Give the reliable data channel a chance to deliver the rejection.
      this._timer(() => this._drop(entry), 30);
      return true;
    }
    send(message) {
      if (this.mode !== "client" || !this.memberId || this._closed)
        return false;
      const payload = jsonObject(message, 16384);
      return (
        !!payload &&
        this._sendPacket(this._hostConnection, {
          type: "message",
          message: payload,
        })
      );
    }
    sendTo(memberId, message) {
      if (this.mode !== "host" || this._closed) return false;
      const entry = this.members.get(memberId),
        payload = jsonObject(message, 262144);
      return (
        !!entry &&
        !!payload &&
        this._sendPacket(entry, { type: "message", message: payload })
      );
    }
    broadcast(factory) {
      if (this.mode !== "host" || this._closed || typeof factory !== "function")
        return 0;
      let count = 0;
      for (const memberId of Array.from(this.members.keys())) {
        const message = factory(memberId);
        if (message != null && this.sendTo(memberId, message)) count++;
      }
      return count;
    }
    _sendPacket(entry, packet) {
      if (!entry || entry.closed || !entry.connection.open || this._closed)
        return false;
      try {
        entry.connection.send({ protocol: PROTOCOL, ...packet });
        return true;
      } catch (failure) {
        if (this.mode === "client") this._fail(peerError(failure));
        else this._drop(entry);
        return false;
      }
    }
    _badPacket(entry) {
      if (this.mode === "client")
        this._fail(
          error(
            "invalid-packet",
            "The room sent an invalid connection message.",
          ),
        );
      else if (entry.memberId) this._drop(entry);
      else
        this.reject(
          entry.id,
          error(
            "invalid-hello",
            "Invalid room handshake. Reload the page and try again.",
          ),
        );
    }
    _drop(entry, suppressLeave = false) {
      if (!entry || entry.closed) return;
      entry.closed = true;
      this._clearTimer(entry.timer);
      this.connections.delete(entry.id);
      const isCurrent =
        entry.memberId && this.members.get(entry.memberId) === entry;
      if (isCurrent) this.members.delete(entry.memberId);
      try {
        entry.connection.close();
      } catch (_) {}
      if (isCurrent && !suppressLeave && !this._closed)
        this.onLeave(entry.memberId);
    }
    _status(status, failure) {
      this.status = status;
      this.onStatus(status, failure);
    }
    _settle(value) {
      this._clearTimer(this._operationTimer);
      if (this._pending) {
        const pending = this._pending;
        this._pending = null;
        pending.resolve(value);
      }
    }
    _timer(callback, delay) {
      const timer = setTimeout(() => {
        this._timers.delete(timer);
        callback();
      }, delay);
      this._timers.add(timer);
      return timer;
    }
    _clearTimer(timer) {
      if (timer != null) {
        clearTimeout(timer);
        this._timers.delete(timer);
      }
    }
    _fail(failure) {
      this._stop(failure);
      this._status("error", failure);
    }
    _stop(failure) {
      this._closed = true;
      for (const timer of this._timers) clearTimeout(timer);
      this._timers.clear();
      this._signalingTimer = this._reconnectTimer = null;
      if (this._pending) {
        const pending = this._pending;
        this._pending = null;
        pending.reject(failure);
      }
      for (const entry of this.connections.values()) this._drop(entry, true);
      this.connections.clear();
      this.members.clear();
      this._hostConnection = null;
      const peer = this.peer;
      this.peer = null;
      if (peer) {
        try {
          peer.destroy();
        } catch (_) {}
      }
      this.memberId = null;
    }
    close() {
      this._stop(error("connection-closed", "The connection was closed."));
      this._status("disconnected");
    }
  }
  RoomNetwork.isValidRoomCode = isValidRoomCode;
  RoomNetwork.generateRoomCode = generateRoomCode;
  return {
    RoomNetwork,
    ROOM_PREFIX,
    PROTOCOL,
    ALPHABET,
    generateRoomCode,
    isValidRoomCode,
    normalizeRoomCode,
  };
});
