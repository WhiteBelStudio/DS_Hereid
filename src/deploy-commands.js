const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const config = require("./config");
const logger = require("./logger");

async function main() {
  const commandsDir = path.join(__dirname, "commands");
  const files = fs.readdirSync(commandsDir).filter((file) => file.endsWith(".js"));
  const commands = files.map((file) => {
    const command = require(path.join(commandsDir, file));
    if (!command.data || !command.execute) throw new Error(`Command ${file} must export data and execute.`);
    return command.data.toJSON();
  });
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  logger.info(`Registered ${commands.length} guild slash commands.`);
}

main().catch((error) => {
  logger.error("Failed to register slash commands.", error);
  process.exitCode = 1;
});
