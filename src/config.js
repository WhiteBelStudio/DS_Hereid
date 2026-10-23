require("dotenv").config();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("PUT_")) {
    throw new Error(`Missing configuration: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

module.exports = {
  token: required("DISCORD_TOKEN"),
  clientId: required("CLIENT_ID"),
  guildId: required("GUILD_ID"),
  ownerIds: (process.env.BOT_OWNER_IDS || "").split(",").map((id) => id.trim()).filter(Boolean),
  databasePath: process.env.DATABASE_PATH || "./data/bot.sqlite",
  logLevel: process.env.LOG_LEVEL || "info",
};
