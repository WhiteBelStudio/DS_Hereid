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
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(adminView ? "🕊 HeradeLegend — команды и управление" : "🕊 HeradeLegend — команды участника")
      .setDescription(adminView
        ? "Показаны обычные команды и административные команды, доступные персоналу. Доступ к самим функциям дополнительно проверяется ботом."
        : "Показаны команды для обычных участников. Административные команды здесь не отображаются.")
      .addFields(
        {
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
            "`/pay member:@участник amount:<сумма>` — перевести монеты; получатель получает указанную сумму, комиссия 5% оплачивается сверху.",
            "`/daily` — получить 100 монет раз в 24 часа.",
            "`/quests` — ежедневные задания и автоматические награды.",
            "`/shop` — каталог титулов, значков, рамок и цветов.",
            "`/buy item_id:<ID>` — купить предмет из магазина.",
            "`/inventory` — посмотреть купленные предметы.",
            "`/transactions` — последние операции с монетами.",
            "`/ticket` — открыть приватное обращение в поддержку.",
            "`/report submit` — отправить конфиденциальный репорт администрации.",
          ].join("\n")
        },
        {
          name: "🎨 Оформление профиля",
          value: [
            "`/equip item_id:<ID>` — применить принадлежащий предмет.",
            "`/equip снять:<тип>` — снять титул, значок, рамку или цвет.",
            "Купленные предметы и история операций сохраняются в базе данных."
          ].join("\n")
        }
      );
    embed.addFields({
      name: "🎵 Музыкальный плеер",
      value: [
        "`/music play query:<название>` — поиск песни и выбор результата кнопкой.",
        "`/music now` и `/music queue` — текущий трек и очередь.",
        "`/music pause`, `/music resume`, `/music skip`, `/music stop` — управление.",
        "`/music volume percent:<0–100>` и `/music repeat mode:<режим>` — громкость и повтор."
      ].join("\n")
    });

    if (adminView) {
      embed.addFields(
        {
          name: "🛡️ Администрирование",
          value: [
            "`/admin` — интерактивная панель управления.",
            "`/serverconfig` — настройка каналов, приветствий и ролей.",
            "`/moderation warn` — предупреждение с причиной.",
            "`/moderation timeout` — ограничение на 1–40320 минут.",
            "`/moderation kick` и `/moderation ban` — исключение или блокировка.",
            "`/moderation history` — история наказаний.",
            "`/tickets` — обращения; параметр history включает закрытые тикеты.",
            "`/report setup channel:#канал` — настроить канал репортов.",
            "`/report list` — список открытых репортов.",
            "`/report resolve id:<ID> resolution:<итог>` — закрыть рассмотренный репорт.",
            "`/economy-admin выдать` — выдать валюту участнику.",
            "`/economy-admin снять` — снять валюту без отрицательного баланса.",
            "`/transactions member:@участник` — история операций участника."
          ].join("\n")
        },
        {
          name: "⚙️ Автоматизация и фильтры",
          value: [
            "`/automod status` — проверить настройки автоматической модерации.",
            "`/automod word-add` / `word-remove` — управление фильтром слов и фраз.",
            "`/automod exempt-add` / `exempt-remove` — исключения каналов.",
            "`/automod log-channel`, `links`, `mentions-limit`, `delete-flagged` — настройки фильтров.",
            "`/automation list` — список запланированных объявлений.",
            "`/automation add` — запланировать объявление по московскому времени.",
            "`/automation cancel` — отменить объявление по ID."
          ].join("\n")
        },
        {
          name: "🔐 Доступ",
          value: "Для административных действий нужны соответствующие права Discord. Экономические корректировки требуют права «Управление сервером». Название роли само по себе не выдаёт дополнительных разрешений."
        }
      );
    }

    embed.setFooter({ text: "HeradeLegend • Дух Свободы 🕊" });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
