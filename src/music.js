const {
  AudioPlayerStatus, NoSubscriberBehavior, StreamType, createAudioPlayer,
  createAudioResource, joinVoiceChannel, entersState, VoiceConnectionStatus,
} = require("@discordjs/voice");
const play = require("play-dl");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const sessions = new Map();
const searches = new Map();
const MAX_QUEUE = 100;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "неизвестно";
  const total = Math.floor(seconds);
  return total >= 3600
    ? Math.floor(total / 3600) + ":" + String(Math.floor((total % 3600) / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0")
    : Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}
function titleOf(track) {
  return String(track.title || track.name || "Без названия").replace(/[\r\n]/g, " ").slice(0, 180);
}
function getSession(guildId) { return sessions.get(guildId); }

async function searchTracks(query) {
  const q = String(query || "").trim();
  if (!q) throw new Error("Введи название песни или ссылку.");
  if (q.length > 200) throw new Error("Запрос слишком длинный (максимум 200 символов).");
  if (/^https?:\/\//i.test(q)) {
    const info = await play.video_basic_info(q).catch(() => null);
    if (!info || !info.video_details) throw new Error("Не удалось распознать ссылку. Сейчас поддерживаются общедоступные видео YouTube.");
    const v = info.video_details;
    return [{ title: titleOf(v), url: v.url || q, durationInSec: Number(v.durationInSec) || 0, source: "YouTube" }];
  }
  const found = [];
  const providers = [
    ["YouTube", () => play.search(q, { limit: 5, source: { youtube: "video" } })],
    ["SoundCloud", () => play.search(q, { limit: 5, source: { soundcloud: "tracks" } })],
  ];
  for (const [source, search] of providers) {
    try {
      const results = await search();
      for (const item of results || []) {
        const url = item.url || item.permalink;
        if (!url || !/^https?:\/\//i.test(url) || found.some((x) => x.url === url)) continue;
        found.push({ title: titleOf(item), url, durationInSec: Number(item.durationInSec || item.duration) || 0, source });
      }
    } catch (_) {
      // Continue if a provider is unavailable; another provider may still return results.
    }
  }
  return found.slice(0, 8);
}

function makeNowPlayingEmbed(session) {
  const track = session.current;
  return new EmbedBuilder().setColor(0x5865f2).setTitle("🎶 Сейчас играет")
    .setDescription(track
      ? "**[" + track.title + "](" + track.url + ")**\nИсточник: " + track.source + "\nДлительность: " + formatTime(track.durationInSec) + "\nЗапросил: <@" + track.requestedBy + ">"
      : "Сейчас ничего не воспроизводится.")
    .addFields(
      { name: "Очередь", value: String(session.queue.length), inline: true },
      { name: "Громкость", value: session.volume + "%", inline: true },
      { name: "Повтор", value: ({ off: "выкл.", track: "трек", queue: "очередь" })[session.repeat], inline: true },
    ).setFooter({ text: "HeradeLegend • Музыкальный плеер" });
}

async function playNext(guildId) {
  const session = sessions.get(guildId);
  if (!session || session.busy) return;
  session.busy = true;
  try {
    let next;
    if (session.repeat === "track" && session.current) next = session.current;
    else if (session.queue.length) {
      next = session.queue.shift();
      if (session.repeat === "queue") session.queue.push(next);
    } else {
      session.current = null;
      session.busy = false;
      return;
    }
    session.current = next;
    const stream = await play.stream(next.url);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type || StreamType.Arbitrary, inlineVolume: true,
    });
    resource.volume.setVolume(session.volume / 100);
    session.resource = resource;
    session.player.play(resource);
  } catch (error) {
    session.current = null;
    session.busy = false;
    session.lastError = String(error && (error.message || error)).slice(0, 300);
    setImmediate(() => { void playNext(guildId); });
    return;
  }
  session.busy = false;
}

