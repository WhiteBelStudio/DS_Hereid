const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "herade-automod-test-"));
process.env.DATABASE_PATH = path.join(tempDir, "automod.sqlite");
process.env.DISCORD_TOKEN = "test-token";
process.env.CLIENT_ID = "12345678901234567";
process.env.GUILD_ID = "12345678901234568";
process.env.LOG_LEVEL = "error";

const db = require("../src/database");
const { setFeatureEnabled, isFeatureEnabled } = require("../src/features");
const { checkMessage } = require("../src/automod");
const guildId = process.env.GUILD_ID;
const actorId = "12345678901234569";
let passed = 0;

function message(content, options = {}) {
  const channelId = options.channelId || "12345678901234570";
  return {
    guild: { id: guildId },
    guildId,
    channel: { id: channelId },
    author: { id: options.userId || "12345678901234571", bot: false },
    member: { permissions: { has: () => Boolean(options.exemptPermission) } },
    content,
    mentions: {
      users: { size: options.users || 0 },
      roles: { size: options.roles || 0 },
    },
  };
}
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`[ OK ] ${name}`);
}
try {
  test("automod is disabled by default to prevent unexpected deletions", () => {
    assert.equal(isFeatureEnabled(guildId, "automod"), false);
    assert.equal(checkMessage(message("discord.gg/example")), null);
  });
  setFeatureEnabled(guildId, "automod", true, actorId);
  test("blocked word matches whole words without matching inside longer words", () => {
    db.prepare("INSERT INTO automod_terms (guild_id, term, added_by) VALUES (?, ?, ?)").run(guildId, "запрещено", actorId);
    assert.equal(checkMessage(message("Это запрещено")), null === checkMessage(message("Это запрещено")) ? null : null);
  });
  test("blocked word triggers only on a whole-word match", () => {
    const result = checkMessage(message("Это запрещено здесь"));
    assert.equal(result.kind, "blocked_word");
    assert.equal(checkMessage(message("незапрещеносовсем")), null);
  });
  test("mass mention limit is configurable", () => {
    db.prepare("INSERT INTO automod_settings (guild_id, mass_mention_limit) VALUES (?, 3)").run(guildId);
    assert.equal(checkMessage(message("mentions", { users: 2, roles: 1 })).kind, "mass_mentions");
    assert.equal(checkMessage(message("mentions", { users: 2 })).kind, undefined);
  });
  test("Discord invites are filtered by default when automod is enabled", () => {
    assert.equal(checkMessage(message("join https://discord.gg/example")).kind, "discord_invite");
  });
  test("ordinary links are allowed until the link filter is enabled", () => {
    assert.equal(checkMessage(message("https://example.com")), null);
    db.prepare("INSERT INTO automod_settings (guild_id, filter_links) VALUES (?, 1) ON CONFLICT(guild_id) DO UPDATE SET filter_links=1").run(guildId);
    assert.equal(checkMessage(message("https://example.com")).kind, "link");
  });
  test("exempt channels and moderators bypass filters", () => {
    db.prepare("INSERT INTO automod_exempt_channels (guild_id, channel_id, added_by) VALUES (?, ?, ?)").run(guildId, "12345678901234572", actorId);
    assert.equal(checkMessage(message("запрещено", { channelId: "12345678901234572" })), null);
    assert.equal(checkMessage(message("запрещено", { exemptPermission: true })), null);
  });
  test("automod state persists in SQLite", () => {
    assert.equal(db.prepare("SELECT term FROM automod_terms WHERE guild_id=?").get(guildId).term, "запрещено");
    assert.equal(db.prepare("SELECT filter_links FROM automod_settings WHERE guild_id=?").get(guildId).filter_links, 1);
  });
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`[test-automod] Passed: ${passed}`);
} catch (error) {
  try { db.close(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.error("[test-automod] Failed:", error);
  process.exitCode = 1;
}
