const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");

function canSeeAdminHelp(interaction) {
  if (!interaction.inGuild()) return false;
  if (interaction.user.id === interaction.guild.ownerId ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const roleNames = interaction.member?.roles?.cache
    ? [...interaction.member.roles.cache.values()].map((role) => String(role.name || "").trim().toUpperCase())
    : [];
  return roleNames.some((name) => ["CHIEF TECH ADMIN", "ADMINISTRATOR", "HEAD MODERATOR"].includes(name));
}
module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Список команд HeradeLegend с учётом твоих прав."),
  async execute(interaction) {
    const adminView = canSeeAdminHelp(interaction);
    const embed = new EmbedBuilder().setColor(0x5865f2)
      .setTitle(adminView ? "🕊 HeradeLegend — команды и управление" : "🕊 HeradeLegend — команды участника")
      .setDescription(adminView
        ? "Показаны обычные команды и административные команды, доступные персоналу. Доступ к самим функциям дополнительно проверяется ботом."
        : "Показаны команды для обычных участников. Административные команды здесь не отображаются.")
      .addFields({
        name: "📌 Основные команды",
        value: [
          "`/help` — список команд с учётом твоих прав.",
          "`/commandrules` — подробная справка по командам.",
          "`/ping` — проверить отклик бота.",
          "`/botinfo` — сведения о боте и времени работы.",
          "`/profile` — уровень, XP, баланс и кастомизация профиля.",
          "`/profile member:@участник` — профиль другого участника.",
          "`/leaderboard` — рейтинг по рангу и активности.",
          "`/balance` — проверить баланс монет.",
          "`/daily` — получить 100 монет раз в 24 часа.",
          "`/quests` — ежедневные задания и автоматические награды.",
          "`/shop` — каталог титулов, значков, рамок и цветов.",
          "`/buy item_id:<ID>` — купить предмет из магазина.",
          "`/inventory` — посмотреть купленные предметы.",
          "`/transactions` — последние операции с монетами.",
          "`/ticket` — открыть приватное обращение в поддержку.",
          "`/automod status` — проверить настройки автоматической модерации.",
          "`/automation list` — посмотреть запланированные объявления.",
        "`/automod word-add` и `/automod word-remove` — настроить фильтр запрещённых слов и фраз.",
        "`/automod exempt-add` и `/automod exempt-remove` — управлять исключениями каналов.",
        "`/automod log-channel`, `/automod links`, `/automod mentions-limit`, `/automod delete-flagged` — настроить журнал и фильтры.",
          "`/equip item_id:<ID>` — применить предмет; без ID показать текущее оформление.",
          "`/equip снять:<тип>` — снять титул, значок, рамку или цвет."
        ].join("\n")
      });
    if (adminView) embed.addFields(
      { name: "🛡️ Административные команды", value: [
        "`/admin` — интерактивная панель управления.",
        "`/economy-admin выдать` — выдать валюту участнику.",
        "`/economy-admin снять` — снять валюту участника; баланс не может стать отрицательным.",
        "`/transactions member:@участник` — история операций участника (нужно право «Управление сервером»).",
        "`/serverconfig` — настройка каналов, приветствий и ролей.",
        "`/moderation warn` — выдать предупреждение с причиной.",
        "`/moderation timeout` — ограничить участника на 1–40320 минут.",
        "`/moderation kick` и `/moderation ban` — исключить или заблокировать участника.",
        "`/moderation history` — посмотреть последние случаи наказаний.",
        "`/tickets` — список открытых обращений; параметр history показывает также закрытые тикеты.",
        "`/automation add` — запланировать объявление по московскому времени.",
        "`/automation cancel` — отменить объявление по ID.",
        "`/automation list` — посмотреть запланированные объявления."
      ].join("\n") },
      { name: "🔐 Доступ", value: "Для административных действий нужны соответствующие права Discord. Экономические корректировки требуют права «Управление сервером»." }
    );
    embed.setFooter({ text: "HeradeLegend • Дух Свободы 🕊" });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
