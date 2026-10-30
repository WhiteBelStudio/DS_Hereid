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
const { RANKS, snapshot, rankIndexFor, recordMessage, recordVoiceState } = require("../src/rank-system");
const DAY = 86_400_000;
const HOUR = 3_600; // rank-system stores voice duration in seconds
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`[ OK ] ${name}`);
}

try {
  test("seven ranks are ordered from NEWBIE to LEGEND and GUEST is removed", () => {
    assert.deepEqual(RANKS.map((rank) => rank.name), [
      "NEWBIE", "MEMBER", "ACTIVE", "VETERAN", "MASTER", "ELITE", "LEGEND",
    ]);
    assert.equal(RANKS.some((rank) => rank.name === "GUEST"), false);
  });

  test("MEMBER requires 7 days, 250 messages, 2 active days, and 1 voice hour", () => {
    const now = Date.now();
    const base = { joined_at: now - 7 * DAY, message_count: 250, active_days: 2, voice_seconds: 3600, voice_started_at: null, last_activity_at: now };
    assert.equal(rankIndexFor({ ...base, joined_at: now - 6 * DAY }, now), 0);
    assert.equal(rankIndexFor({ ...base, message_count: 249 }, now), 0);
    assert.equal(rankIndexFor({ ...base, active_days: 1 }, now), 0);
    assert.equal(rankIndexFor({ ...base, voice_seconds: 3599 }, now), 0);
    assert.equal(rankIndexFor(base, now), 1);
  });

  test("higher ranks require sufficient voice time", () => {
    const now = Date.now();
    const row = { joined_at: now - 30 * DAY, message_count: 800, active_days: 10, voice_seconds: 5 * HOUR - 1, voice_started_at: null, last_activity_at: now };
    assert.equal(rankIndexFor(row, now), 2);
    assert.equal(rankIndexFor({ ...row, voice_seconds: 5 * HOUR }, now), 3);
  });

  test("all configured rank thresholds match the approved table", () => {
    const now = Date.now();
    const expected = [
      ["NEWBIE", 0, 0, 0, 0, 0],
      ["MEMBER", 7, 250, 2, 1, 1],
      ["ACTIVE", 10, 300, 5, 2, 2],
      ["VETERAN", 21, 800, 10, 5, 3],
      ["MASTER", 45, 2000, 20, 10, 4],
      ["ELITE", 90, 4500, 35, 20, 5],
      ["LEGEND", 180, 10000, 60, 40, 6],
    ];
    for (const [name, days, messages, activeDays, voiceHours, index] of expected) {
      const row = {
        joined_at: now - days * DAY,
        message_count: messages,
        active_days: activeDays,
        voice_seconds: voiceHours * HOUR,
        voice_started_at: null,
        last_activity_at: now,
      };
      assert.equal(rankIndexFor(row, now), index, `${name} threshold should map to rank index ${index}`);
    }
  });

  test("LEGEND requires all duration, message, active-day, and voice thresholds", () => {
    const now = Date.now();
    const row = { joined_at: now - 180 * DAY, message_count: 10000, active_days: 60, voice_seconds: 40 * HOUR, voice_started_at: null, last_activity_at: now };
    assert.equal(rankIndexFor(row, now), 6);
    assert.equal(rankIndexFor({ ...row, voice_seconds: 40 * HOUR - 1 }, now), 5);
    assert.equal(snapshot({ ...row, joined_at: now }, now).days, 0);
  });

  test("an active day is counted only after five valid messages", () => {
    const member = { guild: { id: process.env.GUILD_ID }, id: "12345678901234570", user: { bot: false }, joinedTimestamp: Date.now() - 10 * DAY };
    const base = Date.now();
    for (let i = 0; i < 4; i++) recordMessage(member, "A valid message", base + i);
    let row = db.prepare("SELECT message_count,active_days FROM member_rank_activity WHERE guild_id=? AND user_id=?").get(process.env.GUILD_ID, member.id);
    assert.equal(row.message_count, 4);
    assert.equal(row.active_days, 0);
    recordMessage(member, "A fifth valid message", base + 5);
    row = db.prepare("SELECT message_count,active_days FROM member_rank_activity WHERE guild_id=? AND user_id=?").get(process.env.GUILD_ID, member.id);
    assert.equal(row.message_count, 5);
    assert.equal(row.active_days, 1);
    recordMessage(member, "Another valid message", base + 6);
    row = db.prepare("SELECT active_days FROM member_rank_activity WHERE guild_id=? AND user_id=?").get(process.env.GUILD_ID, member.id);
    assert.equal(row.active_days, 1);
  });

  test("AFK voice time is excluded while normal voice time is counted", () => {
    const member = { guild: { id: process.env.GUILD_ID }, id: "12345678901234571", user: { bot: false }, joinedTimestamp: Date.now() - 10 * DAY };
    const start = Date.now();
    recordVoiceState(member, false, true, start, { wasAfk: false, isAfk: false });
    recordVoiceState(member, true, false, start + 3600 * 1000, { wasAfk: false, isAfk: false });
    let row = db.prepare("SELECT voice_seconds FROM member_rank_activity WHERE guild_id=? AND user_id=?").get(process.env.GUILD_ID, member.id);
    assert.equal(row.voice_seconds, 3600);
    recordVoiceState(member, false, true, start + 7200 * 1000, { wasAfk: false, isAfk: true });
    recordVoiceState(member, true, false, start + 10800 * 1000, { wasAfk: true, isAfk: false });
    row = db.prepare("SELECT voice_seconds,voice_started_at FROM member_rank_activity WHERE guild_id=? AND user_id=?").get(process.env.GUILD_ID, member.id);
    assert.equal(row.voice_seconds, 3600);
    assert.equal(row.voice_started_at, null);
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
