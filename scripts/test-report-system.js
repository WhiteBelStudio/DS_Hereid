const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "heradelegend-report-test-"));
process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
process.env.DISCORD_TOKEN = "test-token";
process.env.CLIENT_ID = "123456789012345678";
process.env.GUILD_ID = "234567890123456789";
process.env.BOT_OWNER_IDS = "";
process.env.LOG_LEVEL = "error";

async function run() {
  const db = require("../src/database");
  const reportCommand = require("../src/commands/report");
  const ticketCommand = require("../src/tickets");
  const json = reportCommand.data.toJSON();
  assert.equal(json.name, "report");
  assert.deepEqual(json.options.map((item) => item.name), ["submit", "setup", "list", "resolve"]);
  assert.equal(ticketCommand.data.toJSON().name, "ticket");
  assert.ok(db.prepare("PRAGMA table_info(guild_settings)").all().some((column) => column.name === "report_channel_id"));
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reports'").get()?.name, "reports");

  const guildId = process.env.GUILD_ID;
  const reporterId = "345678901234567890";
  const targetId = "456789012345678901";
  const sent = [];
  const fetchedChannelIds = [];
  db.prepare("INSERT INTO guild_settings (guild_id, report_channel_id) VALUES (?, ?)").run(guildId, "567890123456789012");
  const interaction = {
    customId: "rp:submit:rules:" + targetId,
    guildId,
    user: { id: reporterId, tag: "reporter#0001" },
    guild: { channels: { fetch: async (channelId) => {
      fetchedChannelIds.push(channelId);
      return {
        id: channelId,
        isTextBased: () => true, isSendable: () => true,
        send: async (payload) => { sent.push(payload); },
      };
    } } },
    client: { logger: { error: () => {}, warn: () => {} } },
    fields: { getTextInputValue: (name) => name === "description"
      ? "A detailed report with enough context to review."
      : "https://example.com/evidence" },
    inGuild: () => true,
    reply: async (payload) => { interaction.replyPayload = payload; },
  };
  assert.equal(await reportCommand.handleModal(interaction), true);
  assert.equal(sent.length, 1);
  assert.deepEqual(fetchedChannelIds, ["1564742933872377907"]);
  assert.match(interaction.replyPayload.content, /Репорт #1 отправлен персоналу/);
  const report = db.prepare("SELECT * FROM reports WHERE guild_id=? AND reporter_id=?").get(guildId, reporterId);
  assert.ok(report);
  assert.equal(report.target_id, targetId);
  assert.equal(report.category, "rules");
  assert.equal(report.status, "open");
  assert.equal(report.evidence_url, "https://example.com/evidence");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM admin_audit WHERE action='report_created'").get().count, 1);

  // A legacy or damaged audit table must not prevent the report itself from
  // being stored and acknowledged to the user.
  db.exec("DROP TABLE admin_audit");
  const secondInteraction = {
    ...interaction,
    customId: "rp:submit:spam:none",
    user: { id: "678901234567890123", tag: "reporter2#0001" },
    reply: async (payload) => { secondInteraction.replyPayload = payload; },
  };
  assert.equal(await reportCommand.handleModal(secondInteraction), true);
  assert.match(secondInteraction.replyPayload.content, /Репорт #2 отправлен персоналу/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM reports WHERE guild_id=?").get(guildId).count, 2);

  const staffId = "567890123456789012";
  const resolveInteraction = {
    guildId, user: { id: staffId }, guild: { ownerId: staffId },
    memberPermissions: { has: () => false }, member: { roles: { cache: new Map() } },
    options: { getSubcommand: () => "resolve", getInteger: () => report.id,
      getString: () => "Проверено, обращение передано модерации." },
    inGuild: () => true,
    client: { logger: { warn: () => {} }, users: { fetch: async () => ({ send: async () => {} }) } },
    reply: async (payload) => { resolveInteraction.replyPayload = payload; },
  };
  resolveInteraction.guild.channels = { fetch: async (channelId) => {
    fetchedChannelIds.push(channelId);
    return {
      id: channelId,
      isTextBased: () => true, isSendable: () => true, send: async (payload) => { sent.push(payload); },
    };
  } };
  await reportCommand.execute(resolveInteraction);
  const resolved = db.prepare("SELECT * FROM reports WHERE id=?").get(report.id);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolution, "Проверено, обращение передано модерации.");
  assert.equal(resolved.handled_by, staffId);
  assert.deepEqual(fetchedChannelIds, ["1564742933872377907", "1564742933872377907"]);
  assert.match(resolveInteraction.replyPayload.content, /отмечен как рассмотренный/);
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("[report-test] Report creation, delivery, audit, and resolution passed.");
}
run().catch((error) => { console.error("[report-test] Failed:", error); process.exitCode = 1; });
