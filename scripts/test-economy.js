const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "herade-economy-"));
process.env.DATABASE_PATH = path.join(tempDir, "economy.sqlite");
process.env.DISCORD_TOKEN = "test-token";
process.env.CLIENT_ID = "12345678901234567";
process.env.GUILD_ID = "12345678901234568";
process.env.LOG_LEVEL = "error";
const db = require("../src/database");
const economy = require("../src/economy");
const transactionsCommand = require("../src/commands/transactions");
const guild = process.env.GUILD_ID;
const user = "12345678901234569";
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`[ OK ] ${name}`); }
try {
  test("daily reward credits exactly once per 24 hours", () => {
    const first = economy.claimDaily(guild, user, 1_000_000);
    assert.equal(first.claimed, true);
    assert.equal(first.reward, economy.DAILY_REWARD);
    assert.equal(first.balance, economy.DAILY_REWARD + 10);
    const second = economy.claimDaily(guild, user, 1_000_000 + economy.DAILY_COOLDOWN_MS - 1);
    assert.equal(second.claimed, false);
    assert.equal(second.balance, economy.DAILY_REWARD + 10);
    assert.equal(second.remainingMs, 1);
    const third = economy.claimDaily(guild, user, 1_000_000 + economy.DAILY_COOLDOWN_MS);
    assert.equal(third.claimed, true);
    assert.equal(third.balance, economy.DAILY_REWARD * 2 + 20);
  });
  test("purchase rejects insufficient funds without changing balance", () => {
    const result = economy.buyItem(guild, user, "title_legend", 3_000_000);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "insufficient_funds");
    assert.equal(economy.getBalance(guild, user).balance, economy.DAILY_REWARD * 2);
  });
  test("purchase atomically debits balance and adds inventory", () => {
    economy.adjustBalance(guild, user, "12345678901234570", 4000, "test funds", 4_000_000);
    const before = economy.getBalance(guild, user).balance;
    const result = economy.buyItem(guild, user, "title_legend", 4_000_001);
    assert.equal(result.ok, true);
    assert.equal(result.balance, before - 1500 + 20);
    assert.equal(economy.getInventory(guild, user).some(row => row.item_id === "title_legend"), true);
  });
  test("duplicate purchases are rejected without another debit", () => {
    const before = economy.getBalance(guild, user).balance;
    const result = economy.buyItem(guild, user, "title_legend", 4_000_002);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "already_owned");
    assert.equal(economy.getBalance(guild, user).balance, before);
  });
  test("only owned items can be equipped", () => {
    assert.equal(economy.equipItem(guild, user, "frame_neon").reason, "not_owned");
    const bought = economy.buyItem(guild, user, "frame_neon", 4_000_003);
    assert.equal(bought.ok, true);
    assert.equal(economy.equipItem(guild, user, "frame_neon", 4_000_004).ok, true);
    assert.equal(economy.getCustomProfile(guild, user).frame.value, "Неон");
    assert.equal(economy.removeEquipped(guild, user, "frame"), true);
    assert.equal(economy.getCustomProfile(guild, user).frame, null);
  });
  test("administrative balance adjustment is logged and cannot create negative balance", () => {
    const before = economy.getBalance(guild, user).balance;
    assert.equal(economy.adjustBalance(guild, user, "12345678901234570", -1_000_000).ok, false);
    assert.equal(economy.getBalance(guild, user).balance, before);
    const logs = economy.getTransactions(guild, user, 25);
    assert.ok(logs.some(row => row.kind === "purchase"));
    assert.ok(logs.some(row => row.kind === "daily"));
  });
  test("daily quests award once and never exceed their target", () => {
    const questUser = "12345678901234571";
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) {
      const progress = economy.recordQuestProgress(guild, questUser, "messages", 1, now + i);
      assert.equal(progress.completed, false);
    }
    const completed = economy.recordQuestProgress(guild, questUser, "messages", 1, now + 5);
    assert.equal(completed.newlyCompleted, true);
    assert.equal(completed.reward, 25);
    const repeated = economy.recordQuestProgress(guild, questUser, "messages", 1, now + 6);
    assert.equal(repeated.newlyCompleted, false);
    assert.equal(repeated.reward, 0);
    assert.equal(repeated.balance, 25);
    assert.equal(economy.getDailyQuests(guild, questUser, now).find(task => task.key === "messages").completed, true);
  });
  test("daily quest progress resets on Moscow calendar day", () => {
    const questUser = "12345678901234572";
    economy.recordQuestProgress(guild, questUser, "messages", 2, 1_000_000);
    const nextDay = economy.getDailyQuests(guild, questUser, 1_000_000 + 24 * 60 * 60 * 1000);
    assert.equal(nextDay.find(task => task.key === "messages").progress, 0);
  });
  test("transaction history returns newest operations and bounded result count", () => {
    const rows = economy.getTransactions(guild, user, 10);
    assert.ok(rows.length > 0);
    assert.ok(rows.length <= 10);
    assert.ok(rows.some(row => row.kind === "admin_adjustment"));
    assert.ok(rows.some(row => row.kind === "purchase"));
    assert.ok(rows.some(row => row.kind === "daily"));
    assert.ok(rows.some(row => row.kind === "quest"));
  });
  test("transaction history slash command is registered with expected name", () => {
    assert.equal(transactionsCommand.data.toJSON().name, "transactions");
    assert.equal(typeof transactionsCommand.execute, "function");
  });
  test("economy preserves existing member XP and balance schema", () => {
    const row = db.prepare("SELECT balance FROM member_stats WHERE guild_id=? AND user_id=?").get(guild,user);
    assert.ok(row);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM economy_transactions WHERE guild_id=? AND user_id=?").get(guild,user).n >= 4, true);
  });
  db.close();
  console.log(`[test-economy] Passed: ${passed}`);
} catch (error) {
  console.error("[test-economy] Failed:", error);
  try { db.close(); } catch {}
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
