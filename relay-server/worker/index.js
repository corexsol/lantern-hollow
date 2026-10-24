/* Authenticated HTTPS mailboxes. Game rules and private projections stay on the host. */
const LEASE_MS = 90000;
const ROOM_MS = 12 * 60 * 60 * 1000;
const MESSAGE_MS = 120000;
const QUEUE_MAX = 128;
const IDENTITY_FIELDS = ["actor", "actorId", "memberId", "playerId", "sender", "senderId"];
const plain = value => !!value && typeof value === "object" && !Array.isArray(value);
const validMember = value => typeof value === "string" && value !== "host" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const allowedOrigin = origin => origin === "https://corexsol.github.io" || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$/.test(origin || "");
function failure(status, code, message) { const error = new Error(message); Object.assign(error, { status, code }); throw error; }
function random() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return Array.from(bytes, n => n.toString(16).padStart(2, "0")).join(""); }
async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), n => n.toString(16).padStart(2, "0")).join(""); }
const statement = (db, sql, ...args) => db.prepare(sql).bind(...args);
const first = (db, sql, ...args) => statement(db, sql, ...args).first();
const run = (db, sql, ...args) => statement(db, sql, ...args).run();
function copyObject(value, maximum) {
  if (!plain(value)) failure(400, "invalid-packet", "A JSON object is required.");
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).length > maximum) failure(413, "packet-too-large", "This message is too large.");
  return JSON.parse(serialized);
}
async function body(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) failure(415, "invalid-content", "JSON is required.");
  if (Number(request.headers.get("content-length")) > 270000) failure(413, "packet-too-large", "This message is too large.");
  const reader = request.body?.getReader();
  let total = 0, chunks = [];
  if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 270000) { await reader.cancel(); failure(413, "packet-too-large", "This message is too large."); } chunks.push(value); }
  try { const bytes = new Uint8Array(total); let i = 0; for (const chunk of chunks) { bytes.set(chunk, i); i += chunk.length; } const value = JSON.parse(new TextDecoder().decode(bytes)); if (!plain(value)) throw new Error(); return value; }
  catch (_) { failure(400, "invalid-json", "A JSON object is required."); }
}
async function rate(db, key, maximum, now) {
  const window = Math.floor(now / 60000);
  await run(db, "INSERT INTO limits(key, window, hits) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN window = excluded.window THEN hits + 1 ELSE 1 END, window = excluded.window", key, window);
  const count = await first(db, "SELECT hits FROM limits WHERE key = ?", key);
  if (count.hits > maximum) failure(429, "rate-limited", "Too many requests. Please wait a moment.");
}
function enqueue(db, roomId, recipient, packet, now, guardConnection, guardStatus, afterMutation = false) {
  const guard = guardConnection ? " AND EXISTS(SELECT id FROM seats WHERE room_id = ? AND connection_id = ?" + (guardStatus ? " AND status = ?" : "") + ")" : "";
  // Within a D1 batch, changes() refers to the preceding guarded UPDATE.
  const changed = afterMutation ? " AND changes() = 1" : "";
  return statement(db, "INSERT INTO messages(room_id, recipient, payload, expires_at) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM messages WHERE room_id = ? AND recipient = ?) < ?" + guard + changed, roomId, recipient, JSON.stringify(packet), now + MESSAGE_MS, roomId, recipient, QUEUE_MAX, ...(guardConnection ? [roomId, guardConnection, ...(guardStatus ? [guardStatus] : [])] : []));
}
async function addMessage(db, roomId, recipient, packet, now) {
  const result = await enqueue(db, roomId, recipient, packet, now).run();
  if (!result.meta?.changes) failure(503, "mailbox-full", "The connection is busy. Try again shortly.");
}
async function handle(request, env, headers) {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, protocol: "lantern-relay-v1" }, 200, headers);
  const match = /^\/v1\/rooms\/([A-HJ-NP-Z2-9]{6})\/(create|join|poll|accept|reject|send|leave|close)$/.exec(url.pathname);
  if (!match || request.method !== "POST") failure(404, "not-found", "Endpoint not found.");
  const [, code, action] = match, db = env.DB, now = Date.now();
  if (!db) failure(503, "storage-unavailable", "The room service is unavailable.");
  const input = await body(request);
  // Each cleanup is bounded by the limits on active rooms, seats and queues.
  await db.batch([
    statement(db, "DELETE FROM messages WHERE expires_at <= ?", now),
    statement(db, "DELETE FROM rooms WHERE expires_at <= ?", now),
    statement(db, "DELETE FROM seats WHERE member_id IS NULL AND status IN ('pending', 'rejected', 'left') AND seen_at <= ?", now - MESSAGE_MS),
    statement(db, "DELETE FROM limits WHERE window < ?", Math.floor(now / 60000) - 2),
  ]);
  if (action === "create" || action === "join") {
    const address = request.headers.get("CF-Connecting-IP") || "local";
    await rate(db, `admission:${await hash(address)}`, 60, now);
  }
  if (action === "create") {
    const secret = random(), id = random();
    await run(db, "DELETE FROM rooms WHERE code = ? AND (closed = 1 OR lease_until <= ?)", code, now);
    if (await first(db, "SELECT id FROM rooms WHERE code = ?", code)) failure(409, "room-exists", "That room code is already in use. Create another room.");
    const result = await run(db, "INSERT OR IGNORE INTO rooms(id, code, host_hash, lease_until, expires_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM rooms) < 500", id, code, await hash(secret), now + LEASE_MS, now + ROOM_MS);
    if (!result.meta?.changes) failure(503, "room-capacity", "The room service is busy. Try again shortly.");
    return json({ secret, leaseMs: LEASE_MS }, 201, headers);
  }
  const room = await first(db, "SELECT * FROM rooms WHERE code = ?", code);
  if (!room) failure(404, "room-not-found", "Room not found. Check the code and make sure the host is online.");
  if (room.closed || room.lease_until <= now) failure(410, "host-disconnected", "The host disconnected. This room has ended.");
  if (action === "join") {
    if (typeof input.token !== "string" || input.token.length < 8 || input.token.length > 256) failure(400, "invalid-hello", "A reconnect token is required.");
    const profile = copyObject(input.profile, 4096), tokenHash = await hash(input.token), secret = random(), connectionId = random();
    const seat = await first(db, "SELECT * FROM seats WHERE room_id = ? AND token_hash = ?", room.id, tokenHash);
    if (!seat && (await first(db, "SELECT COUNT(*) AS n FROM seats WHERE room_id = ?", room.id)).n >= 16) failure(409, "room-full", "This room is full.");
    const operations = [];
    if (seat) {
      operations.push(statement(db, "DELETE FROM messages WHERE room_id = ? AND recipient = ?", room.id, seat.connection_id));
      // Old unprocessed joins cannot rebind the token after the session rotates.
      operations.push(statement(db, "UPDATE seats SET session_hash = ?, connection_id = ?, status = 'pending', seen_at = ? WHERE id = ?", await hash(secret), connectionId, now, seat.id));
    } else operations.push(statement(db, "INSERT INTO seats(id, room_id, token_hash, session_hash, connection_id, seen_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM seats WHERE room_id = ?) < 16", random(), room.id, tokenHash, await hash(secret), connectionId, now, room.id));
    operations.push(enqueue(db, room.id, "host", { type: "join", connectionId, hello: { token: input.token, profile } }, now, connectionId));
    const results = await db.batch(operations);
    if (!seat && !results[0].meta?.changes) failure(409, "room-full", "This room is full.");
    if (!results[results.length - 1].meta?.changes) failure(503, "mailbox-full", "The host is busy. Try joining again.");
    return json({ secret, connectionId, leaseMs: LEASE_MS }, 201, headers);
  }
  const bearer = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get("Authorization") || "")?.[1];
  if (!bearer) failure(401, "unauthorized", "This connection is not authenticated.");
  const bearerHash = await hash(bearer), isHost = bearerHash === room.host_hash;
  const seat = isHost ? null : await first(db, "SELECT * FROM seats WHERE room_id = ? AND session_hash = ?", room.id, bearerHash);
  if (!isHost && !seat) failure(401, "unauthorized", "This connection is not authenticated.");
  await rate(db, `session:${room.id}:${bearerHash}`, isHost ? 6000 : 600, now);
  if (action === "poll") {
    if (!isHost && seat.status === "left") failure(410, "seat-disconnected", "Your connection expired. Rejoin the room to recover your seat.");
    const recipient = isHost ? "host" : seat.connection_id;
    const after = Number.isSafeInteger(input.after) && input.after >= 0 ? input.after : 0;
    // Acknowledgements must free capacity before lifecycle notifications enqueue.
    await run(db, "DELETE FROM messages WHERE room_id = ? AND recipient = ? AND id <= ?", room.id, recipient, after);
    if (isHost) {
      await run(db, "UPDATE rooms SET lease_until = ? WHERE id = ?", now + LEASE_MS, room.id);
      const stale = (await statement(db, "SELECT id, member_id, connection_id FROM seats WHERE room_id = ? AND status = 'accepted' AND seen_at <= ? LIMIT 16", room.id, now - LEASE_MS).all()).results;
      for (const old of stale) await db.batch([
        enqueue(db, room.id, "host", { type: "leave", memberId: old.member_id, connectionId: old.connection_id }, now, old.connection_id, "accepted"),
        statement(db, "UPDATE seats SET status = 'left' WHERE id = ? AND status = 'accepted' AND EXISTS(SELECT id FROM messages WHERE room_id = ? AND recipient = 'host' AND json_extract(payload, '$.type') = 'leave' AND json_extract(payload, '$.connectionId') = ?)", old.id, room.id, old.connection_id),
      ]);
    } else await run(db, "UPDATE seats SET seen_at = ? WHERE id = ?", now, seat.id);
    const messages = (await statement(db, "SELECT id, payload FROM messages WHERE room_id = ? AND recipient = ? AND id > ? ORDER BY id LIMIT 64", room.id, recipient, after).all()).results;
    return json({ messages: messages.map(row => ({ ...JSON.parse(row.payload), id: row.id })), cursor: messages.length ? messages[messages.length - 1].id : after }, 200, headers);
  }
  if (action === "accept" || action === "reject") {
    if (!isHost) failure(403, "host-only", "Only the host can admit players.");
    const joining = await first(db, "SELECT * FROM seats WHERE room_id = ? AND connection_id = ? AND status = 'pending'", room.id, String(input.connectionId || ""));
    if (!joining) failure(409, "stale-connection", "This join request is no longer active.");
    if (action === "accept") {
      if (!validMember(input.memberId)) failure(400, "invalid-member", "Invalid member identity.");
      if (joining.member_id && joining.member_id !== input.memberId) failure(409, "seat-bound", "This reconnect token belongs to another seat.");
      const occupied = await first(db, "SELECT id FROM seats WHERE room_id = ? AND member_id = ? AND id != ?", room.id, input.memberId, joining.id);
      if (occupied) failure(409, "seat-bound", "This member belongs to another reconnect token.");
      const results = await db.batch([
        statement(db, "UPDATE seats SET member_id = ?, status = 'accepted' WHERE id = ? AND connection_id = ? AND status = 'pending'", input.memberId, joining.id, joining.connection_id),
        enqueue(db, room.id, joining.connection_id, { type: "accepted", memberId: input.memberId }, now, joining.connection_id, "accepted", true),
      ]);
      if (!results[0].meta?.changes) failure(409, "stale-connection", "This join request is no longer active.");
    } else {
      const code = typeof input.error?.code === "string" && /^[a-z0-9-]{1,64}$/.test(input.error.code) ? input.error.code : "join-rejected";
      const message = typeof input.error?.message === "string" ? input.error.message.slice(0, 500) : "Unable to join this room.";
      const results = await db.batch([
        statement(db, "UPDATE seats SET status = 'rejected' WHERE id = ? AND connection_id = ? AND status = 'pending'", joining.id, joining.connection_id),
        enqueue(db, room.id, joining.connection_id, { type: "rejected", error: { code, message } }, now, joining.connection_id, "rejected", true),
      ]);
      if (!results[0].meta?.changes) failure(409, "stale-connection", "This join request is no longer active.");
    }
    return json({ ok: true }, 200, headers);
  }
  if (action === "send") {
    const message = copyObject(input.message, isHost ? 262144 : 16384);
    if (isHost) {
      const target = await first(db, "SELECT connection_id FROM seats WHERE room_id = ? AND member_id = ? AND status = 'accepted'", room.id, String(input.memberId || ""));
      if (!target) failure(409, "member-disconnected", "This player is disconnected.");
      const packet = { type: "message", message };
      if (message.type === "snapshot") {
        // Keep the newest projection for this member; control packets retain order.
        const results = await db.batch([
          statement(db, "DELETE FROM messages WHERE room_id = ? AND recipient = ? AND json_extract(payload, '$.type') = 'message' AND json_extract(payload, '$.message.type') = 'snapshot'", room.id, target.connection_id),
          enqueue(db, room.id, target.connection_id, packet, now),
        ]);
        if (!results[1].meta?.changes) failure(503, "mailbox-full", "The connection is busy. Try again shortly.");
      } else await addMessage(db, room.id, target.connection_id, packet, now);
    } else {
      if (seat.status !== "accepted" || !seat.member_id) failure(403, "not-admitted", "Wait for the host to admit this connection.");
      for (const key of IDENTITY_FIELDS) delete message[key];
      await addMessage(db, room.id, "host", { type: "message", memberId: seat.member_id, connectionId: seat.connection_id, message }, now);
    }
    return json({ ok: true }, 200, headers);
  }
  if (action === "leave") {
    if (isHost) failure(403, "guest-only", "Use close to end the room.");
    if (seat.status === "accepted") await addMessage(db, room.id, "host", { type: "leave", memberId: seat.member_id, connectionId: seat.connection_id }, now);
    await run(db, "UPDATE seats SET status = 'left' WHERE id = ?", seat.id);
    return json({ ok: true }, 200, headers);
  }
  if (!isHost) failure(403, "host-only", "Only the host can close the room.");
  await db.batch([statement(db, "UPDATE rooms SET closed = 1, expires_at = ? WHERE id = ?", now + MESSAGE_MS, room.id), statement(db, "DELETE FROM messages WHERE room_id = ?", room.id)]);
  return json({ ok: true }, 200, headers);
}
function json(value, status, headers) { return new Response(JSON.stringify(value), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const headers = { Vary: "Origin" };
    if (allowedOrigin(origin)) Object.assign(headers, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "600" });
    try {
      if (!allowedOrigin(origin) && !(new URL(request.url).pathname === "/health" && request.method === "GET")) failure(403, "origin-denied", "This origin is not allowed.");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      return await handle(request, env, headers);
    } catch (error) {
      // Never log request bodies, authorization headers, profiles, or reconnect tokens.
      return json({ error: { code: error.status ? error.code : "service-error", message: error.status ? error.message : "The room service could not complete this request." } }, error.status || 500, headers);
    }
  },
};
