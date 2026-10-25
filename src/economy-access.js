const { isFeatureEnabled } = require("./features");
function economyDisabled(interaction) {
  if (isFeatureEnabled(interaction.guildId, "economy")) return false;
  void interaction.reply({ content: "Экономика временно отключена администрацией сервера.", ephemeral: true });
  return true;
}
module.exports = { economyDisabled };
