# Room networking

The default production transport is the authenticated HTTPS mailbox service in `relay-server/`. GitHub Pages continues to serve the game. The creator's browser owns the authoritative room state and must remain open. The relay routes separate messages for each member; it never computes roles or broadcasts a shared private snapshot. There is no simulated multiplayer or BroadcastChannel fallback.

`relay-network.js` exports `window.LanternRelayNetwork.RelayRoomNetwork` (also CommonJS) with the same application API as `RoomNetwork`. Configure it before construction:

```js
window.LANTERN_NETWORK_CONFIG = {
  transport: "relay",
  relayUrl: "https://lantern-hollow-rooms.jravis.chatgpt.site",
  timeoutMs: 20000,
};
```

The application can explicitly select `transport: "webrtc"` for direct WebRTC. `vendor/peerjs.min.js` is the unmodified official **PeerJS 1.5.5** browser build from the npm `peerjs@1.5.5` package. Its MIT license is included in `vendor/peerjs.LICENSE`. That transport requires PeerJS Cloud (or a configured PeerServer) and usable STUN/TURN connectivity. Public PeerJS room creation was observed working while a second public browser timed out joining; local real WebRTC succeeded with a local STUN responder. Successful signaling alone therefore does not establish public peer connectivity. HTTPS relay is the production default so restrictive NAT and UDP policies do not block room joins.

## HTTPS relay security and lifecycle

Room creation returns a random 256-bit host bearer secret. A join submits the locally retained reconnect token and profile over HTTPS, then receives a new random session bearer secret. The relay stores hashes of authentication secrets. The host receives the join token/profile only in its authenticated mailbox, calls its authoritative `RoomHost.join`, then calls `accept(connectionId, memberId)` or `reject`. Rejoining rotates the session secret and connection ID, invalidating the previous session. An established token and member ID remain bound together; neither a different token nor a new member ID can take over that seat.

Each request authenticates the bearer secret. Only the host can accept players, send member snapshots, or close the room. Guests send commands only after acceptance. The server derives the actor from the bound seat and removes client-supplied identity fields. Guests can poll only their own mailbox; host state messages require one explicit member ID. Tokens never appear in URLs, public metadata, health responses, browser signaling metadata or application logs. The service is trusted to carry private snapshots; the authoritative host remains trusted to inspect full state.

Polling acknowledges a monotonic message cursor. Unacknowledged messages are delivered again and clients discard already processed IDs. Pending snapshots coalesce separately for each member in browser writes and server mailboxes, so a slow guest receives its latest private projection without accumulating old timer ticks. Command and control packets retain queue ordering. Mailboxes are bounded to 128 packets with a two-minute TTL. Guest commands are limited to 16 KiB, host projections to 256 KiB and profiles to 4 KiB. There are at most 16 token seats per room, 500 rooms, admission/session rate limits and a 12-hour maximum room lifetime. Unbound abandoned joins expire. Accepted seats survive disconnects for token rejoining.

Host polling refreshes a 90-second lease. Explicit host `close()` ends the room immediately; an unreachable host ends it when the lease expires. Guest `close()` emits a leave notification; missing guest heartbeats are reported after 90 seconds. Polling retries temporary HTTP failures within the lease. `close()` returns a promise which can be awaited for remote cleanup. Writes are ordered so host acceptance reaches the server before its first private snapshot. Packet sends return the same immediate boolean/count API as WebRTC; asynchronous service failures use `onStatus`.

The Worker accepts only `https://corexsol.github.io` and exact HTTP/HTTPS localhost, 127.0.0.1 or ::1 origins for local verification. Every state API is an authenticated JSON POST except initial create/join. Browser CORS does not replace bearer authentication. Database tables are installed solely through schema-only D1 migrations, never in request handlers.

Upstream: https://github.com/peers/peerjs/tree/v1.5.5 · API: https://peerjs.com/client/api/peer

Pinned npm package integrity:

```
sha512-viMUCPDL6CSfOu0ZqVcFqbWRXNHIbv2lPqNbrBIjbFYrflebOjItJ4hPfhjnuUCstqciHVu9vVJ7jFqqKi/EuQ==
```

Vendored browser build SHA-256:

```
7604d8c31bec4f134b0d15c2d80b1d095ea18af005354f439f14291fcd7b4168
```

With direct WebRTC, the creator's browser owns the room ID `lantern-hollow-v3-` followed by its six-character code. Its browser must remain open. Clients connect only to that host, which decides admission, validates reconnect tokens, and projects each member's private state. A room-code collision fails explicitly; it never silently creates a different room.

## Shared application transport contract

For direct WebRTC, load `vendor/peerjs.min.js` before `network.js`; the API is `window.LanternNetwork`, or `require('./network.js')` for tests. For HTTPS, load `relay-network.js` and construct `LanternRelayNetwork.RelayRoomNetwork`. Both preserve the following application contract.

