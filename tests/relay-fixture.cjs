"use strict";
const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const backend = resolve(__dirname, "../relay-server");
class D1Fixture {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    this.sqlite.exec(readFileSync(resolve(backend, "drizzle/0000_relay.sql"), "utf8"));
  }
  prepare(sql) {
    const db = this.sqlite;
    const owner = this;
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async first() { const row = db.prepare(sql).get(...values) || null; if (owner.afterRead) await owner.afterRead(sql); return row; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
      async run() { if (owner.beforeRun) await owner.beforeRun(sql); const r = db.prepare(sql).run(...values); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    };
    return statement;
  }
  async batch(statements) {
    const operation = (this.pending || Promise.resolve()).then(async () => {
      this.sqlite.exec("BEGIN");
      try { const result = []; for (const statement of statements) result.push(await statement.run()); this.sqlite.exec("COMMIT"); return result; }
      catch (failure) { this.sqlite.exec("ROLLBACK"); throw failure; }
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
}
async function startRelayFixture() {
  const source = readFileSync(resolve(backend, "worker/index.js"), "utf8");
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const DB = new D1Fixture();
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(`http://127.0.0.1${incoming.url}`, { method: incoming.method, headers: incoming.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
      const response = await worker.fetch(request, { DB }, { waitUntil() {} });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (failure) { outgoing.writeHead(500); outgoing.end(String(failure)); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, DB, close: async () => { await new Promise(resolve => server.close(resolve)); DB.sqlite.close(); } };
}
module.exports = { startRelayFixture };
