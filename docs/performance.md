# Performance and visual revision (5.0)

The renderer now uses original flat SVG scenery and cottages, rasterized locally once. The static background and night tint are cached; live Canvas filters are removed. Canvas DPR is capped at 1.5. The character and scenery palettes now share outlines and flat shading.

Room snapshots previously used one serialized HTTP queue for all players. Writes now run with four independent requests while retaining admission/message ordering for each seat. Full private projections send on changes; a small clock packet handles idle synchronization once a second. Clock packets coalesce separately from private views. Duplicate broadcasts coalesce in a microtask.

Controlled HTTP benchmark with 150ms simulated write latency:

| Seats | Idle bytes/s before | After | Last-seat acknowledgement before | After |
|---|---:|---:|---:|---:|
| 4 | 34,064 | 405 | 626ms | 331ms |
| 12 | 244,728 | 1,485 | 1,874ms | 634ms |

These are controlled local HTTP measurements, not a guarantee about public internet or mobile frame rates. Reproduce with `node tools/measure-relay-performance.cjs`. Baseline source can be extracted from commit d11bb3f with `git show` and passed using the script's baseline environment options.

The renderer profiler (`tools/profile-scene.cjs`) includes forced raster completion. At 1440×900, DPR1.5, measured median day/night cost was 11.8/14.2ms (P95 15.3/18.3ms) in software Chromium. The original renderer baseline did not finish within the profiling window; no original-to-current percentage improvement is claimed.

Also repaired: the first in-match reconnect projection being overwritten by the lobby, queued old-session writes, settings drafts/focus being lost during room updates, excessive HUD clock writes, the unlimited reveal timer displaying 166 minutes, and labels hidden behind foreground roofs.
