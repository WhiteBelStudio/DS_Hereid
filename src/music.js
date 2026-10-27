const {
  AudioPlayerStatus, NoSubscriberBehavior, StreamType, createAudioPlayer,
  createAudioResource, joinVoiceChannel, entersState, VoiceConnectionStatus,
} = require("@discordjs/voice");
const play = require("play-dl");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("./database");
function getMusicSettings(guildId) { return db.prepare("SELECT * FROM music_settings WHERE guild_id=?").get(guildId) || { enabled: 1, voice_channel_id: null, volume: 50, repeat_mode: "off" }; }
function ensureMusicSettings(guildId, actorId) { db.prepare("INSERT OR IGNORE INTO music_settings (guild_id, updated_by) VALUES (?, ?)").run(guildId, actorId || "system"); return getMusicSettings(guildId); }

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
  const providers = [
    ["YouTube", () => play.search(q, { limit: 5, source: { youtube: "video" } })],
    ["SoundCloud", () => play.search(q, { limit: 5, source: { soundcloud: "tracks" } })],
  ];
  // Run providers concurrently so one slow source does not delay the other.
  const batches = await Promise.all(providers.map(async ([source, search]) => {
    try {
      const results = await search();
      return (results || []).map((item) => {
        const url = item.url || item.permalink;
        if (!url || !/^https?:\/\//i.test(url)) return null;
        return { title: titleOf(item), url, durationInSec: Number(item.durationInSec || item.duration) || 0, source };
      }).filter(Boolean);
    } catch (_) { return []; }
  }));
  const found = [];
  for (const track of batches.flat()) if (!found.some((item) => item.url === track.url)) found.push(track);
  return found.slice(0, 10);
}

