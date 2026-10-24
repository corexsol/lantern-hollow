/* Lantern Hollow HTTPS transport. The remote service only routes authenticated mailboxes. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LanternRelayNetwork = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const noop = function () {};
  const plain = value => !!value && typeof value === "object" && !Array.isArray(value);
  const validCode = code => typeof code === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(code);
  const validMember = id => typeof id === "string" && id !== "host" && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
  const identityFields = ["actor", "actorId", "memberId", "playerId", "sender", "senderId"];
  const PACKET_ID = "__lanternRelayPacketId";
  const DEDUPE_MS = 120000;
  const DEDUPE_MAX = 8192;
  const transient = error => !error.status || [408, 425, 429].includes(error.status) || error.status >= 500;
  function failure(code, message, status) { return Object.assign(new Error(message), { code, type: code, status }); }
  function payload(value, maximum) { if (!plain(value)) return null; try { const json = JSON.stringify(value); return new TextEncoder().encode(json).length <= maximum ? JSON.parse(json) : null; } catch (_) { return null; } }
  function admissionError(value) { return { code: /^[a-z0-9-]{1,64}$/.test(value?.code || "") ? value.code : "join-rejected", message: String(typeof value === "string" ? value : value?.message || "Unable to join this room.").slice(0, 500) }; }

  class RelayRoomNetwork {
    constructor({ onMessage = noop, onStatus = noop, onJoin = noop, onLeave = noop, relayUrl, timeoutMs, pollMs, origin } = {}) {
      const config = root.LANTERN_NETWORK_CONFIG || {};
      this.url = String(relayUrl || config.relayUrl || "").replace(/\/$/, "");
      this.timeoutMs = Math.max(1000, Number(timeoutMs || config.timeoutMs) || 20000);
      this.pollMs = Math.max(25, Number(pollMs || config.pollMs) || 650);
      this.origin = origin; // Node integration clients supply Origin; browsers set it themselves.
      Object.assign(this, { onMessage, onStatus, onJoin, onLeave });
      this.mode = null; this.code = null; this.memberId = null; this.status = "disconnected";
      this.connections = new Map(); this.members = new Map();
      this._snapshots = new Map();
      this._received = new Map();
      this._closed = true; this._generation = 0; this._chain = Promise.resolve(); this._queued = 0;
      this._jobs = []; this._activeLanes = new Set(); this._activeWrites = 0;
    }
    create(code) { return this._begin("host", code); }
    join(code, hello) {
      if (!plain(hello) || typeof hello.token !== "string" || hello.token.length < 8 || hello.token.length > 256 || !payload(hello.profile, 4096))
        return this._invalid("invalid-hello", "A player profile and reconnect token are required.");
      return this._begin("client", code, { token: hello.token, profile: payload(hello.profile, 4096) });
    }
    _invalid(code, message) { const error = failure(code, message); this._status("error", error); return Promise.reject(error); }
    async _begin(mode, code, hello) {
      if (!validCode(code)) return this._invalid("invalid-code", "Enter a six-character room code using letters and numbers.");
      let url;
      try { url = new URL(this.url); } catch (_) { return this._invalid("relay-unavailable", "The room service address is not configured."); }
      if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
        return this._invalid("relay-unavailable", "The room service requires HTTPS.");
      if (!this._closed) await this.close();
      this._generation++; const generation = this._generation;
      this._closed = false; this.mode = mode; this.code = code; this.memberId = mode === "host" ? "host" : null;
      this.secret = null; this.cursor = 0; this._lastSuccess = Date.now(); this._queued = 0; this._chain = Promise.resolve();
      this.connections.clear(); this.members.clear(); this._snapshots.clear(); this._received.clear(); this._status("connecting");
      const pending = new Promise((resolve, reject) => { this._pending = { resolve, reject }; });
      this._operationTimer = setTimeout(() => this._fail(failure("connection-timeout", "Connection timed out. Check the code and network, then try again.")), this.timeoutMs);
      try {
        const response = await this._request(mode === "host" ? "create" : "join", hello || {}, { code, secret: null });
        if (this._closed || generation !== this._generation) return pending;
        this.secret = response.secret; this.connectionId = response.connectionId;
        this.leaseMs = Math.max(10000, Number(response.leaseMs) || 90000);
        if (typeof this.secret !== "string" || this.secret.length < 32) throw failure("invalid-response", "The room service returned an invalid response.");
        if (mode === "host") { this._status("open"); this._settle(code); }
        this._schedule(0, generation);
      } catch (error) { if (generation === this._generation && !this._closed) this._fail(error); }
      return pending;
    }
    async _request(action, data, { code = this.code, secret = this.secret, keepalive = false } = {}) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 12000));
      try {
        const response = await root.fetch(`${this.url}/v1/rooms/${code}/${action}`, {
          method: "POST", credentials: "omit", cache: "no-store", signal: controller.signal, keepalive,
          headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}), ...(this.origin ? { Origin: this.origin } : {}) },
          body: JSON.stringify(data),
        });
        let value; try { value = await response.json(); } catch (_) { throw failure("relay-unavailable", "The room service is unavailable.", response.status); }
        if (!response.ok) throw failure(value.error?.code || "relay-unavailable", value.error?.message || "The room service is unavailable.", response.status);
        return value;
      } catch (error) {
        if (error.code && error.type) throw error;
        throw failure("relay-unavailable", "Cannot reach the room service. Reconnecting…");
      } finally { clearTimeout(timer); }
    }
    _schedule(delay, generation = this._generation) {
      clearTimeout(this._pollTimer);
      if (!this._closed) this._pollTimer = setTimeout(() => this._poll(generation), delay);
    }
    async _poll(generation) {
      if (this._closed || generation !== this._generation) return;
      try {
        const response = await this._request("poll", { after: this.cursor });
        if (this._closed || generation !== this._generation) return;
        this._lastSuccess = Date.now(); this._pollFailures = 0;
        if (this.memberId && this.status !== "open") this._status("open");
        if (!Array.isArray(response.messages)) throw failure("invalid-response", "The room service returned an invalid response.");
        for (const packet of response.messages) {
          if (this._closed || generation !== this._generation) return;
          if (!Number.isSafeInteger(packet.id) || packet.id <= this.cursor) continue;
          this.cursor = packet.id;
          this._receive(packet);
        }
        this._schedule(response.messages.length === 64 ? 0 : this.pollMs, generation);
      } catch (error) {
        if (this._closed || generation !== this._generation) return;
        if ([400, 401, 403, 404, 410].includes(error.status) || error.code === "invalid-response" || Date.now() - this._lastSuccess > (this.leaseMs || 90000)) { this._fail(error); return; }
        this._status("connecting", error);
        this._pollFailures = (this._pollFailures || 0) + 1;
        this._schedule(Math.min(5000, this.pollMs * Math.pow(1.5, this._pollFailures)), generation);
      }
    }
    _receive(packet) {
      if (this.mode === "host") {
        if (packet.type === "join" && typeof packet.connectionId === "string" && plain(packet.hello)) {
          if (this.connections.has(packet.connectionId)) return;
          const entry = { id: packet.connectionId, hello: packet.hello, memberId: null };
          this.connections.set(entry.id, entry);
          try { Promise.resolve(this.onJoin(entry.id, entry.hello)).catch(error => this.reject(entry.id, error)); }
          catch (error) { this.reject(entry.id, error); }
        } else if (packet.type === "message") {
          const entry = this.members.get(packet.memberId), message = payload(packet.message, 16384);
          if (entry && entry.id === packet.connectionId && message && this._fresh(message, packet.memberId)) { for (const key of identityFields) delete message[key]; this.onMessage(message, packet.memberId); }
        } else if (packet.type === "leave") {
          const entry = this.members.get(packet.memberId);
          if (entry && (!packet.connectionId || entry.id === packet.connectionId)) this._drop(entry);
        }
      } else if (packet.type === "accepted" && !this.memberId && validMember(packet.memberId)) {
        this.memberId = packet.memberId; this._status("open"); this._settle(this.memberId);
      } else if (packet.type === "rejected") {
        const rejected = admissionError(packet.error); this._fail(failure(rejected.code, rejected.message, 403));
      } else if (packet.type === "message" && this.memberId) {
        const message = payload(packet.message, 262144); if (message && this._fresh(message, "host")) this.onMessage(message, "host");
      }
    }
    _fresh(message, authenticatedSender) {
      const id = message[PACKET_ID];
      delete message[PACKET_ID];
      // Legacy clients have no transport ID. Deduplication never trusts a claimed actor.
      if (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id)) return true;
      const now = Date.now();
      for (const [key, receivedAt] of this._received) {
        if (now - receivedAt < DEDUPE_MS) break;
        this._received.delete(key);
      }
      const key = authenticatedSender + ":" + id;
      if (this._received.has(key)) return false;
      this._received.set(key, now);
      while (this._received.size > DEDUPE_MAX) this._received.delete(this._received.keys().next().value);
      return true;
    }
    _wire(message, maximum) {
      const value = payload(message, maximum);
      if (!value) return null;
      const bytes = root.crypto.getRandomValues(new Uint8Array(16));
      value[PACKET_ID] = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
      return payload(value, maximum);
    }
    async _write(action, data, connection, generation) {
      const started = Date.now();
      for (let attempt = 0; ; attempt++) {
        if (this._closed || generation !== this._generation) return;
        try {
          const response = await this._request(action, data, connection);
          if (!this._closed && generation === this._generation && this.memberId && this.status === "connecting") this._status("open");
          return response;
        } catch (error) {
          // Admission may have committed before its response was lost. A repeat
          // cannot modify another session; its stale response is then harmless.
          if (attempt && ["accept", "reject"].includes(action) && error.code === "stale-connection") return;
          if (!transient(error) || attempt >= 5 || Date.now() - started >= 45000) throw error;
          if (this._closed || generation !== this._generation) return;
          this._status("connecting", error);
          await new Promise(resolve => setTimeout(resolve, Math.min(4000, 250 * Math.pow(2, attempt))));
          if (this._closed || generation !== this._generation) return;
        }
      }
    }
    _queue(action, data, entry, beforeRun) {
      if (this._closed || this._queued >= 256) return false;
      const connection = { code: this.code, secret: this.secret }, generation = this._generation;
      this._queued++;
      // Independent private mailboxes must not wait for every other player's
      // HTTP round trip. Keep acceptance and messages in order within a seat.
      const lane = this.mode === "host" ? data.memberId || entry?.id || data.connectionId : "host";
      let done;
      const completion = new Promise(resolve => { done = resolve; });
      this._chain = Promise.all([this._chain, completion]).then(noop);
      this._jobs.push({ lane, action, data, entry, beforeRun, connection, generation, done });
      this._pump();
      return true;
    }
    _pump() {
      while (this._activeWrites < 4) {
        const index = this._jobs.findIndex(job => !this._activeLanes.has(job.lane));
        if (index < 0) return;
        const job = this._jobs.splice(index, 1)[0];
        if (this._closed || job.generation !== this._generation) { job.done(); continue; }
        this._activeWrites++; this._activeLanes.add(job.lane);
        Promise.resolve().then(() => {
          if (this._closed || job.generation !== this._generation) return;
          job.beforeRun?.(); return this._write(job.action, job.data, job.connection, job.generation);
        }).catch(error => {
          if (this._closed || job.generation !== this._generation) return;
          if (this.mode === "host" && ["stale-connection", "member-disconnected"].includes(error.code)) { if (job.entry) this._drop(job.entry); return; }
          this._fail(error);
        }).finally(() => {
          if (job.generation === this._generation) {
            this._queued--; this._activeWrites--; this._activeLanes.delete(job.lane);
            job.done(); this._pump();
          } else job.done();
        });
      }
    }
    accept(connectionId, memberId) {
      const entry = this.connections.get(connectionId);
      if (this.mode !== "host" || !entry || entry.memberId || !validMember(memberId) || this._closed) return false;
      const previous = this.members.get(memberId);
      if (previous && previous !== entry) {
        this.connections.delete(previous.id);
        // A pre-admission roster broadcast may still be queued for the old
        // connection. New projections must queue after this acceptance.
        this._snapshots.delete(memberId);
        this._snapshots.delete(memberId + ":clock");
      }
      entry.memberId = memberId; this.members.set(memberId, entry);
      return this._queue("accept", { connectionId, memberId }, entry);
    }
    reject(connectionId, error) {
      const entry = this.connections.get(connectionId);
      if (this.mode !== "host" || !entry || entry.memberId || this._closed) return false;
      this.connections.delete(connectionId);
      return this._queue("reject", { connectionId, error: admissionError(error) });
    }
    send(message) { const value = this._wire(message, 16384); return this.mode === "client" && !!this.memberId && !!value && this._queue("send", { message: value }); }
    sendTo(memberId, message) {
      const entry = this.members.get(memberId), value = this._wire(message, 262144);
      if (this.mode !== "host" || !entry || !value || this._closed) return false;
      if (value.type !== "snapshot" && value.type !== "clock") return this._queue("send", { memberId, message: value }, entry);
      // A clock may replace another pending clock, never the initial full view.
      const key = value.type === "clock" ? memberId + ":clock" : memberId;
      const pending = this._snapshots.get(key);
      if (pending) { pending.message = value; return true; }
      const data = { memberId, message: value };
      this._snapshots.set(key, data);
      const queued = this._queue("send", data, entry, () => { if (this._snapshots.get(key) === data) this._snapshots.delete(key); });
      if (!queued) this._snapshots.delete(key);
      return queued;
    }
    broadcast(factory) { if (this.mode !== "host" || this._closed || typeof factory !== "function") return 0; let count = 0; for (const memberId of Array.from(this.members.keys())) { const value = factory(memberId); if (value != null && this.sendTo(memberId, value)) count++; } return count; }
    _drop(entry) { this.connections.delete(entry.id); if (entry.memberId && this.members.get(entry.memberId) === entry) { this.members.delete(entry.memberId); this.onLeave(entry.memberId); } }
    _settle(value) { clearTimeout(this._operationTimer); const pending = this._pending; this._pending = null; pending?.resolve(value); }
    _status(status, error) { this.status = status; this.onStatus(status, error); }
    _fail(error) {
      const pending = !!this._pending;
      this._stop(error);
      this._status(pending || this.mode === "host" && error.status !== 410 ? "error" : "disconnected", error);
    }
    _stop(error) {
      this._closed = true; this._generation++; clearTimeout(this._pollTimer); clearTimeout(this._operationTimer);
      // Unsent work belongs to the old authenticated session. In-flight work
      // may finish, but must never occupy or release a replacement's lanes.
      for (const job of this._jobs.splice(0)) job.done();
      this._activeWrites = 0; this._activeLanes.clear(); this._queued = 0;
      const pending = this._pending; this._pending = null; pending?.reject(error);
      this.connections.clear(); this.members.clear(); this._snapshots.clear();
    }
    close() {
      if (this._closed) return Promise.resolve();
      const connection = { code: this.code, secret: this.secret, keepalive: true }, action = this.mode === "host" ? "close" : "leave", chain = this._chain;
      this._stop(failure("connection-closed", "The connection was closed."));
      this._status("disconnected");
      return connection.secret ? chain.then(() => this._request(action, {}, connection)).catch(noop) : Promise.resolve();
    }
  }
  return { RelayRoomNetwork };
});
