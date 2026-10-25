const db = require("./database");
const MESSAGE_XP = 5;
const XP_COOLDOWN_MS = 60_000;
function levelForXp(xp) { return Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 100)); }
function getProfile(guildId, userId) {
  const row = db.prepare("SELECT guild_id, user_id, xp, level, balance, last_xp_at FROM member_stats WHERE guild_id=? AND user_id=?").get(guildId, userId);
  return row || { guild_id: guildId, user_id: userId, xp: 0, level: 0, balance: 0, last_xp_at: 0 };
}
function addMessageXp(guildId, userId, now = Date.now()) {
  const current = getProfile(guildId, userId);
  if (now - Number(current.last_xp_at || 0) < XP_COOLDOWN_MS) return { awarded: false, xp: current.xp, level: levelForXp(current.xp), previousLevel: levelForXp(current.xp) };
  const xp = Math.max(0, Number(current.xp) || 0) + MESSAGE_XP;
  const level = levelForXp(xp);
  db.prepare("INSERT INTO member_stats (guild_id,user_id,xp,level,last_xp_at) VALUES (?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=excluded.xp,level=excluded.level,last_xp_at=excluded.last_xp_at").run(guildId,userId,xp,level,now);
  return { awarded: true, xp, level, previousLevel: levelForXp(current.xp) };
}
function changeXp(guildId, userId, amount) {
  const current = getProfile(guildId, userId);
  const xp = Math.max(0, current.xp + amount);
  const level = levelForXp(xp);
  db.prepare("INSERT INTO member_stats (guild_id,user_id,xp,level) VALUES (?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=excluded.xp,level=excluded.level").run(guildId,userId,xp,level);
  return { xp, level, previousLevel: levelForXp(current.xp) };
}
module.exports = { MESSAGE_XP, XP_COOLDOWN_MS, levelForXp, getProfile, addMessageXp, changeXp };
