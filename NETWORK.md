# Room networking

`vendor/peerjs.min.js` is the unmodified official **PeerJS 1.5.5** browser build from the npm `peerjs@1.5.5` package. Its MIT license is included in `vendor/peerjs.LICENSE`. Runtime scripts load locally; the default external dependency is PeerJS Cloud signaling, plus WebRTC STUN/TURN connectivity. There is no simulated multiplayer or BroadcastChannel fallback.

Upstream: https://github.com/peers/peerjs/tree/v1.5.5 · API: https://peerjs.com/client/api/peer

Pinned npm package integrity:

```
sha512-viMUCPDL6CSfOu0ZqVcFqbWRXNHIbv2lPqNbrBIjbFYrflebOjItJ4hPfhjnuUCstqciHVu9vVJ7jFqqKi/EuQ==
```

Vendored browser build SHA-256:

```
7604d8c31bec4f134b0d15c2d80b1d095ea18af005354f439f14291fcd7b4168
```

The creator's browser owns the room ID `lantern-hollow-v3-` followed by its six-character code. Its browser must remain open. Clients connect only to that host, which decides admission, validates reconnect tokens, and projects each member's private state. A room-code collision fails explicitly; it never silently creates a different room.

## Transport contract

Load `vendor/peerjs.min.js` before `network.js`. The API is available as `window.LanternNetwork`, or `require('./network.js')` for tests.

- `create(code)` resolves to the room code once signaling claims the ID.
- `join(code, {token, profile})` resolves to the authenticated member ID after host acceptance. Generate a secret token with at least 128 random bits and retain it locally for rejoining.
- Host `onJoin(connectionId, hello)` must call `roomHost.join(hello.token, hello.profile)`, then `network.accept(connectionId, memberId)`. Call `accept` before sending the first snapshot. Throw an error with an optional `.code`, or call `reject(connectionId, error)`, to refuse admission.
- Host `onMessage(message, memberId)` uses the seat bound to the data connection. Client-supplied `actor`, `actorId`, `memberId`, `playerId`, `sender` and `senderId` fields are removed from commands. `onLeave(memberId)` runs once when that member's active connection goes away.
- Client `send(message)` sends a command to the host. Host `sendTo(memberId, message)` sends to one authenticated member. `broadcast(memberId => privateSnapshot)` generates a separate payload for each authenticated member; it never assumes all viewers can receive the same state.
- `close()` destroys the PeerJS peer and all channels. Call `join` again with the saved token to reconnect while the original host remains online.
- `onStatus(status, error?)` reports `connecting`, `open`, `disconnected`, or `error`. Errors have `.code` and `.type`. A signaling outage reports `connecting` with `signaling-reconnecting` and attempts to reconnect without dropping existing data channels. Host data-channel loss reports `disconnected` with `host-disconnected`. Admission and initial connection failures reject the pending promise and report `error`.

The reconnect token is sent in the encrypted data-channel handshake, never in signaling metadata. The authoritative room implementation remains responsible for token generation, token validation, membership limits and game rules. The host is trusted; it can inspect the full authoritative state.

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

Run deterministic transport tests with:

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
