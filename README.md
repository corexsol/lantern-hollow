# Lantern Hollow

A colorful social deduction game for **4–12 friends**, with original Canvas art, private night cinematics, and English / Arabic. There are no computer players.

## Play

1. Open the game, select your character to edit your name/appearance, then choose **Create room**.
2. Copy the six-character code or invitation link and send it to friends.
3. Friends open the same site, enter the code, and choose **Join room**.
4. The host chooses fixed or randomized impostor count, optional neutrals, enabled roles, and timers. Everyone marks **Ready**, then the host starts.
5. Each player sees their own secret role. Talk, vote, choose your night action, and watch your private outcome. Death never publishes the player's role. Roles appear in final results.

The host controls starting, phase advances, pause and rematches. Opening a personal dialog does not pause other players. Arabic can be selected before joining and from gameplay settings. Names and player-written messages are preserved.

## Hosting

These are static files and can run on **GitHub Pages**. In the repository's **Settings → Pages**, choose **GitHub Actions** as the source. The included workflow publishes pushes to `main`. Use the deployed URL shown by the workflow; no build step or runtime package install is needed.

The room creator's browser is the game authority and must stay open. Reloading/closing the host page ends that room. A guest can reload and join again in the same tab/browser to recover their seat while the original host stays online. Explicit host departure ends the room; kicked players are notified.

GitHub Pages does not run a multiplayer server. This game uses **PeerJS Cloud signaling and WebRTC data channels** between browsers. It needs internet access. Restrictive NATs/firewalls or unavailable signaling can prevent connections; configure an appropriate TURN relay in `config.js` for those networks. No network-wide connectivity guarantee is implied by GitHub hosting. See [NETWORK.md](NETWORK.md) for configuration and dependencies. The trusted host can inspect the complete match state; ordinary clients receive only permitted public information and their own secrets.

## Local development and checks

```sh
npm install
npx playwright install chromium
npm run serve
```

Open `http://localhost:8080`. Runtime dependencies are vendored; installed packages are test tools only.

```sh
npm test
npm run test:browser
npm run test:network
npm run test:multiplayer
```

Browser checks use real PeerJS/WebRTC with a local test signaling/STUN fixture and independent browser contexts. Set `LANTERN_CHROMIUM_EXECUTABLE_PATH` for a separately installed Chromium. Tests cover private projections, authority, hidden death roles, anonymous doctor recovery, ready checks, Arabic/RTL, reconnection, removal and host loss. A local test cannot verify every ISP, corporate firewall or mobile carrier.

## Source

- `game.js`: shared rules, original artwork, audio and rendering.
- `multiplayer-core.js`: authoritative rooms and private per-player projections.
- `network.js`: WebRTC connection and authenticated seat binding.
- `online.js`: room screens and gameplay integration.
- `locale.js`: reversible Arabic / English translations.
- `vendor/`: pinned PeerJS 1.5.5 and its MIT license.

No private service key is required for the default signaling setup. Never commit long-lived TURN credentials; browser configuration is public.
