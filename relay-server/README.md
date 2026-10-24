# Lantern Hollow room relay

An ESM Worker with a D1 database binding named `DB`. This service forwards authenticated private mailboxes; the room host's browser runs the game rules.

The deployed game uses the relay URL in the root `config.js`. To deploy another instance, provision the Worker and D1 binding, apply `drizzle/0000_relay.sql` through your deployment system, and set allowed origins in `worker/index.js` to your game origin. The generic hosting manifest intentionally contains no project identity or credentials.

```sh
bash scripts/build.sh
node scripts/validate-artifact.mjs
```

Build output is `dist/server/index.js`, with the hosting manifest and schema migrations in `dist/.openai/`. Request handlers never create or alter database tables.

Root tests use the exact Worker source and schema in this directory. Run `npm test` from the game repository to verify authentication, reconnect/session rotation, private routing, bounded mailboxes, stale admission races, expiry, and send recovery.
