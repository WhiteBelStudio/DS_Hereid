const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");

function canSeeAdminHelp(interaction) {
  if (!interaction.inGuild()) return false;
  if (
    interaction.user.id === interaction.guild.ownerId ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) return true;

  const roleNames = interaction.member?.roles?.cache
    ? [...interaction.member.roles.cache.values()].map((role) => String(role.name || "").trim().toUpperCase())
    : [];
  return roleNames.some((name) =>
    ["CHIEF TECH ADMIN", "ADMINISTRATOR", "HEAD MODERATOR"].includes(name)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Список команд HeradeLegend с учётом твоих прав."),
  async execute(interaction) {
    const adminView = canSeeAdminHelp(interaction);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(adminView ? "🕊 HeradeLegend — команды и управление" : "🕊 HeradeLegend — команды участника")
      .setDescription(adminView
        ? "Показаны обычные команды и административные команды, доступные персоналу. Доступ к самим функциям дополнительно проверяется ботом."
        : "Показаны команды для обычных участников. Административные команды здесь не отображаются.")
      .addFields({
        name: "📌 Основные команды",
        value: [
          "`/help` — список команд с учётом твоих прав.",
          "`/commandrules` — подробная справка по командам и правилам их использования.",
          "`/ping` — проверить отклик бота.",
          "`/botinfo` — посмотреть сведения о боте и время работы процесса.",
          "`/profile` — посмотреть свой уровень, XP, баланс и прогресс до следующего уровня.",
          "`/profile member:@участник` — посмотреть профиль другого участника сервера.",
          "`/leaderboard` — рейтинг участников по рангу, сообщениям, активным дням и голосовой активности."
        ].join("\n")
      });

    if (adminView) {
      embed.addFields(
        {
          name: "🛡️ Административные команды",
          value: [
            "`/admin` — открыть интерактивную панель управления участниками, XP, модерацией, ролями доступа, настройками, статистикой, аудитом и функциями бота.",
            "`/serverconfig status` — просмотреть текущие настройки сервера.",
            "`/serverconfig welcome-channel channel:#канал` — выбрать канал приветствий.",
            "`/serverconfig welcome-message message:текст` — настроить текст приветствия.",
            "`/serverconfig goodbye-channel channel:#канал` — выбрать канал сообщений об уходе.",
            "`/serverconfig goodbye-message message:текст` — настроить текст сообщения об уходе.",
            "`/serverconfig autorole role:@роль` — назначить автоматическую роль новым участникам.",
            "`/serverconfig mod-log-channel channel:#канал` — выбрать канал журнала модерации.",
            "`/serverconfig reset-welcome` — отключить приветствия.",
            "`/serverconfig reset-goodbye` — отключить сообщения об уходе.",
            "`/serverconfig reset-autorole` — отключить автоматическую роль.",
            "`/serverconfig reset-mod-log` — сбросить канал журнала модерации."
          ].join("\n")
        },
        {
          name: "🔐 Доступ администратора",
          value: [
            "Для /serverconfig нужно право «Управление сервером».",
            "Для /admin требуется разрешение Discord или настроенная роль доступа. Каждое действие панели дополнительно проверяется.",
            "В справке перечислены команды, но фактические действия доступны только при наличии соответствующих прав."
          ].join("\n")
        }
      );
    }

    embed.setFooter({ text: "HeradeLegend • Дух Свободы 🕊" });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
