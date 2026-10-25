const db = require("./database");

const DAY = 86_400_000;
const INACTIVE_LIMIT = 60 * DAY;
const RANKS = [
  { name: "NEWBIE", days: 0, messages: 0, activeDays: 0, voiceSeconds: 0 },
  { name: "GUEST", days: 2, messages: 20, activeDays: 1, voiceSeconds: 0 },
  { name: "MEMBER", days: 5, messages: 100, activeDays: 3, voiceSeconds: 30 * 60 },
  { name: "ACTIVE", days: 10, messages: 300, activeDays: 5, voiceSeconds: 2 * 3600 },
  { name: "VETERAN", days: 21, messages: 800, activeDays: 10, voiceSeconds: 5 * 3600 },
  { name: "MASTER", days: 45, messages: 2000, activeDays: 20, voiceSeconds: 12 * 3600 },
  { name: "ELITE", days: 90, messages: 4500, activeDays: 35, voiceSeconds: 30 * 3600 },
  { name: "LEGEND", days: 180, messages: 10000, activeDays: 60, voiceSeconds: 60 * 3600 },
];

db.exec(`
  CREATE TABLE IF NOT EXISTS member_rank_activity (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    active_days INTEGER NOT NULL DEFAULT 0,
    last_active_date TEXT,
    last_activity_at INTEGER NOT NULL DEFAULT 0,
    voice_seconds INTEGER NOT NULL DEFAULT 0,
    voice_started_at INTEGER,
    current_rank TEXT NOT NULL DEFAULT 'NEWBIE',
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_rank_activity_leaderboard
    ON member_rank_activity(guild_id, message_count DESC, active_days DESC);
`);

const getRow = db.prepare("SELECT * FROM member_rank_activity WHERE guild_id=? AND user_id=?");
const ensureRow = db.prepare(`
  INSERT INTO member_rank_activity(guild_id,user_id,joined_at,last_activity_at)
  VALUES(?,?,?,?)
  ON CONFLICT(guild_id,user_id) DO NOTHING
`);

function ensureMember(member, now = Date.now()) {
  ensureRow.run(member.guild.id, member.id, member.joinedTimestamp || now, now);
  return getRow.get(member.guild.id, member.id);
}

function recordMessage(member, content, now = Date.now()) {
  if (!member?.guild || member.user?.bot || String(content || "").trim().length < 10) return;
  ensureMember(member, now);
  const date = new Date(now).toISOString().slice(0, 10);
  db.prepare(`
    UPDATE member_rank_activity
    SET message_count=message_count+1,
        active_days=active_days + CASE WHEN last_active_date IS NULL OR last_active_date<>? THEN 1 ELSE 0 END,
        last_active_date=?,
        last_activity_at=?
    WHERE guild_id=? AND user_id=?
  `).run(date, date, now, member.guild.id, member.id);
}

function recordVoiceState(member, wasInVoice, isInVoice, now = Date.now()) {
  if (!member?.guild || member.user?.bot) return;
  const row = ensureMember(member, now);
  let seconds = Math.max(0, Number(row.voice_seconds) || 0);
  let started = row.voice_started_at == null ? null : Number(row.voice_started_at);
  if (wasInVoice && started != null) {
    seconds += Math.max(0, Math.floor((now - started) / 1000));
    started = null;
  }
  if (isInVoice) started = now;
  db.prepare("UPDATE member_rank_activity SET voice_seconds=?,voice_started_at=?,last_activity_at=CASE WHEN ? THEN ? ELSE last_activity_at END WHERE guild_id=? AND user_id=?")
    .run(seconds, started, isInVoice ? 1 : 0, now, member.guild.id, member.id);
}

function snapshot(row, now = Date.now()) {
  const voiceSeconds = Math.max(0, Number(row.voice_seconds) || 0) +
    (row.voice_started_at == null ? 0 : Math.max(0, Math.floor((now - Number(row.voice_started_at)) / 1000)));
  return {
    days: Math.max(0, Math.floor((now - Number(row.joined_at)) / DAY)),
    messages: Number(row.message_count) || 0,
    activeDays: Number(row.active_days) || 0,
    voiceSeconds,
    lastActivityAt: Number(row.last_activity_at) || Number(row.joined_at) || now,
  };
}

function rankIndexFor(row, now = Date.now()) {
  const stats = snapshot(row, now);
  let index = 0;
  for (let i = 1; i < RANKS.length; i++) {
    const rank = RANKS[i];
    if (stats.days >= rank.days && stats.messages >= rank.messages &&
        stats.activeDays >= rank.activeDays && stats.voiceSeconds >= rank.voiceSeconds) index = i;
    else break;
  }
  return index;
}

async function sendDm(member, text) {
  await member.send({ content: text }).catch(() => {});
}

