const fs = require("node:fs");
const path = require("node:path");
const {
  Client, Collection, GatewayIntentBits, Partials, Events, MessageFlags,
} = require("discord.js");
const config = require("./config");
const logger = require("./logger");
const db = require("./database");
const { isFeatureEnabled } = require("./features");
const { addMessageXp } = require("./member-profile");

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

client.config = config;
client.logger = logger;
client.commands = new Collection();

function loadCommands() {
  const commandsDir = path.join(__dirname, "commands");
  if (!fs.existsSync(commandsDir) || !fs.statSync(commandsDir).isDirectory()) {
    throw new Error("Commands directory is missing: src/commands");
  }

  const files = fs.readdirSync(commandsDir)
    .filter((name) => name.endsWith(".js"))
    .sort();

  if (files.length === 0) {
    throw new Error("No command modules were found in src/commands.");
  }

  for (const file of files) {
    const fullPath = path.join(commandsDir, file);
    const command = require(fullPath);
    if (!command?.data || typeof command.data.toJSON !== "function" ||
        typeof command.execute !== "function") {
      throw new Error(`Invalid command module "${file}": expected data.toJSON() and execute().`);
    }

    const definition = command.data.toJSON();
    if (!definition.name || typeof definition.name !== "string") {
      throw new Error(`Invalid command name in "${file}".`);
    }
    if (client.commands.has(definition.name)) {
      throw new Error(`Duplicate slash command name "${definition.name}" in "${file}".`);
    }
    client.commands.set(definition.name, command);
    logger.debug(`Loaded command module: ${definition.name} (${file})`);
  }

  logger.info(`Loaded ${client.commands.size} slash command module(s).`);
}

loadCommands();
const adminPanel = client.commands.get("admin");

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Logged in as ${readyClient.user.tag} (${readyClient.user.id})`);
  logger.info(`Connected to ${readyClient.guilds.cache.size} guild(s).`);

  // Register guild commands on startup, so Pterodactyl does not require a
  // separate manual command-registration step after every code update.
  try {
    const payload = [...client.commands.values()].map((command) => command.data.toJSON());
    await readyClient.application.commands.set(payload, config.guildId);
    logger.info(`Automatically registered ${payload.length} guild slash command(s) for guild ${config.guildId}.`);
  } catch (error) {
    logger.error("Automatic slash-command registration failed. Check CLIENT_ID, GUILD_ID and the bot application's access.", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        logger.warn(`No handler for slash command: ${interaction.commandName}`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "⚠️ Эта команда больше не поддерживается. Обнови список команд или обратись к администратору.",
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      await command.execute(interaction);
      if (!interaction.replied && !interaction.deferred) {
        logger.warn(`Command handler did not acknowledge interaction: ${interaction.commandName}`);
        await interaction.reply({
          content: "⚠️ Команда не вернула ответ. Ошибка записана в журнал.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (adminPanel &&
        (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) &&
        interaction.customId?.startsWith("ha:")) {
      await adminPanel.handle(interaction);
      // Protect against stale/unknown component IDs that a handler may not
      // recognize; Discord interactions must always receive an acknowledgement.
      if (!interaction.replied && !interaction.deferred) {
        logger.warn(`Unacknowledged admin component interaction: ${interaction.customId}`);
        await interaction.reply({
          content: "⚠️ Это действие больше недоступно. Открой панель заново командой /admin.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  } catch (error) {
    logger.error("Interaction handler failed.", error);
    const payload = {
      content: "⚠️ При выполнении действия произошла ошибка. Проверь журнал бота.",
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch((followUpError) =>
        logger.error("Could not send interaction error response.", followUpError));
    } else {
      await interaction.reply(payload).catch((replyError) =>
        logger.error("Could not send interaction error response.", replyError));
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const settings = db.prepare(
      "SELECT welcome_channel_id, welcome_message, autorole_id FROM guild_settings WHERE guild_id = ?",
    ).get(member.guild.id);

    if (settings?.autorole_id && isFeatureEnabled(member.guild.id, "autorole")) {
      const role = await member.guild.roles.fetch(settings.autorole_id).catch(() => null);
      if (role && role.editable) {
        await member.roles.add(role, "Configured automatic member role");
      } else {
        logger.warn(`Autorole missing or not manageable in guild ${member.guild.id}`);
      }
    }

    if (settings?.welcome_channel_id && isFeatureEnabled(member.guild.id, "welcome_messages")) {
      const channel = await member.guild.channels.fetch(settings.welcome_channel_id).catch(() => null);
      if (channel?.isTextBased()) {
        const message = (settings.welcome_message || "Добро пожаловать, {user}, на сервер **{server}**!")
          .replaceAll("{user}", `<@${member.id}>`)
          .replaceAll("{server}", member.guild.name);
        await channel.send({
          content: message,
          allowedMentions: { parse: [], users: [member.id] },
        }).catch((error) => logger.warn("Welcome message could not be sent.", error));
      }
    }
  } catch (error) {
    logger.error("Guild member join handler failed.", error);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    const settings = db.prepare(
      "SELECT goodbye_channel_id, goodbye_message FROM guild_settings WHERE guild_id = ?",
    ).get(member.guild.id);
    if (!settings?.goodbye_channel_id || !isFeatureEnabled(member.guild.id, "goodbye_messages")) return;

    const channel = await member.guild.channels.fetch(settings.goodbye_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;

    const message = (settings.goodbye_message || "Участник **{user}** покинул сервер.")
      .replaceAll("{user}", member.user?.tag || member.id)
      .replaceAll("{server}", member.guild.name);
    await channel.send({
      content: message,
      allowedMentions: { parse: [] },
    }).catch((error) => logger.warn("Goodbye message could not be sent.", error));
  } catch (error) {
    logger.error("Guild member remove handler failed.", error);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot || !message.content.trim()) return;

  try {
    const result = addMessageXp(message.guild.id, message.author.id, Date.now(), message.content);
    if (result.awarded && result.level > result.previousLevel) logger.info(`Member leveled up: guild=${message.guild.id} user=${message.author.id} level=${result.level}`);
  } catch (error) { logger.error("Member activity XP could not be saved.", error); }

  // RP actions are not handled here; messages are checked only for repeated spam.
  if (!isFeatureEnabled(message.guild.id, "spam_detection")) return;
  const now = Date.now();
  const key = `${message.guild.id}:${message.author.id}`;
  const recent = client._recentMessages || (client._recentMessages = new Map());
  const entries = (recent.get(key) || []).filter((entry) => now - entry.time < 7000);
  entries.push({ time: now, content: message.content });
  recent.set(key, entries);

  const repeats = entries.filter((entry) => entry.content && entry.content === message.content).length;
  if (repeats >= 4) {
    logger.warn(`Possible spam detected: guild=${message.guild.id} user=${message.author.id}`);
  }
  // Detection only: no automatic message deletion or punishment is performed.
});

client.on(Events.Error, (error) => logger.error("Discord client error.", error));
client.on("warn", (warning) => logger.warn("Discord client warning.", warning));
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
