# Lantern Hollow

A village social deduction game for **4–12 friends**, with original illustrated scenery, private night animations, and English / Arabic. All match participants are human players.

[Play online](https://corexsol.github.io/lantern-hollow/)

## Play

1. Enter your name, customize your character, and choose **Create room**.
2. Share the six-character code or invitation link. Friends choose **Join room**.
3. The host opens **Match options** to choose impostors (fixed or random), neutrals, the role pool, and timers.
4. Everyone marks **Ready**. The host starts, and each player acknowledges their private role.
5. The first night begins. Select a house, confirm an ability, then **Finish turn**, or choose **Sleep**. The night resolves when all living players finish or the timer expires.
6. Discuss during the day, then vote. The last locked ballot starts the village elimination animation automatically.

Attacks and doctor recovery play at the target's cottage. Victims see anonymous visitors. Death never reveals a player's role; roles appear in the final match results. Arabic is available before joining and from gameplay settings. Player names and messages remain as written.

## Hosting

GitHub Pages serves the game. The included GitHub Actions workflow publishes pushes to `main`; configure Pages to use **GitHub Actions**. All browser assets are included, with no runtime package installation or third-party font requests.

The default multiplayer service is an authenticated HTTPS relay. It works through ordinary HTTPS requests rather than requiring direct browser-to-browser connectivity. The relay source, D1 migrations, and artifact scripts are included in `relay-server/`. `config.js` specifies the public relay URL. No private service key is included in browser configuration.

The room creator's browser runs the authoritative game and must remain open. Closing or reloading that browser ends its room. Guests can rejoin their seat using the same browser while the host remains online. The host can pause, remove a player, force a phase from settings, and start rematches. The trusted host can inspect complete match state; guests receive only their permitted information. See [NETWORK.md](NETWORK.md) for transport configuration and security details.

## Development and checks

Use Node 24 or newer for the SQLite-backed relay tests.

```sh
npm ci
npx playwright install chromium
npm run serve
```

Open `http://localhost:8080`. Installed packages are test tools; runtime browser dependencies are vendored.

```sh
npm test
npm run test:browser
npm run test:relay
npm run test:multiplayer
```

The relay fixture runs the production Worker and its SQL schema over actual HTTP. Browser checks use independent Chromium contexts and exercise private roles, ready checks, night completion, anonymous doctor recovery, voting, hidden death roles, Arabic/RTL, reconnection, removal, pause, and host departure. Set `LANTERN_RELAY_URL` to test the deployed relay, and `LANTERN_CHROMIUM_EXECUTABLE_PATH` for a separately installed Chromium. `npm run test:network` checks the optional direct WebRTC transport.

## Source

- `game.js`: shared rules, audio, and base renderer.
- `scene.js`: illustrated village, characters, camera, and private action animations.
- `village-ui.js` / `village-ui.css`: village interface and responsive styling.
- `multiplayer-core.js`: authoritative rooms and private per-player projections.
- `relay-network.js` / `relay-server/`: authenticated HTTPS transport and backend.
- `network.js` / `vendor/`: optional PeerJS/WebRTC transport.
- `online.js`: multiplayer integration and room lifecycle.
- `locale.js`: Arabic / English translations.

Artwork and font credits are in [ASSETS.md](ASSETS.md).