function ensureSession(guild, voiceChannel) {
  let session = sessions.get(guild.id);
  if (session) {
    if (session.voiceChannelId !== voiceChannel.id) throw new Error("Музыка уже работает в другом голосовом канале этого сервера.");
    return session;
  }
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id, guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator, selfDeaf: true,
  });
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  connection.subscribe(player);
  session = {
    guildId: guild.id, voiceChannelId: voiceChannel.id, connection, player,
    queue: [], current: null, resource: null, volume: 50, repeat: "off", busy: false, lastError: null,
  };
  sessions.set(guild.id, session);
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch (_) {
      connection.destroy();
      if (sessions.get(guild.id) === session) sessions.delete(guild.id);
    }
  });
  player.on(AudioPlayerStatus.Idle, () => {
    if (session.busy) return;
    session.resource = null;
    void playNext(guild.id);
  });
  player.on("error", (error) => {
    session.lastError = String(error.message || error).slice(0, 300);
    session.resource = null;
    session.busy = false;
    void playNext(guild.id);
  });
  return session;
}

async function enqueue(interaction, track) {
  const voiceChannel = interaction.member && interaction.member.voice && interaction.member.voice.channel;
  if (!voiceChannel) throw new Error("Сначала зайди в голосовой канал.");
  const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
  if (!permissions || !permissions.has(["Connect", "Speak"])) {
    throw new Error("Мне нужны права «Подключаться» и «Говорить» в этом голосовом канале.");
  }
  const session = ensureSession(interaction.guild, voiceChannel);
  session.textChannelId = interaction.channelId;
  track.requestedBy = interaction.user.id;
  if (!session.current && session.player.state.status === AudioPlayerStatus.Idle && !session.busy) {
    session.queue.unshift(track);
    await playNext(interaction.guildId);
    return { started: true, session };
  }
  if (session.queue.length >= MAX_QUEUE) throw new Error("Очередь заполнена (максимум " + MAX_QUEUE + " треков).");
  session.queue.push(track);
  return { started: false, session };
}

function makeSearchRows(guildId, userId, searchId, tracks) {
  const rows = [];
  for (let i = 0; i < tracks.length; i += 4) {
    rows.push(new ActionRowBuilder().addComponents(tracks.slice(i, i + 4).map((track, offset) =>
      new ButtonBuilder().setCustomId("music:pick:" + guildId + ":" + userId + ":" + searchId + ":" + (i + offset))
        .setLabel((i + offset + 1) + ". " + track.title).setLabel((i + offset + 1) + ". " + track.title).setLabel((i + offset + 1) + ". " + track.title).setStyle(ButtonStyle.Primary)
    )));
  }
  return rows;
}

async function handleButton(interaction) {
  const parts = interaction.customId.split(":");
  if (parts[1] !== "pick") return false;
  const guildId = parts[2], userId = parts[3], searchId = parts[4], index = Number(parts[5]);
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: "Эти результаты поиска принадлежат другому пользователю. Выполни /music play самостоятельно.", ephemeral: true });
    return true;
  }
  const entry = searches.get(searchId);
  if (!entry || entry.guildId !== guildId || entry.expiresAt < Date.now()) {
    await interaction.reply({ content: "Список результатов устарел. Выполни поиск ещё раз.", ephemeral: true });
    return true;
  }
  const track = entry.tracks[index];
  if (!track) {
    await interaction.reply({ content: "Этот результат больше недоступен.", ephemeral: true });
    return true;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const result = await enqueue(interaction, { ...track });
    await interaction.editReply(result.started ? "▶️ Запускаю **" + track.title + "** (" + track.source + ")." : "➕ Добавлено в очередь: **" + track.title + "** (" + track.source + ").");
  } catch (error) {
    await interaction.editReply("⚠️ " + (error.message || "Не удалось добавить трек."));
  }
  return true;
}

function stopSession(guildId) {
  const session = sessions.get(guildId);
  if (!session) return false;
  session.queue.length = 0;
  session.current = null;
  session.player.stop(true);
  session.connection.destroy();
  sessions.delete(guildId);
  return true;
}

module.exports = { AudioPlayerStatus, formatTime, getSession, searchTracks, makeNowPlayingEmbed, makeSearchRows, enqueue, handleButton, stopSession, searches };
