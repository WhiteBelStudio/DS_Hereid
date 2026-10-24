const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ChannelType, PermissionFlagsBits } = require("discord.js");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "herade-settings-test-"));
process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
process.env.DISCORD_TOKEN = "test-token";
process.env.CLIENT_ID = "12345678901234567";
process.env.GUILD_ID = "12345678901234568";
process.env.LOG_LEVEL = "error";

const db = require("../src/database");
const command = require("../src/commands/serverconfig");
const guildId = process.env.GUILD_ID;
const userId = "12345678901234569";
let passed = 0;

function interaction(subcommand, options = {}) {
  const result = {
    guildId,
    user: { id: userId },
    client: { logger: { error() {} } },
    replied: false,
    deferred: false,
    inGuild: () => true,
    memberPermissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild },
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => options[name] ?? null,
      getRole: (name) => options[name] ?? null,
      getChannel: (name) => options[name] ?? null,
    },
    guild: {
      members: { fetchMe: async () => ({ id: "12345678901234570" }) },
    },
    async reply(payload) {
      this.replied = true;
      this.lastReply = payload;
      return payload;
    },
  };
  return result;
}

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`[ OK ] ${name}`);
}

async function main() {
  db.prepare(`
    INSERT INTO guild_settings
      (guild_id, welcome_channel_id, welcome_message, autorole_id)
    VALUES (?, ?, ?, ?)
  `).run(guildId, "12345678901234571", "Old welcome", "12345678901234572");
  db.prepare("INSERT INTO member_stats(guild_id,user_id,xp,level,balance) VALUES(?,?,?,?,?)")
    .run(guildId, userId, 250, 3, 40);

  await test("reset-welcome clears only welcome fields and preserves member data", async () => {
    const ctx = interaction("reset-welcome");
    await command.execute(ctx);
    const row = db.prepare("SELECT * FROM guild_settings WHERE guild_id=?").get(guildId);
    assert.equal(row.welcome_channel_id, null);
    assert.equal(row.welcome_message, null);
    assert.equal(row.autorole_id, "12345678901234572");
    assert.deepEqual(
      db.prepare("SELECT xp,level,balance FROM member_stats WHERE guild_id=? AND user_id=?").get(guildId, userId),
      { xp: 250, level: 3, balance: 40 },
    );
    assert.match(ctx.lastReply.content, /Приветствия отключены/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 1);
  });

  await test("welcome-message saves text and creates an audit entry", async () => {
    const ctx = interaction("welcome-message", { message: "Привет, {user}! Добро пожаловать на {server}." });
    await command.execute(ctx);
    assert.equal(
      db.prepare("SELECT welcome_message FROM guild_settings WHERE guild_id=?").get(guildId).welcome_message,
      "Привет, {user}! Добро пожаловать на {server}.",
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 2);
    assert.match(ctx.lastReply.content, /сохранён/);
  });

  await test("welcome-channel refuses a channel when bot permissions are missing", async () => {
    const channel = {
      id: "12345678901234573",
      type: ChannelType.GuildText,
      permissionsFor: () => ({ has: () => false }),
    };
    const ctx = interaction("welcome-channel", { channel });
    await command.execute(ctx);
    assert.equal(db.prepare("SELECT welcome_channel_id FROM guild_settings WHERE guild_id=?").get(guildId).welcome_channel_id, null);
    assert.match(ctx.lastReply.content, /нет прав/i);
  });

  await test("welcome-channel saves a valid text channel with permissions", async () => {
    const channel = {
      id: "12345678901234574",
      type: ChannelType.GuildText,
      permissionsFor: () => ({ has: (permissions) =>
        Array.isArray(permissions) &&
        permissions.includes(PermissionFlagsBits.ViewChannel) &&
        permissions.includes(PermissionFlagsBits.SendMessages) }),
    };
    const ctx = interaction("welcome-channel", { channel });
    await command.execute(ctx);
    assert.equal(db.prepare("SELECT welcome_channel_id FROM guild_settings WHERE guild_id=?").get(guildId).welcome_channel_id, channel.id);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 3);
    assert.match(ctx.lastReply.content, /установлен/);
  });

  console.log(`[test-settings] Passed ${passed} integration checks.`);
}

main()
  .catch((error) => {
    console.error("[test-settings] Failed.", error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (db.open) db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
