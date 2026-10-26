const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require("discord.js");
const crypto = require("node:crypto");
const music = require("../music");

function requireSession(interaction) {
  const session = music.getSession(interaction.guildId);
  if (!session) throw new Error("Музыка сейчас не запущена. Используй /music play.");
  return session;
}
function requireSameVoice(interaction, session) {
  const channel = interaction.member && interaction.member.voice && interaction.member.voice.channel;
  if (!channel) throw new Error("Сначала зайди в голосовой канал.");
  if (channel.id !== session.voiceChannelId) throw new Error("Для управления музыкой зайди в тот же голосовой канал, где находится бот.");
  return channel;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("music")
    .setDescription("Музыкальный плеер HeradeLegend")
    .addSubcommand((sub) => sub.setName("play").setDescription("Найти песню и выбрать результат").addStringOption((o) => o.setName("query").setDescription("Название песни, исполнитель или ссылка на YouTube").setRequired(true).setMaxLength(200)))
    .addSubcommand((sub) => sub.setName("now").setDescription("Показать текущий трек"))
    .addSubcommand((sub) => sub.setName("queue").setDescription("Показать очередь воспроизведения"))
    .addSubcommand((sub) => sub.setName("pause").setDescription("Приостановить музыку"))
    .addSubcommand((sub) => sub.setName("resume").setDescription("Продолжить музыку"))
    .addSubcommand((sub) => sub.setName("skip").setDescription("Пропустить текущий трек"))
    .addSubcommand((sub) => sub.setName("stop").setDescription("Остановить музыку и очистить очередь"))
    .addSubcommand((sub) => sub.setName("volume").setDescription("Установить громкость").addIntegerOption((o) => o.setName("percent").setDescription("Громкость от 0 до 100").setRequired(true).setMinValue(0).setMaxValue(100)))
    .addSubcommand((sub) => sub.setName("repeat").setDescription("Режим повтора").addStringOption((o) => o.setName("mode").setDescription("Что повторять").setRequired(true).addChoices({ name: "Выключен", value: "off" }, { name: "Текущий трек", value: "track" }, { name: "Очередь", value: "queue" }))),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Музыка доступна только на сервере.", flags: MessageFlags.Ephemeral });
      return;
    }
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === "play") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const query = interaction.options.getString("query", true);
        const tracks = await music.searchTracks(query);
        if (!tracks.length) {
          await interaction.editReply("🔎 Ничего не найдено. Попробуй указать название и исполнителя.");
          return;
        }
        const searchId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        music.searches.set(searchId, { guildId: interaction.guildId, userId: interaction.user.id, tracks, expiresAt: Date.now() + 5 * 60_000 });
        for (const [id, value] of music.searches) if (value.expiresAt < Date.now()) music.searches.delete(id);
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🔎 Выбери песню")
          .setDescription(tracks.map((track, i) => (i + 1) + ". **" + track.title + "** — " + track.source + " · " + music.formatTime(track.durationInSec) + "\n" + track.url).join("\n\n").slice(0, 3900))
          .setFooter({ text: "Кнопки выбора действуют 5 минут • HeradeLegend" });
        await interaction.editReply({ embeds: [embed], components: music.makeSearchRows(interaction.guildId, interaction.user.id, searchId, tracks) });
        return;
      }

      if (sub === "now") {
        const session = requireSession(interaction);
        await interaction.reply({ embeds: [music.makeNowPlayingEmbed(session)], flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === "queue") {
        const session = requireSession(interaction);
        const upcoming = session.queue.slice(0, 15);
        const lines = upcoming.map((track, i) => (i + 1) + ". **" + track.title + "** — " + track.source + " · " + music.formatTime(track.durationInSec));
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("📜 Очередь музыки")
            .setDescription((session.current ? "**Сейчас:** " + session.current.title + "\n\n" : "") + (lines.join("\n") || "Очередь пуста."))
            .setFooter({ text: "Всего в очереди: " + session.queue.length + " • показано до 15 треков" })],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const session = requireSession(interaction);
      requireSameVoice(interaction, session);
      if (sub === "pause") {
        if (!session.player.pause()) throw new Error("Воспроизведение уже приостановлено или не запущено.");
        await interaction.reply({ content: "⏸️ Музыка приостановлена.", flags: MessageFlags.Ephemeral });
      } else if (sub === "resume") {
        if (!session.player.unpause()) throw new Error("Музыка уже играет или сейчас нечего продолжать.");
        await interaction.reply({ content: "▶️ Воспроизведение продолжено.", flags: MessageFlags.Ephemeral });
      } else if (sub === "skip") {
        if (!session.current) throw new Error("Сейчас нет трека для пропуска.");
        session.player.stop(true);
        await interaction.reply({ content: "⏭️ Трек пропущен.", flags: MessageFlags.Ephemeral });
      } else if (sub === "stop") {
        music.stopSession(interaction.guildId);
        await interaction.reply({ content: "⏹️ Музыка остановлена, очередь очищена, бот отключён от голосового канала.", flags: MessageFlags.Ephemeral });
      } else if (sub === "volume") {
        const percent = interaction.options.getInteger("percent", true);
        session.volume = percent;
        if (session.resource && session.resource.volume) session.resource.volume.setVolume(percent / 100);
        await interaction.reply({ content: "🔊 Громкость установлена: " + percent + "%.", flags: MessageFlags.Ephemeral });
      } else if (sub === "repeat") {
        session.repeat = interaction.options.getString("mode", true);
        await interaction.reply({ content: "🔁 Режим повтора: " + ({ off: "выключен", track: "текущий трек", queue: "очередь" })[session.repeat] + ".", flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      const message = "⚠️ " + (error.message || "Не удалось выполнить музыкальную команду.");
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
      else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  },
};
