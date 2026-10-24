CREATE TABLE rooms (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  host_hash TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  closed INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE seats (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  connection_id TEXT NOT NULL UNIQUE,
  member_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  seen_at INTEGER NOT NULL,
  UNIQUE(room_id, token_hash),
  UNIQUE(room_id, member_id)
);
--> statement-breakpoint
CREATE INDEX seats_session ON seats(room_id, session_hash);
--> statement-breakpoint
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX messages_mailbox ON messages(room_id, recipient, id);
--> statement-breakpoint
CREATE INDEX messages_expiry ON messages(expires_at);
--> statement-breakpoint
CREATE TABLE limits (
  key TEXT PRIMARY KEY NOT NULL,
  window INTEGER NOT NULL,
  hits INTEGER NOT NULL
);