- `create(code)` resolves to the room code once the transport claims the ID.
- `join(code, {token, profile})` resolves to the authenticated member ID after host acceptance. Generate a secret token with at least 128 random bits and retain it locally for rejoining.
- Host `onJoin(connectionId, hello)` must call `roomHost.join(hello.token, hello.profile)`, then `network.accept(connectionId, memberId)`. Call `accept` before sending the first snapshot. Throw an error with an optional `.code`, or call `reject(connectionId, error)`, to refuse admission.
- Host `onMessage(message, memberId)` uses the seat bound to the authenticated connection. Client-supplied `actor`, `actorId`, `memberId`, `playerId`, `sender` and `senderId` fields are removed from commands. `onLeave(memberId)` runs once when that member's active connection goes away.
- Client `send(message)` sends a command to the host. Host `sendTo(memberId, message)` sends to one authenticated member. `broadcast(memberId => privateSnapshot)` generates a separate payload for each authenticated member; it never assumes all viewers can receive the same state.
- `close()` closes the active transport; a host closes its room. Call `join` again with the saved token to reconnect while the original host remains online.
- `onStatus(status, error?)` reports `connecting`, `open`, `disconnected`, or `error`. Errors have `.code` and `.type`. A signaling outage reports `connecting` with `signaling-reconnecting` and attempts to reconnect without dropping existing data channels. Host data-channel loss reports `disconnected` with `host-disconnected`. Admission and initial connection failures reject the pending promise and report `error`.

In direct WebRTC, the reconnect token is sent in the encrypted data-channel handshake, never in signaling metadata. In relay mode, it is sent over HTTPS into the private host mailbox. The authoritative room implementation remains responsible for token generation, token validation, membership limits and game rules. The host is trusted; it can inspect the full authoritative state.

## Signaling and ICE/TURN configuration

Set configuration **before constructing a RoomNetwork**. Constructor `peerOptions` override the global defaults.

```html
<script>
window.LANTERN_NETWORK_CONFIG = {
  timeoutMs: 15000,
  peerOptions: {
    // Optional self-hosted PeerServer; omit for PeerJS Cloud.
    host: 'signal.example.com',
    port: 443,
    path: '/peerjs',
    secure: true,
    config: {
      iceServers: [
        {urls: 'stun:stun.l.google.com:19302'},
        {urls: 'turn:turn.example.com:3478', username: 'temporary-user', credential: 'temporary-credential'}
      ]
    }
  }
};
</script>
```

Supply your own TURN service details. Browser configuration is visible to players, so use scoped, expiring TURN credentials. Restrictive NATs, firewalls, blocked signaling, or unavailable relay service can prevent a connection; static hosting alone does not guarantee WebRTC connectivity. Public production pages should use HTTPS. A self-hosted PeerServer at an HTTPS site needs secure WebSocket signaling too.

## Verification

Run real HTTP Worker tests with the in-memory SQLite D1 adapter, including four independent HTTP clients:

```sh
node --test tests/relay.test.cjs
```

`tests/relay-fixture.cjs` exports `startRelayFixture()` returning `{url, DB, close()}`. It starts a real HTTP server using the production Worker's actual `fetch`, actual SQL schema, and Node 24 `node:sqlite`; browser tests can use its URL with relay configuration. It is test infrastructure only and is never shipped as the production service.

The separate browser test uses four independent Chromium contexts and actual cross-origin HTTP requests. Set `LANTERN_RELAY_URL` to verify the published service instead of the local Worker fixture:

```sh
LANTERN_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium node --test tests/relay-browser.cjs
LANTERN_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
LANTERN_RELAY_URL=https://lantern-hollow-rooms.jravis.chatgpt.site \
node --test tests/relay-browser.cjs
```

Run deterministic WebRTC transport tests with:

```sh
node --test tests/network.test.cjs
```

The opt-in integration test uses the actual vendored PeerJS build, a real local PeerServer and five independent Chromium contexts. It checks three guest WebRTC data channels, private projections, spoofed identities, collision/rejection delivery, token rejoin and host loss.

Install test-only dependencies outside the project, then run:

```sh
npm install --prefix /tmp/lantern-peer-test peer@1.0.2 --ignore-scripts --no-audit --no-fund
LANTERN_REAL_NETWORK_TEST=1 \
LANTERN_PEER_SERVER_MODULE=/tmp/lantern-peer-test/node_modules/peer \
node --test tests/network.test.cjs
```

Set `LANTERN_CHROMIUM_EXECUTABLE_PATH` to use a separately provisioned Chromium executable (for example `/tmp/chromium`). The integration test uses the environment's `CODEX_PRIMARY_RUNTIME_NODE_MODULES/playwright` when available; otherwise install `playwright` and its Chromium browser in your own test environment. The reusable `tests/network-fixture.cjs` exports `startNetworkFixture()` returning `{peerOptions, close()}`, and `NETWORK_BROWSER_ARGS` for Chromium. It launches the official PeerServer in a child process and a real local STUN Binding responder on random ports, which exercises actual WebRTC on localhost even when the container prohibits network-interface enumeration. `close()` stops both services and their housekeeping timers. Tests across different physical networks still require a reachable signaling service and appropriate ICE/TURN configuration.
