const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "herade-achievements-"));
process.env.DATABASE_PATH = path.join(tempDir, "achievements.sqlite");
process.env.DISCORD_TOKEN = "test-token";
process.env.CLIENT_ID = "12345678901234567";
process.env.GUILD_ID = "12345678901234568";
process.env.LOG_LEVEL = "error";

const db = require("../src/database");
const { recordMessage } = require("../src/rank-system");
const { changeXp } = require("../src/member-profile");
const { ACHIEVEMENTS, evaluateAchievements, listAchievements } = require("../src/achievements");
const guildId = process.env.GUILD_ID;
const userId = "12345678901234569";
const member = {
  guild: { id: guildId },
  id: userId,
  user: { bot: false },
  joinedTimestamp: Date.now() - 40 * 86400000,
};
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`[ OK ] ${name}`);
}

try {
  test("achievement catalog has unique IDs", () => {
    const ids = ACHIEVEMENTS.map((item) => item.id);
    assert.equal(ids.length, new Set(ids).size);
    assert.ok(ids.length >= 10);
  });

  test("message achievements unlock and are listed", () => {
    recordMessage(member, "A valid first message", Date.now());
    const unlocked = evaluateAchievements(guildId, userId);
    assert.ok(unlocked.some((item) => item.id === "first_message"));
    assert.ok(listAchievements(guildId, userId).find((item) => item.id === "first_message").unlocked);
  });

  test("achievement rewards are not duplicated on repeated evaluation", () => {
    assert.deepEqual(evaluateAchievements(guildId, userId), []);
    for (let i = 0; i < 9; i++) recordMessage(member, `A valid test message number ${i}`, Date.now() + i + 1);
    const unlocked = evaluateAchievements(guildId, userId);
    assert.ok(unlocked.some((item) => item.id === "messages_10"));
    assert.deepEqual(evaluateAchievements(guildId, userId), []);
  });

  test("level achievements use persisted XP", () => {
    changeXp(guildId, userId, 2500);
    const unlocked = evaluateAchievements(guildId, userId);
    assert.ok(unlocked.some((item) => item.id === "level_5"));
  });

  test("voice achievements unlock after recorded voice time", () => {
    const { recordVoiceState } = require("../src/rank-system");
    const voiceMember = {
      guild: { id: guildId },
      id: "12345678901234571",
      user: { bot: false },
      joinedTimestamp: Date.now() - 40 * 86400000,
    };
    const start = Date.now();
    recordVoiceState(voiceMember, false, true, start, { wasAfk: false, isAfk: false });
    recordVoiceState(voiceMember, true, false, start + 3600000, { wasAfk: false, isAfk: false });
    const unlocked = evaluateAchievements(guildId, voiceMember.id);
    assert.ok(unlocked.some((item) => item.id === "voice_1h"));
    assert.deepEqual(evaluateAchievements(guildId, voiceMember.id), []);
  });

  test("achievement records survive database close and reopen", () => {
    const countBefore = db.prepare("SELECT COUNT(*) AS count FROM member_achievements WHERE guild_id=? AND user_id=?").get(guildId, userId).count;
    assert.ok(countBefore >= 3);
    const filename = process.env.DATABASE_PATH;
    db.close();
    const Database = require("better-sqlite3");
    const reopened = new Database(filename);
    assert.equal(reopened.prepare("SELECT COUNT(*) AS count FROM member_achievements WHERE guild_id=? AND user_id=?").get(guildId, userId).count, countBefore);
    reopened.close();
  });

  console.log(`[test-achievements] Passed: ${passed}`);
} catch (error) {
  console.error("[test-achievements] Failed:", error);
  try { db.close(); } catch {}
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
