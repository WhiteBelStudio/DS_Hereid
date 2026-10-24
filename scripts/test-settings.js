const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const Database = require("better-sqlite3");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "herade-settings-test-"));
process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
process.env.DISCORD_TOKEN = "test-token";
process.env.CLIENT_ID = "12345678901234567";
process.env.GUILD_ID = "12345678901234568";
process.env.LOG_LEVEL = "error";

const db = require("../src/database");
const command = require("../src/commands/serverconfig");
const adminPanel = require("../src/commands/admin");
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



function testChannel(id, name) {
  return {
    id,
    name,
    type: ChannelType.GuildText,
    isTextBased: () => true,
    isSendable: () => true,
    permissionsFor: () => ({ has: (permissions) =>
      Array.isArray(permissions) &&
      permissions.includes(PermissionFlagsBits.ViewChannel) &&
      permissions.includes(PermissionFlagsBits.SendMessages) }),
  };
}


function adminButtonInteraction(customId) {
  const ctx = adminInteraction(customId);
  ctx.isButton = () => true;
  ctx.showModal = async (modal) => {
    ctx.lastModal = modal;
    return modal;
  };
  return ctx;
}

function adminInteraction(customId, fields = {}, { channel = null, role = null } = {}) {
  const ctx = interaction("unused");
  ctx.customId = customId;
  ctx.guild = {
    ownerId: userId,
    name: "HeradeLegend test server",
    memberCount: 5,
    channels: {
      fetch: async (id) => channel?.id === id ? channel : null,
    },
    members: { fetchMe: async () => ({ id: "12345678901234570" }) },
    roles: { fetch: async (id) => role?.id === id ? role : null },
  };
  ctx.member = { roles: { cache: new Map() } };
  ctx.client.config = { ownerIds: [userId] };
  ctx.isButton = () => false;
  ctx.isModalSubmit = () => customId.startsWith("ha:modal:");
  ctx.fields = { getTextInputValue: (name) => fields[name] ?? "" };
  return ctx;
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


  await test("admin panel reset clears related settings atomically and records audit", async () => {
    db.prepare("UPDATE guild_settings SET welcome_channel_id=?, welcome_message=? WHERE guild_id=?")
      .run("12345678901234575", "Panel welcome", guildId);
    const ctx = adminInteraction("ha:settings:reset-welcome");
    await adminPanel.handle(ctx);
    const row = db.prepare("SELECT welcome_channel_id,welcome_message,autorole_id FROM guild_settings WHERE guild_id=?").get(guildId);
    assert.equal(row.welcome_channel_id, null);
    assert.equal(row.welcome_message, null);
    assert.equal(row.autorole_id, "12345678901234572");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 4);
    assert.match(ctx.lastReply.content, /Приветствия отключены/);
  });

  await test("admin panel rejects a channel when bot permissions are missing", async () => {
    const channel = {
      id: "12345678901234576",
      type: ChannelType.GuildText,
      name: "restricted",
      isTextBased: () => true,
      isSendable: () => true,
      permissionsFor: () => ({ has: () => false }),
    };
    const ctx = adminInteraction("ha:modal:setting:welcome", {
      target_id: channel.id,
      message: "Welcome",
    }, { channel });
    await adminPanel.handle(ctx);
    assert.equal(db.prepare("SELECT welcome_channel_id FROM guild_settings WHERE guild_id=?").get(guildId).welcome_channel_id, null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 4);
    assert.match(ctx.lastReply.content, /нет прав/i);
  });

  await test("admin panel saves a valid channel, message, and audit record", async () => {
    const channel = {
      id: "12345678901234577",
      type: ChannelType.GuildText,
      name: "welcome",
      isTextBased: () => true,
      isSendable: () => true,
      permissionsFor: () => ({ has: (permissions) =>
        Array.isArray(permissions) &&
        permissions.includes(PermissionFlagsBits.ViewChannel) &&
        permissions.includes(PermissionFlagsBits.SendMessages) }),
    };
    const ctx = adminInteraction("ha:modal:setting:welcome", {
      target_id: channel.id,
      message: "Welcome {user} to {server}",
    }, { channel });
    await adminPanel.handle(ctx);
    const row = db.prepare("SELECT welcome_channel_id,welcome_message FROM guild_settings WHERE guild_id=?").get(guildId);
    assert.equal(row.welcome_channel_id, channel.id);
    assert.equal(row.welcome_message, "Welcome {user} to {server}");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 5);
    assert.match(ctx.lastReply.content, /Настройка сохранена/);
  });


  await test("admin panel saves goodbye channel and custom message", async () => {
    const channel = testChannel("12345678901234578", "goodbye");
    const ctx = adminInteraction("ha:modal:setting:goodbye", {
      target_id: channel.id,
      message: "Goodbye {user}",
    }, { channel });
    await adminPanel.handle(ctx);
    const row = db.prepare("SELECT goodbye_channel_id,goodbye_message FROM guild_settings WHERE guild_id=?").get(guildId);
    assert.equal(row.goodbye_channel_id, channel.id);
    assert.equal(row.goodbye_message, "Goodbye {user}");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 6);
  });

  await test("admin panel saves moderation-log channel", async () => {
    const channel = testChannel("12345678901234579", "mod-log");
    const ctx = adminInteraction("ha:modal:setting:modlog", { target_id: channel.id }, { channel });
    await adminPanel.handle(ctx);
    assert.equal(db.prepare("SELECT mod_log_channel_id FROM guild_settings WHERE guild_id=?").get(guildId).mod_log_channel_id, channel.id);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 7);
  });

  await test("admin panel saves a manageable automatic role", async () => {
    const role = { id: "12345678901234580", name: "Member", managed: false, editable: true };
    const ctx = adminInteraction("ha:modal:setting:autorole", { target_id: role.id }, { role });
    await adminPanel.handle(ctx);
    assert.equal(db.prepare("SELECT autorole_id FROM guild_settings WHERE guild_id=?").get(guildId).autorole_id, role.id);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 8);
  });

  await test("admin panel reset-goodbye clears both goodbye fields", async () => {
    const ctx = adminInteraction("ha:settings:reset-goodbye");
    await adminPanel.handle(ctx);
    const row = db.prepare("SELECT goodbye_channel_id,goodbye_message FROM guild_settings WHERE guild_id=?").get(guildId);
    assert.equal(row.goodbye_channel_id, null);
    assert.equal(row.goodbye_message, null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 9);
  });

  await test("admin panel reset-autorole clears only the automatic role", async () => {
    const ctx = adminInteraction("ha:settings:reset-autorole");
    await adminPanel.handle(ctx);
    const row = db.prepare("SELECT autorole_id,mod_log_channel_id FROM guild_settings WHERE guild_id=?").get(guildId);
    assert.equal(row.autorole_id, null);
    assert.equal(row.mod_log_channel_id, "12345678901234579");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 10);
  });

  await test("admin panel reset-modlog clears the moderation-log channel", async () => {
    const ctx = adminInteraction("ha:settings:reset-modlog");
    await adminPanel.handle(ctx);
    assert.equal(db.prepare("SELECT mod_log_channel_id FROM guild_settings WHERE guild_id=?").get(guildId).mod_log_channel_id, null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE guild_id=?").get(guildId).n, 11);
  });


  await test("admin settings panel exposes all setting and reset controls", async () => {
    const ctx = adminButtonInteraction("ha:settings");
    await adminPanel.handle(ctx);
    const ids = ctx.lastReply.components.flatMap((row) => row.components.map((component) => component.data.custom_id));
    for (const id of [
      "ha:settings:welcome", "ha:settings:goodbye", "ha:settings:autorole", "ha:settings:modlog",
      "ha:settings:reset-welcome", "ha:settings:reset-goodbye",
      "ha:settings:reset-autorole", "ha:settings:reset-modlog",
    ]) assert.ok(ids.includes(id), `missing control: ${id}`);
  });

  await test("each settings button opens the matching modal", async () => {
    for (const action of ["welcome", "goodbye", "autorole", "modlog"]) {
      const ctx = adminButtonInteraction(`ha:settings:${action}`);
      await adminPanel.handle(ctx);
      assert.equal(ctx.lastModal.toJSON().custom_id, `ha:modal:setting:${action}`);
      assert.equal(ctx.lastModal.toJSON().components.length, action === "welcome" || action === "goodbye" ? 2 : 1);
    }
  });


  await test("settings and member data survive closing and reopening SQLite", async () => {
    const ctx = interaction("welcome-message", { message: "Persisted after restart: {user}" });
    await command.execute(ctx);
    const filename = process.env.DATABASE_PATH;
    db.close();
    const reopened = new Database(filename);
    try {
      assert.equal(
        reopened.prepare("SELECT welcome_message FROM guild_settings WHERE guild_id=?").get(guildId).welcome_message,
        "Persisted after restart: {user}",
      );
      assert.deepEqual(
        reopened.prepare("SELECT xp,level,balance FROM member_stats WHERE guild_id=? AND user_id=?").get(guildId, userId),
        { xp: 250, level: 3, balance: 40 },
      );
    } finally {
      reopened.close();
    }
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
