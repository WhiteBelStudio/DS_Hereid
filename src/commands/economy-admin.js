const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const { adjustBalance } = require("../economy");
const db = require("../database");
module.exports = {
  data: new SlashCommandBuilder().setName("economy-admin").setDescription("Управление валютой участников.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("выдать").setDescription("Выдать монеты участнику.")
      .addUserOption(o=>o.setName("участник").setDescription("Получатель").setRequired(true))
      .addIntegerOption(o=>o.setName("сумма").setDescription("Количество монет (1–1000000)").setMinValue(1).setMaxValue(1000000).setRequired(true))
      .addStringOption(o=>o.setName("причина").setDescription("Причина выдачи").setMaxLength(300).setRequired(false)))
    .addSubcommand(s => s.setName("снять").setDescription("Снять монеты с участника.")
      .addUserOption(o=>o.setName("участник").setDescription("Цель").setRequired(true))
      .addIntegerOption(o=>o.setName("сумма").setDescription("Количество монет (1–1000000)").setMinValue(1).setMaxValue(1000000).setRequired(true))
      .addStringOption(o=>o.setName("причина").setDescription("Причина снятия").setMaxLength(300).setRequired(false))),
  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({content:"Нужно право «Управление сервером».",flags:MessageFlags.Ephemeral});
    }
    const target=interaction.options.getUser("участник",true);
    if (target.bot) return interaction.reply({content:"Нельзя изменять баланс ботов.",flags:MessageFlags.Ephemeral});
    const amount=interaction.options.getInteger("сумма",true);
    const signed=interaction.options.getSubcommand()==="выдать"?amount:-amount;
    const reason=interaction.options.getString("причина")||"Без указанной причины";
    const result=adjustBalance(interaction.guildId,target.id,interaction.user.id,signed,reason);
    db.prepare("INSERT INTO admin_audit (guild_id,actor_id,action,target_id,details) VALUES (?,?,?,?,?)")
      .run(interaction.guildId,interaction.user.id,"economy_balance_adjustment",target.id,`${signed}; ${reason}`);
    await interaction.reply({embeds:[new EmbedBuilder().setColor(result.ok?0x1ABC9C:0xE74C3C).setTitle(result.ok?"Баланс обновлён":"Операция отклонена")
      .setDescription(result.ok?`Участник: <@${target.id}>\nИзменение: **${signed>0?"+":""}${signed}** монет\nНовый баланс: **${result.balance}** монет\nПричина: ${reason}`:"Операция привела бы к отрицательному балансу.")],flags:MessageFlags.Ephemeral});
  },
};
