const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
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
function optionName(option, name, description, required = true) {
  return option.setName(name).setDescription(description).setRequired(required).setMaxLength(200);
}
function playlistEmbed(name, tracks) {
  const lines = tracks.slice(0, 20).map((t, i) => (i + 1) + ". **" + t.title + "** — " + t.source + " · " + music.formatTime(t.durationInSec));
  return new EmbedBuilder().setColor(0x5865f2).setTitle("🎵 Плейлист: " + name)
    .setDescription(lines.join("\n").slice(0, 3900) || "Плейлист пуст.")
    .setFooter({ text: "Треков: " + tracks.length + (tracks.length > 20 ? " • показаны первые 20" : "") + " • HeradeLegend" });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("music")
    .setDescription("Музыкальный плеер и личные плейлисты HeradeLegend")
    .addSubcommand((sub) => sub.setName("play").setDescription("Найти трек сразу в нескольких музыкальных источниках").addStringOption((o) => optionName(o, "query", "Название песни, исполнитель или ссылка")))
    .addSubcommand((sub) => sub.setName("now").setDescription("Показать текущий трек"))
    .addSubcommand((sub) => sub.setName("queue").setDescription("Показать очередь воспроизведения"))
    .addSubcommand((sub) => sub.setName("pause").setDescription("Приостановить музыку"))
    .addSubcommand((sub) => sub.setName("resume").setDescription("Продолжить музыку"))
    .addSubcommand((sub) => sub.setName("skip").setDescription("Пропустить текущий трек"))
    .addSubcommand((sub) => sub.setName("stop").setDescription("Остановить музыку и очистить очередь"))
    .addSubcommand((sub) => sub.setName("volume").setDescription("Установить громкость").addIntegerOption((o) => o.setName("percent").setDescription("Громкость от 0 до 100").setRequired(true).setMinValue(0).setMaxValue(100)))
    .addSubcommand((sub) => sub.setName("repeat").setDescription("Режим повтора").addStringOption((o) => o.setName("mode").setDescription("Что повторять").setRequired(true).addChoices({ name: "Выключен", value: "off" }, { name: "Текущий трек", value: "track" }, { name: "Очередь", value: "queue" })))
    .addSubcommand((sub) => sub.setName("playlist-create").setDescription("Создать личный плейлист").addStringOption((o) => optionName(o, "name", "Название плейлиста")))
    .addSubcommand((sub) => sub.setName("playlist-list").setDescription("Показать свои плейлисты"))
    .addSubcommand((sub) => sub.setName("playlist-add").setDescription("Найти песню и добавить лучший результат в плейлист").addStringOption((o) => optionName(o, "name", "Название плейлиста")).addStringOption((o) => optionName(o, "query", "Песня или исполнитель")))
    .addSubcommand((sub) => sub.setName("playlist-show").setDescription("Показать треки плейлиста").addStringOption((o) => optionName(o, "name", "Название плейлиста")))
    .addSubcommand((sub) => sub.setName("playlist-remove").setDescription("Удалить трек из плейлиста по номеру").addStringOption((o) => optionName(o, "name", "Название плейлиста")).addIntegerOption((o) => o.setName("position").setDescription("Номер трека из /music playlist-show").setRequired(true).setMinValue(1).setMaxValue(200)))
    .addSubcommand((sub) => sub.setName("playlist-play").setDescription("Поставить плейлист в очередь").addStringOption((o) => optionName(o, "name", "Название плейлиста")))
    .addSubcommand((sub) => sub.setName("playlist-delete").setDescription("Удалить свой плейлист").addStringOption((o) => optionName(o, "name", "Название плейлиста"))),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Музыка доступна только на сервере.", flags: MessageFlags.Ephemeral });
      return;
    }
    const sub = interaction.options.getSubcommand();
    const name = interaction.options.getString("name");
    try {
      if (sub === "playlist-create") {
        const playlist = music.createPlaylist(interaction.guildId, interaction.user.id, name);
        await interaction.reply({ content: "✅ Создан твой плейлист **" + playlist.name + "**. Добавляй треки через /music playlist-add.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === "playlist-list") {
        const playlists = music.listPlaylists(interaction.guildId, interaction.user.id);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🎼 Твои плейлисты")
          .setDescription(playlists.map((p) => "• **" + p.name + "** — " + p.track_count + " треков").join("\n").slice(0, 3900) || "Пока нет плейлистов. Создай через /music playlist-create.")
          .setFooter({ text: "Плейлисты личные и сохраняются после перезапуска бота." })], flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === "playlist-add") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const query = interaction.options.getString("query", true);
        const tracks = await music.searchTracks(query);
        if (!tracks.length) throw new Error("По запросу ничего не найдено ни в одном доступном источнике.");
        const result = music.addPlaylistTrack(interaction.guildId, interaction.user.id, name, tracks[0]);
        await interaction.editReply("✅ В **" + result.playlist.name + "** добавлено: **" + tracks[0].title + "** (" + tracks[0].source + "). Для выбора другого результата используй /music play и выбери нужный вариант.");
        return;
      }
      if (sub === "playlist-show") {
        const playlist = music.getPlaylist(interaction.guildId, interaction.user.id, name);
        if (!playlist) throw new Error("Плейлист не найден. Посмотреть свои плейлисты: /music playlist-list.");
        await interaction.reply({ embeds: [playlistEmbed(playlist.name, music.getPlaylistTracks(playlist.id))], flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === "playlist-remove") {
        const result = music.removePlaylistTrack(interaction.guildId, interaction.user.id, name, interaction.options.getInteger("position", true));
        await interaction.reply({ content: "🗑️ Удалён трек **" + result.removed.title + "** из **" + result.playlist.name + "**.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === "playlist-delete") {
        const playlist = music.deletePlaylist(interaction.guildId, interaction.user.id, name);
        await interaction.reply({ content: "🗑️ Плейлист **" + playlist.name + "** и его список треков удалены.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === "playlist-play") {
        const playlist = music.getPlaylist(interaction.guildId, interaction.user.id, name);
        if (!playlist) throw new Error("Плейлист не найден.");
        const tracks = music.getPlaylistTracks(playlist.id);
        const result = music.queuePlaylist(interaction, tracks);
        await interaction.reply({ content: "🎶 Плейлист **" + playlist.name + "** добавлен в очередь: " + result.added + " треков.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === "play") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const query = interaction.options.getString("query", true);
        const tracks = await music.searchTracks(query);
        if (!tracks.length) {
          await interaction.editReply("🔎 Ничего не найдено. Проверь название и попробуй снова.");
          return;
        }
        const searchId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        music.searches.set(searchId, { guildId: interaction.guildId, userId: interaction.user.id, tracks, expiresAt: Date.now() + 5 * 60_000 });
        for (const [id, value] of music.searches) if (value.expiresAt < Date.now()) music.searches.delete(id);
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🔎 Результаты из музыкальных источников")
          .setDescription(tracks.map((track, i) => (i + 1) + ". **" + track.title + "** — " + track.source + " · " + music.formatTime(track.durationInSec) + "\n" + track.url).join("\n\n").slice(0, 3900))
          .setFooter({ text: "Выбери результат кнопкой • выбор действует 5 минут • HeradeLegend" });
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
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("📜 Очередь музыки")
          .setDescription((session.current ? "**Сейчас:** " + session.current.title + "\n\n" : "") + (lines.join("\n") || "Очередь пуста."))
          .setFooter({ text: "Всего в очереди: " + session.queue.length + " • показано до 15 треков" })], flags: MessageFlags.Ephemeral });
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
        session.current = null;
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
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => {});
      else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  },
};
