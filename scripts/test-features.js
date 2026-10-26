const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "herade-features-test-"));
process.env.DATABASE_PATH = path.join(tempDir, "features.sqlite");
process.env.DISCORD_TOKEN = "test-token";
process.env.CLIENT_ID = "12345678901234567";
process.env.GUILD_ID = "12345678901234568";
process.env.LOG_LEVEL = "error";

const db = require("../src/database");
const { FEATURES, isFeatureEnabled, setFeatureEnabled, listFeatures } = require("../src/features");
const admin = require("../src/commands/admin");
const guildId = process.env.GUILD_ID;
const actorId = "12345678901234569";
let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`[ OK ] ${name}`);
}

function panelInteraction(customId) {
  const ctx = {
    customId,
    guildId,
    guild: { ownerId: actorId, id: guildId, name: "Feature test", memberCount: 2 },
    user: { id: actorId },
    member: { roles: { cache: new Map() } },
    memberPermissions: { has: () => false },
    client: { config: { ownerIds: [actorId] } },
    replied: false,
    deferred: false,
    inGuild: () => true,
    isButton: () => true,
    isModalSubmit: () => false,
    async reply(payload) { this.replied = true; this.lastReply = payload; return payload; },
    async update(payload) { this.replied = true; this.lastUpdate = payload; return payload; },
  };
  return ctx;
}

async function main() {
  await test("feature registry contains only supported toggles", async () => {
    assert.deepEqual(Object.keys(FEATURES), [
      "welcome_messages", "goodbye_messages", "autorole", "spam_detection", "automod", "moderation", "economy",
    ]);
  });
  await test("legacy guild defaults preserve behavior while new automod starts disabled", async () => {
    assert.equal(isFeatureEnabled(guildId, "welcome_messages"), true);
    assert.equal(isFeatureEnabled(guildId, "moderation"), true);
    assert.equal(isFeatureEnabled(guildId, "automod"), false);
  });
  await test("feature toggle persists enabled state and records actor", async () => {
    assert.equal(setFeatureEnabled(guildId, "spam_detection", false, actorId), false);
    assert.equal(isFeatureEnabled(guildId, "spam_detection"), false);
    const row = db.prepare("SELECT enabled, updated_by FROM guild_features WHERE guild_id=? AND feature_key=?")
      .get(guildId, "spam_detection");
    assert.deepEqual(row, { enabled: 0, updated_by: actorId });
    setFeatureEnabled(guildId, "spam_detection", true, actorId);
    assert.equal(isFeatureEnabled(guildId, "spam_detection"), true);
  });
  await test("unknown feature and invalid IDs are rejected", async () => {
    assert.throws(() => isFeatureEnabled(guildId, "unknown"), /Unknown feature/);
    assert.throws(() => setFeatureEnabled("not-a-guild-id", "moderation", false, actorId), /Invalid Discord/);
    assert.throws(() => setFeatureEnabled(guildId, "moderation", 0, actorId), /boolean/);
  });
  await test("feature listing returns state for every supported feature", async () => {
    const list = listFeatures(guildId);
    assert.equal(list.length, 7);
    assert.ok(list.every((entry) => typeof entry.enabled === "boolean" && entry.label && entry.description));
  });
  await test("admin panel toggle persists state and writes audit", async () => {
    const ctx = panelInteraction("ha:feature:toggle:welcome_messages");
    assert.equal(await admin.handle(ctx), true);
    assert.equal(isFeatureEnabled(guildId, "welcome_messages"), false);
    assert.ok(ctx.lastUpdate?.embeds?.length);
    const audit = db.prepare("SELECT action, details FROM admin_audit WHERE guild_id=? ORDER BY id DESC LIMIT 1").get(guildId);
    assert.equal(audit.action, "feature_toggled");
    assert.match(audit.details, /welcome_messages: disabled/);
  });
  await test("admin panel denies unauthorized feature changes", async () => {
    const ctx = panelInteraction("ha:feature:toggle:goodbye_messages");
    ctx.client.config.ownerIds = [];
    ctx.guild.ownerId = "12345678901234570";
    assert.equal(await admin.handle(ctx), true);
    assert.equal(isFeatureEnabled(guildId, "goodbye_messages"), true);
    assert.match(ctx.lastReply.content, /Нет доступа/);
  });
  await test("feature panel lists all switches", async () => {
    const ctx = panelInteraction("ha:features");
    assert.equal(await admin.handle(ctx), true);
    assert.ok(ctx.lastUpdate.embeds[0].data.fields.length === 7);
    assert.ok(ctx.lastUpdate.components.some((row) => row.components.some((button) => button.data.custom_id === "ha:feature:toggle:moderation" && button.data.disabled === false)));
    assert.ok(ctx.lastUpdate.components.every((row) => row.components.every((button) => button.data.disabled === false)));
  });
  await test("disabled moderation blocks panel entry", async () => {
    setFeatureEnabled(guildId, "moderation", false, actorId);
    const ctx = panelInteraction("ha:moderation");
    ctx.isButton = () => true;
    assert.equal(await admin.handle(ctx), true);
    assert.match(ctx.lastReply.content, /модерации отключена/i);
    setFeatureEnabled(guildId, "moderation", true, actorId);
  });
  const dbPath = process.env.DATABASE_PATH;
  db.close();
  const reopened = new Database(dbPath);
  assert.equal(reopened.prepare("SELECT enabled FROM guild_features WHERE guild_id=? AND feature_key=?").get(guildId, "welcome_messages").enabled, 0);
  assert.equal(reopened.prepare("SELECT enabled FROM guild_features WHERE guild_id=? AND feature_key=?").get(guildId, "moderation").enabled, 1);
  reopened.close();
  console.log("[ OK ] feature states survive database close and reopen");
  passed += 1;
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`[test-features] Passed: ${passed}`);
}

main().catch((error) => {
  console.error("[test-features] Failed:", error);
  try { db.close(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.exitCode = 1;
});
