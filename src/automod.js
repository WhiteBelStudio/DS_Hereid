const db = require("./database");
const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { isFeatureEnabled } = require("./features");

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>]+/i;
const INVITE_RE = /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i;

function audit(guildId, actorId, action, targetId, details = "") {
  db.prepare("INSERT INTO admin_audit (guild_id, actor_id, action, target_id, details) VALUES (?, ?, ?, ?, ?)")
    .run(guildId, actorId, action, targetId || null, String(details).slice(0, 900));
}
function getSettings(guildId) {
  return db.prepare("SELECT * FROM automod_settings WHERE guild_id=?").get(guildId) || {
    guild_id: guildId, log_channel_id: null, mass_mention_limit: 5,
    filter_links: 0, filter_invites: 1, delete_flagged: 1,
  };
}
function isExempt(message) {
  if (message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  return Boolean(db.prepare("SELECT 1 FROM automod_exempt_channels WHERE guild_id=? AND channel_id=?")
    .get(message.guild.id, message.channel.id));
}
function checkMessage(message) {
  if (!message.guild || message.author.bot || !message.content) return null;
  if (!isFeatureEnabled(message.guild.id, "automod")) return null;
  if (isExempt(message)) return null;
  const settings = getSettings(message.guild.id);
  const content = message.content;
  const words = db.prepare("SELECT term FROM automod_terms WHERE guild_id=?").all(message.guild.id);
  const matchedWord = words.find(({ term }) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, "iu").test(content);
  });
  if (matchedWord) return { kind: "blocked_word", reason: `Найдено запрещённое слово: ${matchedWord.term}` };
  const mentionCount = (message.mentions.users.size || 0) + (message.mentions.roles.size || 0);
  if (mentionCount >= Number(settings.mass_mention_limit || 5)) {
    return { kind: "mass_mentions", reason: `Массовые упоминания: ${mentionCount} (лимит ${settings.mass_mention_limit})` };
  }
  if (settings.filter_invites && INVITE_RE.test(content)) return { kind: "discord_invite", reason: "Ссылка-приглашение Discord" };
  if (settings.filter_links && URL_RE.test(content)) return { kind: "link", reason: "Ссылка заблокирована фильтром" };
  return null;
}
async function logAction(message, result, deleted) {
  const settings = getSettings(message.guild.id);
  audit(message.guild.id, message.author.id, `automod_${result.kind}`, message.author.id,
    `channel=${message.channel.id}; deleted=${deleted}; reason=${result.reason}`);
  if (!settings.log_channel_id) return;
  const channel = await message.guild.channels.fetch(settings.log_channel_id).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) return;
  const embed = new EmbedBuilder().setColor(0xfee75c).setTitle("🧹 Автоматическая модерация")
    .addFields(
      { name: "Участник", value: `${message.author.tag} (${message.author.id})`, inline: true },
      { name: "Канал", value: `<#${message.channel.id}>`, inline: true },
      { name: "Срабатывание", value: result.kind, inline: true },
      { name: "Причина", value: result.reason.slice(0, 1024) },
      { name: "Действие", value: deleted ? "Сообщение удалено" : "Только предупреждение" },
    ).setTimestamp();
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}
async function moderateMessage(message) {
  const result = checkMessage(message);
  if (!result) return false;
  const settings = getSettings(message.guild.id);
  let deleted = false;
  if (settings.delete_flagged) {
    deleted = await message.delete().then(() => true).catch(() => false);
  }
  await logAction(message, result, deleted);
  if (!deleted) {
    await message.reply({
      content: `⚠️ ${message.author}, сообщение отмечено автоматической модерацией: ${result.reason}. Проверь правила сервера.`,
      allowedMentions: { users: [message.author.id], parse: [] },
    }).then((warning) => setTimeout(() => warning.delete().catch(() => {}), 10_000)).catch(() => {});
  } else {
    // A short private warning avoids publicly repeating the filtered content.
    await message.author.send(`⚠️ На сервере **${message.guild.name}** автоматическая модерация удалила твоё сообщение в #${message.channel.name}. Причина: ${result.reason}.`)
      .catch(() => {});
  }
  return true;
}
module.exports = { getSettings, checkMessage, moderateMessage, audit };
