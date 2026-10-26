const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const db = require("./database");

const CATEGORIES = [
  { label: "Общий вопрос", value: "general", emoji: "💬", description: "Вопросы по серверу и сообществу" },
  { label: "Техническая проблема", value: "technical", emoji: "🛠️", description: "Ошибки, роли, доступ и работа бота" },
  { label: "Жалоба", value: "report", emoji: "🛡️", description: "Жалоба на участника или ситуацию" },
  { label: "Другое", value: "other", emoji: "📨", description: "Другие обращения" },
];
const STAFF_ROLE_NAMES = new Set(["CHIEF TECH ADMIN", "TECH ADMIN", "ADMINISTRATOR", "HEAD MODERATOR", "SUPPORT"]);

function isStaff(interaction) {
  if (!interaction.inGuild()) return false;
  if (interaction.user.id === interaction.guild.ownerId ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const names = interaction.member?.roles?.cache
    ? [...interaction.member.roles.cache.values()].map((r) => String(r.name || "").trim().toUpperCase())
    : [];
  return names.some((name) => STAFF_ROLE_NAMES.has(name));
}
function audit(guildId, actorId, action, ticketId, details = "") {
  db.prepare("INSERT INTO admin_audit (guild_id, actor_id, action, target_id, details) VALUES (?, ?, ?, ?, ?)")
    .run(guildId, actorId, action, String(ticketId), String(details).slice(0, 900));
}
function ticketByChannel(guildId, channelId) {
  return db.prepare("SELECT * FROM tickets WHERE guild_id=? AND channel_id=?").get(guildId, channelId);
}
function ticketButtons(ticket) {
  const row = new ActionRowBuilder();
  if (ticket.status === "open") {
    row.addComponents(
      new ButtonBuilder().setCustomId(`tk:claim:${ticket.id}`).setLabel("Взять в работу").setEmoji("🙋").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tk:close:${ticket.id}`).setLabel("Закрыть тикет").setEmoji("🔒").setStyle(ButtonStyle.Danger),
    );
  } else {
    row.addComponents(new ButtonBuilder().setCustomId(`tk:reopen:${ticket.id}`).setLabel("Переоткрыть").setEmoji("🔓").setStyle(ButtonStyle.Success));
  }
  return [row];
}
function ticketEmbed(ticket, userLabel) {
  const category = CATEGORIES.find((item) => item.value === ticket.category)?.label || ticket.category || "Не указана";
  return new EmbedBuilder().setColor(ticket.status === "open" ? 0x5865f2 : 0x747f8d)
    .setTitle(`🎫 Тикет #${ticket.id} · ${category}`)
    .setDescription(ticket.initial_message || "Первое сообщение не указано.")
    .addFields(
      { name: "Заявитель", value: userLabel || `<@${ticket.user_id}> (${ticket.user_id})`, inline: true },
      { name: "Статус", value: ticket.status === "open" ? "🟢 Открыт" : "🔒 Закрыт", inline: true },
      { name: "Ответственный", value: ticket.assigned_to ? `<@${ticket.assigned_to}>` : "Не назначен", inline: true },
      { name: "Создан", value: ticket.created_at || "—", inline: true },
      { name: "Закрыт", value: ticket.closed_at || "—", inline: true },
      ...(ticket.close_reason ? [{ name: "Причина закрытия", value: ticket.close_reason.slice(0, 1024), inline: false }] : []),
    )
    .setFooter({ text: `ID обращения: ${ticket.id} · История сообщений сохраняется` });
}
async function createTicket(interaction, categoryValue) {
  const category = CATEGORIES.find((item) => item.value === categoryValue);
  if (!category) {
    await interaction.reply({ content: "Неизвестная категория. Открой панель /ticket заново.", flags: MessageFlags.Ephemeral });
    return;
  }
  const existing = db.prepare("SELECT * FROM tickets WHERE guild_id=? AND user_id=? AND status='open' ORDER BY id DESC LIMIT 1")
    .get(interaction.guildId, interaction.user.id);
  if (existing) {
    const channel = existing.channel_id ? await interaction.guild.channels.fetch(existing.channel_id).catch(() => null) : null;
    if (channel) {
      await interaction.reply({ content: `У тебя уже есть открытый тикет: ${channel}. Сначала продолжи обращение там.`, flags: MessageFlags.Ephemeral });
      return;
    }
    // If the channel was deleted manually, close the stale record rather than allowing duplicate open tickets.
    db.prepare("UPDATE tickets SET status='closed', closed_at=CURRENT_TIMESTAMP, close_reason='Канал тикета удалён вручную' WHERE id=? AND status='open'").run(existing.id);
  }
  const settings = db.prepare("SELECT ticket_category_id FROM guild_settings WHERE guild_id=?").get(interaction.guildId);
  let parent = settings?.ticket_category_id
    ? await interaction.guild.channels.fetch(settings.ticket_category_id).catch(() => null)
    : null;
  if (parent && parent.type !== ChannelType.GuildCategory) parent = null;

  const permissionOverwrites = [
    { id: interaction.guild.roles.everyone.id, deny: ["ViewChannel"] },
    { id: interaction.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks"] },
    { id: interaction.client.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageChannels", "ManageMessages"] },
  ];
  for (const role of interaction.guild.roles.cache.values()) {
    if (STAFF_ROLE_NAMES.has(String(role.name || "").trim().toUpperCase())) {
      permissionOverwrites.push({ id: role.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks"] });
    }
  }
  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 85) + `-${interaction.user.id.slice(-4)}`,
      type: ChannelType.GuildText,
      parent: parent?.id,
      topic: `HeradeLegend ticket · user=${interaction.user.id} · category=${category.value}`,
      permissionOverwrites,
      reason: `Создание тикета пользователем ${interaction.user.id}`,
    });
  } catch (error) {
    await interaction.reply({ content: "⚠️ Не удалось создать приватный канал. Проверь, что у бота есть «Управление каналами» и доступ к выбранной категории.", flags: MessageFlags.Ephemeral });
    interaction.client.logger?.error("Ticket channel creation failed.", error);
    return;
  }

  let ticketId;
  try {
    ticketId = db.prepare(
      "INSERT INTO tickets (guild_id, channel_id, user_id, status, category, initial_message) VALUES (?, ?, ?, 'open', ?, ?)",
    ).run(interaction.guildId, channel.id, interaction.user.id, category.value, "Обращение создано. Напиши подробности следующим сообщением.").lastInsertRowid;
    audit(interaction.guildId, interaction.user.id, "ticket_created", ticketId, `category=${category.value}; channel=${channel.id}`);
  } catch (error) {
    await channel.delete("Не удалось сохранить тикет в базе данных").catch(() => {});
    throw error;
  }
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticketId);
  await channel.send({
    content: `<@!${interaction.user.id}> · <@&${interaction.guild.roles.cache.find((r) => STAFF_ROLE_NAMES.has(String(r.name || "").trim().toUpperCase()))?.id || interaction.guild.ownerId}>`,
    embeds: [ticketEmbed(ticket, `${interaction.user.tag} (${interaction.user.id})`)],
    components: ticketButtons(ticket),
    allowedMentions: { users: [interaction.user.id], roles: [], parse: [] },
  });
  db.prepare("INSERT INTO support_ticket_messages (ticket_id, guild_id, author_id, author_tag, content, message_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(ticketId, interaction.guildId, interaction.user.id, interaction.user.tag, "Обращение создано.", null);
  await interaction.reply({ content: `✅ Тикет #${ticketId} создан: ${channel}. Продолжай общение в приватном канале.`, flags: MessageFlags.Ephemeral });
}
async function handle(interaction) {
  const id = interaction.customId || "";
  if (!id.startsWith("tk:")) return false;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "Тикеты доступны только на сервере.", flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }
  if (id === "tk:panel") {
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🎫 Поддержка HeradeLegend")
      .setDescription("Выбери категорию обращения. Тикет создаст приватный канал, доступный тебе и персоналу. Одновременно разрешён один открытый тикет.")
      .addFields(CATEGORIES.map((c) => ({ name: `${c.emoji} ${c.label}`, value: c.description, inline: true })));
    const rows = CATEGORIES.map((c) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tk:create:${c.value}`).setLabel(c.label).setEmoji(c.emoji).setStyle(ButtonStyle.Primary),
    ));
    await interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (id.startsWith("tk:create:")) {
    await createTicket(interaction, id.slice("tk:create:".length));
    return true;
  }
  const match = id.match(/^tk:(claim|close|reopen):(\d+)$/);
  if (!match) {
    await interaction.reply({ content: "Это действие тикета устарело. Используй /ticket или /tickets.", flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }
  const [, action, rawId] = match;
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=? AND guild_id=?").get(Number(rawId), interaction.guildId);
  if (!ticket) {
    await interaction.reply({ content: "Тикет не найден в базе данных.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "claim" || action === "close" || action === "reopen") {
    if (!isStaff(interaction)) {
      await interaction.reply({ content: "⛔ Это действие доступно только персоналу поддержки.", flags: MessageFlags.Ephemeral });
      return true;
    }
  }
  if (action === "claim") {
    if (ticket.status !== "open") {
      await interaction.reply({ content: "Закрытый тикет нельзя взять в работу.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (ticket.assigned_to && ticket.assigned_to !== interaction.user.id) {
      await interaction.reply({ content: `Тикет уже назначен <@${ticket.assigned_to}>.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    db.prepare("UPDATE tickets SET assigned_to=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'").run(interaction.user.id, ticket.id);
    audit(interaction.guildId, interaction.user.id, "ticket_claimed", ticket.id, "Ответственный назначен");
    const updated = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticket.id);
    await interaction.update({ embeds: [ticketEmbed(updated, `<@${ticket.user_id}>`)], components: ticketButtons(updated) });
    await interaction.followUp({ content: `✅ Ты назначен ответственным за тикет #${ticket.id}.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "close") {
    const modal = new ModalBuilder().setCustomId(`tk:closemodal:${ticket.id}`).setTitle(`Закрытие тикета #${ticket.id}`);
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("reason").setLabel("Причина закрытия")
        .setPlaceholder("Кратко опиши, почему обращение закрывается").setStyle(TextInputStyle.Paragraph)
        .setMinLength(3).setMaxLength(500).setRequired(true),
    ));
    await interaction.showModal(modal);
    return true;
  }
  if (action === "reopen") {
    if (ticket.status === "open") {
      await interaction.reply({ content: "Тикет уже открыт.", flags: MessageFlags.Ephemeral });
      return true;
    }
    db.prepare("UPDATE tickets SET status='open', closed_at=NULL, closed_by=NULL, close_reason=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(ticket.id);
    const channel = await interaction.guild.channels.fetch(ticket.channel_id).catch(() => null);
    if (channel) await channel.permissionOverwrites.edit(ticket.user_id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }).catch(() => {});
    audit(interaction.guildId, interaction.user.id, "ticket_reopened", ticket.id);
    const updated = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticket.id);
    await interaction.update({ embeds: [ticketEmbed(updated, `<@${ticket.user_id}>`)], components: ticketButtons(updated) });
    return true;
  }
  if (interaction.isModalSubmit() && id.startsWith("tk:closemodal:")) return true;
  return true;
}
async function handleModal(interaction) {
  const id = interaction.customId || "";
  const match = id.match(/^tk:closemodal:(\d+)$/);
  if (!match) return false;
  if (!interaction.inGuild() || !isStaff(interaction)) {
    await interaction.reply({ content: "⛔ Закрывать тикеты может только персонал.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=? AND guild_id=?").get(Number(match[1]), interaction.guildId);
  if (!ticket || ticket.status !== "open") {
    await interaction.reply({ content: "Тикет уже закрыт или не найден.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const reason = interaction.fields.getTextInputValue("reason").trim();
  if (reason.length < 3) {
    await interaction.reply({ content: "Укажи причину закрытия длиной не менее 3 символов.", flags: MessageFlags.Ephemeral });
    return true;
  }
  db.prepare("UPDATE tickets SET status='closed', closed_at=CURRENT_TIMESTAMP, closed_by=?, close_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'")
    .run(interaction.user.id, reason, ticket.id);
  const channel = await interaction.guild.channels.fetch(ticket.channel_id).catch(() => null);
  if (channel) {
    await channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false, ViewChannel: true, ReadMessageHistory: true }).catch(() => {});
    const updated = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticket.id);
    await channel.send({ embeds: [ticketEmbed(updated, `<@${ticket.user_id}>`)], components: ticketButtons(updated) }).catch(() => {});
  }
  audit(interaction.guildId, interaction.user.id, "ticket_closed", ticket.id, reason);
  db.prepare("INSERT INTO support_ticket_messages (ticket_id, guild_id, author_id, author_tag, content) VALUES (?, ?, ?, ?, ?)")
    .run(ticket.id, interaction.guildId, interaction.user.id, interaction.user.tag, `Тикет закрыт: ${reason}`);
  await interaction.reply({ content: `🔒 Тикет #${ticket.id} закрыт. Причина сохранена в истории.`, flags: MessageFlags.Ephemeral });
  return true;
}
async function recordMessage(message) {
  if (!message.guild || !message.channel || message.author.bot) return;
  const ticket = ticketByChannel(message.guild.id, message.channel.id);
  if (!ticket) return;
  db.prepare("INSERT INTO support_ticket_messages (ticket_id, guild_id, author_id, author_tag, content, message_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(ticket.id, message.guild.id, message.author.id, message.author.tag, (message.content || "[вложение/встраиваемое сообщение]").slice(0, 4000), message.id);
  db.prepare("UPDATE tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(ticket.id);
}
async function listTickets(interaction, showAll = false) {
  if (!isStaff(interaction)) {
    await interaction.reply({ content: "⛔ Список тикетов доступен только персоналу поддержки.", flags: MessageFlags.Ephemeral });
    return;
  }
  const rows = db.prepare(
    `SELECT * FROM tickets WHERE guild_id=? ${showAll ? "" : "AND status='open'"} ORDER BY id DESC LIMIT 15`,
  ).all(interaction.guildId);
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(showAll ? "🎫 История обращений" : "🎫 Открытые тикеты")
    .setDescription(rows.length ? rows.map((t) =>
      `**#${t.id}** · ${t.status === "open" ? "🟢 Открыт" : "🔒 Закрыт"} · ${CATEGORIES.find((c) => c.value === t.category)?.label || "Другое"}\nЗаявитель: <@${t.user_id}> · Ответственный: ${t.assigned_to ? `<@${t.assigned_to}>` : "не назначен"}\nКанал: ${t.channel_id ? `<#${t.channel_id}>` : "удалён"}`,
    ).join("\n\n").slice(0, 4000) : "Обращений пока нет.");
  embed.setFooter({ text: "Для полной истории открой канал тикета; журнал действий доступен через /admin → Аудит." });
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
module.exports = {
  data: new SlashCommandBuilder().setName("ticket").setDescription("Открыть панель поддержки HeradeLegend."),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Команда доступна только на сервере.", flags: MessageFlags.Ephemeral });
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🎫 Поддержка HeradeLegend")
      .setDescription("Создай приватное обращение. Одновременно разрешён один открытый тикет на участника.");
    const rows = CATEGORIES.map((c) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tk:create:${c.value}`).setLabel(c.label).setEmoji(c.emoji).setStyle(ButtonStyle.Primary),
    ));
    await interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
  },
  handle,
  handleModal,
  recordMessage,
  listTickets,
  isStaff,
};