// Personal playlists are persisted in SQLite.
function listPlaylists(guildId, ownerId) {
  return db.prepare(`SELECT p.id, p.name, p.created_at, COUNT(t.id) AS track_count FROM music_playlists p LEFT JOIN music_playlist_tracks t ON t.playlist_id=p.id WHERE p.guild_id=? AND p.owner_id=? GROUP BY p.id ORDER BY p.name COLLATE NOCASE`).all(guildId, ownerId);
}
function getPlaylist(guildId, ownerId, name) {
  return db.prepare("SELECT * FROM music_playlists WHERE guild_id=? AND owner_id=? AND name=? COLLATE NOCASE").get(guildId, ownerId, name);
}
function createPlaylist(guildId, ownerId, name) {
  const normalized = String(name || "").trim().replace(/\\s+/g, " ");
  if (normalized.length < 1 || normalized.length > 50) throw new Error("Название плейлиста должно быть от 1 до 50 символов.");
  try {
    const result = db.prepare("INSERT INTO music_playlists (guild_id, owner_id, name) VALUES (?, ?, ?)").run(guildId, ownerId, normalized);
    return db.prepare("SELECT * FROM music_playlists WHERE id=?").get(result.lastInsertRowid);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) throw new Error("У тебя уже есть плейлист с таким названием.");
    throw error;
  }
}
function addPlaylistTrack(guildId, ownerId, playlistName, track) {
  const playlist = getPlaylist(guildId, ownerId, playlistName);
  if (!playlist) throw new Error("Плейлист не найден. Сначала создай его командой /music playlist-create.");
  const count = db.prepare("SELECT COUNT(*) AS n FROM music_playlist_tracks WHERE playlist_id=?").get(playlist.id).n;
  if (count >= 200) throw new Error("В одном плейлисте максимум 200 треков.");
  const result = db.prepare("INSERT INTO music_playlist_tracks (playlist_id, title, url, source, duration_seconds) VALUES (?, ?, ?, ?, ?)").run(playlist.id, titleOf(track), track.url, track.source, Number(track.durationInSec) || 0);
  return { playlist, trackId: Number(result.lastInsertRowid), count: count + 1 };
}
function getPlaylistTracks(playlistId) {
  return db.prepare("SELECT id, title, url, source, duration_seconds AS durationInSec FROM music_playlist_tracks WHERE playlist_id=? ORDER BY id").all(playlistId);
}
function removePlaylistTrack(guildId, ownerId, playlistName, position) {
  const playlist = getPlaylist(guildId, ownerId, playlistName);
  if (!playlist) throw new Error("Плейлист не найден.");
  const tracks = getPlaylistTracks(playlist.id);
  const index = Number(position) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= tracks.length) throw new Error("Укажи номер трека из списка плейлиста.");
  db.prepare("DELETE FROM music_playlist_tracks WHERE id=?").run(tracks[index].id);
  return { playlist, removed: tracks[index], remaining: tracks.length - 1 };
}
function deletePlaylist(guildId, ownerId, playlistName) {
  const playlist = getPlaylist(guildId, ownerId, playlistName);
  if (!playlist) throw new Error("Плейлист не найден.");
  db.prepare("DELETE FROM music_playlists WHERE id=?").run(playlist.id);
  return playlist;
}
function queuePlaylist(interaction, tracks) {
  if (!tracks.length) throw new Error("В этом плейлисте пока нет треков.");
  const settings = getMusicSettings(interaction.guildId);
  if (!settings.enabled) throw new Error("Музыкальный плеер отключён администратором в панели /admin.");
  const voiceChannel = interaction.member && interaction.member.voice && interaction.member.voice.channel;
  if (!voiceChannel) throw new Error("Сначала зайди в голосовой канал.");
  if (settings.voice_channel_id && voiceChannel.id !== settings.voice_channel_id) throw new Error("Музыка разрешена только в канале <#" + settings.voice_channel_id + ">.");
  const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
  if (!permissions || !permissions.has(["Connect", "Speak"])) throw new Error("Мне нужны права «Подключаться» и «Говорить» в этом голосовом канале.");
  const session = ensureSession(interaction.guild, voiceChannel);
  session.volume = Number(settings.volume ?? 50);
  session.repeat = settings.repeat_mode || "off";
  session.textChannelId = interaction.channelId;
  if (tracks.length + session.queue.length > MAX_QUEUE) throw new Error("В очереди максимум " + MAX_QUEUE + " треков; сначала освободи место.");
  session.queue.push(...tracks.map((track) => ({ ...track, requestedBy: interaction.user.id })));
  if (!session.current && session.player.state.status === AudioPlayerStatus.Idle && !session.busy) void playNext(interaction.guildId);
  return { session, added: tracks.length };
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
  const settings = getMusicSettings(interaction.guildId);
  if (!settings.enabled) throw new Error("Музыкальный плеер отключён администратором в панели /admin.");
  const voiceChannel = interaction.member && interaction.member.voice && interaction.member.voice.channel;
  if (!voiceChannel) throw new Error("Сначала зайди в голосовой канал.");
  if (settings.voice_channel_id && voiceChannel.id !== settings.voice_channel_id) throw new Error("Музыка разрешена только в канале <#" + settings.voice_channel_id + ">.");
  const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
  if (!permissions || !permissions.has(["Connect", "Speak"])) {
    throw new Error("Мне нужны права «Подключаться» и «Говорить» в этом голосовом канале.");
  }
  const session = ensureSession(interaction.guild, voiceChannel);
  session.volume = Number(settings.volume ?? 50);
  session.repeat = settings.repeat_mode || "off";
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
        .setLabel(((i + offset + 1) + ". " + track.title).slice(0, 80)).setStyle(ButtonStyle.Primary)
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

module.exports = { AudioPlayerStatus, formatTime, getSession, searchTracks, makeNowPlayingEmbed, makeSearchRows, enqueue, handleButton, stopSession, searches, getMusicSettings, ensureMusicSettings, listPlaylists, getPlaylist, createPlaylist, addPlaylistTrack, getPlaylistTracks, removePlaylistTrack, deletePlaylist, queuePlaylist };
