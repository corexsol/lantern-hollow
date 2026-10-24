# Feign-like village rebuild plan

**Goal:** Replace the rejected art/UI/interaction with a village-first social game while preserving original art identity and room privacy.
**Spec:** ../specs/2026-10-24-feign-rebuild.md
**Architecture:** Existing authoritative rules and projections; new scene renderer and UI skin; external original raster art and an authenticated hosted relay fallback alongside PeerJS.

- [ ] Root: generate original terrain/cottage assets, vendor fonts, integrate new scene, rebuild lobby/HUD, inspect visual quality, publish GitHub/Pages.
- [ ] Scene task: scene.js exports window.LanternSceneRenderer subclassing LanternCore.SceneRenderer. Existing methods/properties remain compatible with OnlineGame. Own scene.js only. Terrain assets assets/village-terrain.png (16:9) and assets/cottage.png (transparent). Override terrain/house/character/night/vote rendering and map layout to align the village-first reference. Keep mouse hit testing, camera, privacy, reduced motion. Root adds script to index/constructor.
- [ ] Rules task: multiplayer-core.js + core tests only. Reveal first goes to night. Add finish-night command, all living finished or timer resolves. All living locked ballots resolve automatically. Brief dawn3seconds. Include own view.nightFinished and room.finishedCount/aliveCount without leaking action targets. Host force advance retained. Test readiness, disconnected/out players and no early result leak.
- [ ] Networking task: network.js + relay-network.js + server source in separate backend folder + tests only. Keep RoomNetwork API, diagnose public timeout and implement authenticated HTTPS relay fallback; native Sites calls by root. Relay API design and security documented; use Worker/D1 with schema migrations, bounded message queues, host heartbeat/lease, auth tokens, reconnect, strict CORS. No fake production transport. Root wires backend URL and publishes.
- [ ] Root: fresh tests for whole four-client loop over relay, language/mobile, night camera and no death reveal. Independent review, deploy both services, verify public join/create and working flow, then return play/source links.
