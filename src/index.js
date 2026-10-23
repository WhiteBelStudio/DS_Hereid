const fs = require("node:fs");
const path = require("node:path");
const {
  Client, Collection, GatewayIntentBits, Partials, Events,
} = require("discord.js");
const config = require("./config");
const logger = require("./logger");
const db = require("./database");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
});

client.commands = new Collection();
const commandsDir = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsDir).filter((name) => name.endsWith(".js"))) {
  const command = require(path.join(commandsDir, file));
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, (readyClient) => {
  logger.info(`Logged in as ${readyClient.user.tag} (${readyClient.user.id})`);
  logger.info(`Connected to ${readyClient.guilds.cache.size} guild(s).`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return logger.warn(`No handler for slash command: ${interaction.commandName}`);
  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error(`Command /${interaction.commandName} failed.`, error);
    const payload = { content: "⚠️ При выполнении команды произошла ошибка. Попробуйте позже.", ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch((e) => logger.error("Could not send command error response.", e));
    } else {
      await interaction.reply(payload).catch((e) => logger.error("Could not send command error response.", e));
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const settings = db.prepare("SELECT welcome_channel_id, welcome_message, autorole_id FROM guild_settings WHERE guild_id = ?").get(member.guild.id);
    if (settings?.autorole_id) {
      const role = await member.guild.roles.fetch(settings.autorole_id).catch(() => null);
      if (role && role.editable) await member.roles.add(role, "Configured automatic member role");
      else logger.warn(`Autorole missing or not manageable in guild ${member.guild.id}`);
    }
    if (settings?.welcome_channel_id) {
      const channel = await member.guild.channels.fetch(settings.welcome_channel_id).catch(() => null);
      if (channel?.isTextBased()) {
        const message = (settings.welcome_message || "Добро пожаловать, {user}, на сервер **{server}**!")
          .replaceAll("{user}", `<@${member.id}>`).replaceAll("{server}", member.guild.name);
        await channel.send({ content: message }).catch((e) => logger.warn("Welcome message could not be sent.", e));
      }
    }
  } catch (error) { logger.error("Guild member join handler failed.", error); }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    const settings = db.prepare("SELECT goodbye_channel_id, goodbye_message FROM guild_settings WHERE guild_id = ?").get(member.guild.id);
    if (!settings?.goodbye_channel_id) return;
    const channel = await member.guild.channels.fetch(settings.goodbye_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;
    const message = (settings.goodbye_message || "Участник **{user}** покинул сервер.")
      .replaceAll("{user}", member.user?.tag || member.id).replaceAll("{server}", member.guild.name);
    await channel.send({ content: message }).catch((e) => logger.warn("Goodbye message could not be sent.", e));
  } catch (error) { logger.error("Guild member remove handler failed.", error); }
});

client.on(Events.MessageCreate, (message) => {
  if (!message.guild || message.author.bot) return;
  const now = Date.now();
  const key = `${message.guild.id}:${message.author.id}`;
  const recent = client._recentMessages || (client._recentMessages = new Map());
  const entries = (recent.get(key) || []).filter((entry) => now - entry.time < 7000);
  entries.push({ time: now, content: message.content });
  recent.set(key, entries);
  const repeats = entries.filter((entry) => entry.content && entry.content === message.content).length;
  if (repeats >= 4) logger.warn(`Possible spam detected: guild=${message.guild.id} user=${message.author.id}`);
  // Foundation stage: log-only detection. Automated moderation is added in Stage 2.
});

client.on(Events.Error, (error) => logger.error("Discord client error.", error));
process.on("unhandledRejection", (error) => logger.error("Unhandled promise rejection.", error));
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception; exiting for process-manager restart.", error);
  process.exit(1);
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}; shutting down gracefully.`);

  try {
    client.destroy();
    if (db.open) db.close();
    logger.info("Discord client and database closed.");
    process.exitCode = 0;
  } catch (error) {
    logger.error("Error during graceful shutdown.", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });

client.login(config.token).catch((error) => {
  logger.error("Discord login failed. Check DISCORD_TOKEN and network access.", error);
  process.exit(1);
});