async function evaluateMember(member, now = Date.now()) {
  if (!member || member.user?.bot || !member.guild) return;
  let row = getRow.get(member.guild.id, member.id);
  if (!row) {
    row = ensureMember(member, now);
    // Preserve an existing rank during the first rollout: historical message/voice
    // counts cannot be reconstructed reliably from the legacy XP table.
    const existingRank = member.roles.cache.find((item) =>
      RANKS.some((rank) => item.name.trim().toUpperCase().endsWith(rank.name)));
    if (existingRank) {
      const rankName = RANKS.find((rank) => existingRank.name.trim().toUpperCase().endsWith(rank.name))?.name;
      if (rankName) {
        db.prepare("UPDATE member_rank_activity SET current_rank=? WHERE guild_id=? AND user_id=?")
          .run(rankName, member.guild.id, member.id);
        row = getRow.get(member.guild.id, member.id);
      }
    }
  }
  const stats = snapshot(row, now);
  const rankIndex = rankIndexFor(row, now);
  const currentIndex = RANKS.findIndex((rank) => rank.name === row.current_rank);
  let targetIndex = rankIndex;
  let reason = "progress";

  if (stats.lastActivityAt > 0 && now - stats.lastActivityAt >= INACTIVE_LIMIT) {
    targetIndex = Math.min(rankIndex, 0);
    reason = "inactivity";
  } else if (currentIndex > targetIndex) {
    // Activity ranks are never lowered for missed historical thresholds except the inactivity rule.
    targetIndex = currentIndex;
  }

  const target = RANKS[targetIndex];
  const role = member.guild.roles.cache.find((item) => item.name.trim().toUpperCase().endsWith(target.name));
  if (!role) return { changed: false, error: "missing_role", rank: target.name };
  if (!role.editable) return { changed: false, error: "role_not_editable", rank: target.name };

  const rankRoles = member.guild.roles.cache.filter((item) =>
    RANKS.some((rank) => item.name.trim().toUpperCase().endsWith(rank.name)));
  const oldRankRole = rankRoles.find((item) => member.roles.cache.has(item.id));
  if (oldRankRole?.id === role.id && row.current_rank === target.name) return { changed: false, rank: target.name };

  try {
    const remove = rankRoles.filter((item) => member.roles.cache.has(item.id) && item.id !== role.id);
    if (remove.size) await member.roles.remove([...remove.values()], "HeradeLegend automatic rank update");
    if (!member.roles.cache.has(role.id)) await member.roles.add(role, "HeradeLegend automatic rank update");
    db.prepare("UPDATE member_rank_activity SET current_rank=? WHERE guild_id=? AND user_id=?")
      .run(target.name, member.guild.id, member.id);

    if (targetIndex > Math.max(0, currentIndex)) {
      await sendDm(member, `🎉 Поздравляем! Ты получил ранг **${target.name}** на сервере **${member.guild.name}**.`);
    } else if (reason === "inactivity") {
      await sendDm(member, `ℹ️ Твой ранг на сервере **${member.guild.name}** сброшен до **NEWBIE** из-за отсутствия активности в течение 60 дней. Возвращайся в общение, чтобы снова подняться!`);
    }
    return { changed: true, rank: target.name, reason };
  } catch (error) {
    return { changed: false, error };
  }
}

async function evaluateGuild(guild, logger) {
  const members = await guild.members.fetch().catch((error) => {
    logger?.warn("Could not fetch guild members for rank evaluation.", error);
    return null;
  });
  if (!members) return;
  for (const member of members.values()) {
    if (member.user.bot) continue;
    const result = await evaluateMember(member);
    if (result?.error && result.error !== "missing_role") logger?.warn(`Rank evaluation failed for ${member.id}: ${result.error.message || result.error}`);
  }
}

function getLeaderboard(guildId, limit = 10) {
  return db.prepare(`
    SELECT user_id, message_count, active_days, voice_seconds, current_rank, joined_at
    FROM member_rank_activity WHERE guild_id=?
    ORDER BY
      CASE current_rank
        WHEN 'LEGEND' THEN 8 WHEN 'ELITE' THEN 7 WHEN 'MASTER' THEN 6
        WHEN 'VETERAN' THEN 5 WHEN 'ACTIVE' THEN 4 WHEN 'MEMBER' THEN 3
        WHEN 'GUEST' THEN 2 ELSE 1 END DESC,
      message_count DESC, active_days DESC, voice_seconds DESC
    LIMIT ?
  `).all(guildId, Math.max(1, Math.min(25, limit)));
}

module.exports = { RANKS, ensureMember, recordMessage, recordVoiceState, evaluateMember, evaluateGuild, getLeaderboard, snapshot, rankIndexFor };
