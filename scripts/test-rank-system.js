const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "herade-ranks-"));
process.env.DATABASE_PATH = path.join(tempDir, "ranks.sqlite");
process.env.DISCORD_TOKEN = "test-token";
process.env.CLIENT_ID = "12345678901234567";
process.env.GUILD_ID = "12345678901234568";
process.env.LOG_LEVEL = "error";

const db = require("../src/database");
const { RANKS, snapshot, rankIndexFor } = require("../src/rank-system");
const DAY = 86_400_000;
const HOUR = 3_600_000;
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`[ OK ] ${name}`);
}

try {
  test("eight ranks are ordered from NEWBIE to LEGEND", () => {
    assert.deepEqual(RANKS.map((rank) => rank.name), [
      "NEWBIE", "GUEST", "MEMBER", "ACTIVE", "VETERAN", "MASTER", "ELITE", "LEGEND",
    ]);
  });

  test("NEWBIE is the default and GUEST requires two days and twenty messages", () => {
    const now = Date.now();
    const row = { joined_at: now - 2 * DAY, message_count: 19, active_days: 1, voice_seconds: 0, voice_started_at: null, last_activity_at: now };
    assert.equal(rankIndexFor(row, now), 0);
    assert.equal(rankIndexFor({ ...row, message_count: 20 }, now), 1);
  });

  test("higher ranks require sufficient voice time", () => {
    const now = Date.now();
    const row = { joined_at: now - 30 * DAY, message_count: 800, active_days: 10, voice_seconds: 5 * HOUR - 1, voice_started_at: null, last_activity_at: now };
    assert.equal(rankIndexFor(row, now), 3);
    assert.equal(rankIndexFor({ ...row, voice_seconds: 5 * HOUR }, now), 4);
  });

  test("LEGEND requires all duration, message, active-day, and voice thresholds", () => {
    const now = Date.now();
    const row = { joined_at: now - 180 * DAY, message_count: 10000, active_days: 60, voice_seconds: 60 * HOUR, voice_started_at: null, last_activity_at: now };
    assert.equal(rankIndexFor(row, now), 7);
    assert.equal(rankIndexFor({ ...row, voice_seconds: 60 * HOUR - 1 }, now), 6);
    assert.equal(snapshot({ ...row, joined_at: now }, now).days, 0);
  });

  test("rank activity schema does not alter existing member balance", () => {
    db.prepare("INSERT INTO member_stats(guild_id,user_id,xp,level,balance) VALUES(?,?,?,?,?)").run(process.env.GUILD_ID, "12345678901234569", 12, 0, 777);
    require("../src/rank-system");
    assert.equal(db.prepare("SELECT balance FROM member_stats WHERE guild_id=? AND user_id=?").get(process.env.GUILD_ID, "12345678901234569").balance, 777);
  });

  db.close();
  console.log(`[test-rank-system] Passed: ${passed}`);
} catch (error) {
  console.error("[test-rank-system] Failed:", error);
  try { db.close(); } catch {}
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
