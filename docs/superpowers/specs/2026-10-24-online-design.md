# Lantern Hollow online

Convert the existing visual Canvas game to real friends-only browser multiplayer. Keep its original character art and private night cinematics. No AI fills seats or makes decisions. Do not reveal roles on death; reveal all roles only in the final match results.

The user's chosen destination is GitHub. GitHub Pages serves static files; rooms use WebRTC data connections with PeerJS signaling. The room creator's browser is authoritative and must remain open. This is the implementation default after an unanswered hosting preference question; a separate dedicated game server is more reliable but would require another hosting account. A configurable ICE/TURN endpoint is supported; no connection success guarantee is made for restrictive networks without TURN.

Create/join with a six-character code, copyable invitation link, 4–12 actual players, customization, ready check, host-only start/settings/pause/phase advance, and participant reconnect while the host remains present. Host departure ends the room clearly. No account is required for players.

Settings: fixed or randomized impostor count below half the current roster, optional neutral count, enabled role pool, and day/vote/night timers. All joins, actions, chat, role allocations and phase transitions are validated by authority. Unknown roles, private clues, night scenes, killer identities and visitors must not be sent to unauthorized peers. The host is trusted and can inspect its authoritative state.

English/Arabic switch, remembered locally. Arabic covers room screens, settings, role guide and descriptions, gameplay labels, night captions, help, errors and private/system clues, with RTL layout. Names and messages written by players retain their original text. Room codes remain LTR.

Split the former single file only where new responsibilities justify it: game.js (rules/rendering), multiplayer-core.js (authority/projection), network.js (PeerJS transport), locale.js (translation), online.js (UI/integration), vendor/peerjs.min.js, and index.html. Keep runtime assets local. Verify independent browser contexts, unauthorized actions and hidden-role payloads, disconnect/rejoin, Arabic on mobile, and absence of bots/death role labels.

GitHub publishing is explicitly authorized. The connector is authenticated as corexsol but lacks repository creation/Pages settings. The browser is currently signed out; finish and verify the deliverable before requesting the final sign-in step.
