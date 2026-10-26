const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "herade-economy-migration-"));
const filename = path.join(tempDir, "legacy.sqlite");
process.env.DATABASE_PATH = filename;
process.env.DISCORD_TOKEN = "test-token";
process.env.CLIENT_ID = "12345678901234567";
process.env.GUILD_ID = "12345678901234568";
process.env.LOG_LEVEL = "error";

let legacy;
let db;
try {
  legacy = new Database(filename);
  legacy.exec(`CREATE TABLE member_stats (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 0, balance INTEGER NOT NULL DEFAULT 0,
    last_xp_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (guild_id, user_id)
  )`);
  legacy.prepare("INSERT INTO member_stats (guild_id,user_id,xp,level,balance,last_xp_at) VALUES (?,?,?,?,?,?)")
    .run(process.env.GUILD_ID, "12345678901234569", 875, 2, 640, 12345);
  legacy.close();
  legacy = null;

  db = require("../src/database");
  const row = db.prepare("SELECT xp,level,balance,last_xp_at,last_daily_at FROM member_stats WHERE guild_id=? AND user_id=?")
    .get(process.env.GUILD_ID, "12345678901234569");
  assert.deepEqual(row, { xp: 875, level: 2, balance: 640, last_xp_at: 12345, last_daily_at: 0 });
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='economy_daily_quests'").get() === undefined);
  console.log("[ OK ] legacy member stats preserved and missing economy column migrated safely");
} catch (error) {
  console.error("[test-economy-migration] Failed:", error);
  process.exitCode = 1;
} finally {
  try { db?.close(); } catch {}
  try { legacy?.close(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
}
