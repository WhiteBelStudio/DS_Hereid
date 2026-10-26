const db = require("./database");
const { getProfile } = require("./member-profile");
const { snapshot } = require("./rank-system");

db.exec(`CREATE TABLE IF NOT EXISTS member_achievements (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, achievement_id TEXT NOT NULL, awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (guild_id, user_id, achievement_id)); CREATE INDEX IF NOT EXISTS idx_member_achievements_user ON member_achievements(guild_id, user_id, awarded_at);`);

const ACHIEVEMENTS = [
  { id: "first_message", name: "Первое слово", emoji: "💬", description: "Отправить первое подходящее сообщение", test: s => s.messages >= 1 },
  { id: "messages_10", name: "Разговор пошёл", emoji: "🗣️", description: "Отправить 10 сообщений", test: s => s.messages >= 10 },
  { id: "messages_100", name: "Свой человек", emoji: "🤝", description: "Отправить 100 сообщений", test: s => s.messages >= 100 },
  { id: "messages_1000", name: "Душа компании", emoji: "🎙️", description: "Отправить 1 000 сообщений", test: s => s.messages >= 1000 },
  { id: "active_7", name: "На связи", emoji: "📅", description: "Быть активным 7 дней", test: s => s.activeDays >= 7 },
  { id: "active_30", name: "Постоянный участник", emoji: "🌟", description: "Быть активным 30 дней", test: s => s.activeDays >= 30 },
  { id: "voice_1h", name: "Голос знаком", emoji: "🎧", description: "Провести час в голосовых каналах", test: s => s.voiceSeconds >= 3600 },
  { id: "voice_10h", name: "Голосовой ветеран", emoji: "🎵", description: "Провести 10 часов в голосовых каналах", test: s => s.voiceSeconds >= 36000 },
  { id: "level_5", name: "Первые вершины", emoji: "📈", description: "Достичь 5-го уровня", test: s => s.level >= 5 },
  { id: "level_10", name: "Опытный", emoji: "🏅", description: "Достичь 10-го уровня", test: s => s.level >= 10 },
  { id: "server_30", name: "Уже освоился", emoji: "🏡", description: "Провести на сервере 30 дней", test: s => s.days >= 30 },
  { id: "server_180", name: "Легенда сообщества", emoji: "👑", description: "Провести на сервере 180 дней", test: s => s.days >= 180 },
];

const getAwarded = db.prepare("SELECT achievement_id, awarded_at FROM member_achievements WHERE guild_id=? AND user_id=? ORDER BY awarded_at");
const award = db.prepare("INSERT OR IGNORE INTO member_achievements(guild_id,user_id,achievement_id) VALUES(?,?,?)");
function evaluateAchievements(guildId, userId) {
  const profile = getProfile(guildId, userId);
  const rank = db.prepare("SELECT * FROM member_rank_activity WHERE guild_id=? AND user_id=?").get(guildId, userId);
  const stats = rank ? snapshot(rank) : { messages: 0, activeDays: 0, voiceSeconds: 0, days: 0 };
  stats.level = Math.max(Number(profile.level) || 0, Math.floor(Math.sqrt(Math.max(0, Number(profile.xp) || 0) / 100)));
  const newlyAwarded = [];
  db.transaction(() => {
    for (const achievement of ACHIEVEMENTS) {
      if (achievement.test(stats) && award.run(guildId, userId, achievement.id).changes > 0) newlyAwarded.push(achievement);
    }
  })();
  return newlyAwarded;
}
function listAchievements(guildId, userId) {
  const awarded = new Map(getAwarded.all(guildId, userId).map(row => [row.achievement_id, row.awarded_at]));
  return ACHIEVEMENTS.map(item => ({ ...item, unlocked: awarded.has(item.id), awardedAt: awarded.get(item.id) || null }));
}
module.exports = { ACHIEVEMENTS, evaluateAchievements, listAchievements };
