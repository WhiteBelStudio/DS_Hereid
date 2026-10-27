const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { transferCoins, TRANSFER_FEE_PERCENT, MAX_TRANSFER_AMOUNT } = require("../economy");
const { economyDisabled } = require("../economy-access");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Передать монеты участнику с комиссией 5%.")
    .addUserOption((option) => option
      .setName("member")
      .setDescription("Кому перевести монеты")
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName("amount")
      .setDescription("Сколько монет получит участник (комиссия начисляется сверху)")
      .setMinValue(1)
      .setMaxValue(MAX_TRANSFER_AMOUNT)
      .setRequired(true)),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Перевод монет доступен только на сервере.", flags: MessageFlags.Ephemeral });
    }
    if (await economyDisabled(interaction)) return;

    const recipient = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);
    if (recipient.bot) {
      return interaction.reply({ content: "Нельзя переводить монеты ботам.", flags: MessageFlags.Ephemeral });
    }
    if (recipient.id === interaction.user.id) {
      return interaction.reply({ content: "Нельзя переводить монеты самому себе.", flags: MessageFlags.Ephemeral });
    }

    const result = transferCoins(interaction.guildId, interaction.user.id, recipient.id, amount);
    if (!result.ok) {
      const messages = {
        self_transfer: "Нельзя переводить монеты самому себе.",
        invalid_amount: `Укажи сумму от 1 до ${MAX_TRANSFER_AMOUNT.toLocaleString("ru-RU")} монет.`,
        invalid_participants: "Не удалось проверить участников перевода.",
        insufficient_funds: `Недостаточно монет. Получатель должен получить ${amount.toLocaleString("ru-RU")}, комиссия ${result.fee?.toLocaleString("ru-RU") ?? "—"}; всего нужно ${result.total?.toLocaleString("ru-RU") ?? "—"} монет. Твой баланс: ${result.balance?.toLocaleString("ru-RU") ?? "0"}.`,
      };
      return interaction.reply({ content: messages[result.reason] || "Перевод не выполнен. Попробуй позже.", flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setColor(0x1ABC9C)
      .setTitle("🪙 Перевод выполнен")
      .setDescription(`Получатель: ${recipient}\nОтправлено получателю: **${result.amount.toLocaleString("ru-RU")}** монет\nКомиссия (${TRANSFER_FEE_PERCENT}%): **${result.fee.toLocaleString("ru-RU")}** монет\nСписано всего: **${result.total.toLocaleString("ru-RU")}** монет\nТвой остаток: **${result.senderBalance.toLocaleString("ru-RU")}** монет.`);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    await recipient.send({
      embeds: [new EmbedBuilder()
        .setColor(0x1ABC9C)
        .setTitle("🪙 Тебе перевели монеты")
        .setDescription(`Участник **${interaction.user.username}** перевёл тебе **${result.amount.toLocaleString("ru-RU")}** монет на сервере **${interaction.guild.name}**.`)],
    }).catch(() => null);
  },
};
