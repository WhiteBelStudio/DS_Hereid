const db = require("./database");

const DAILY_REWARD = 100;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CATALOG = Object.freeze([
  { id: "title_newcomer", name: "Титул «Новичок»", category: "Титулы", description: "Небольшой титул для профиля.", price: 150, type: "title", value: "Новичок" },
  { id: "title_veteran", name: "Титул «Ветеран»", category: "Титулы", description: "Титул для коллекции профиля.", price: 650, type: "title", value: "Ветеран" },
  { id: "title_legend", name: "Титул «Легенда»", category: "Титулы", description: "Редкий косметический титул.", price: 1500, type: "title", value: "Легенда" },
  { id: "badge_star", name: "Значок «Звезда»", category: "Значки", description: "Значок рядом с оформлением профиля.", price: 300, type: "badge", value: "⭐" },
  { id: "badge_spark", name: "Значок «Искра»", category: "Значки", description: "Яркий значок для профиля.", price: 450, type: "badge", value: "✨" },
  { id: "frame_ocean", name: "Рамка «Океан»", category: "Рамки", description: "Косметическая рамка профиля.", price: 500, type: "frame", value: "Океан" },
  { id: "frame_neon", name: "Рамка «Неон»", category: "Рамки", description: "Неоновая рамка профиля.", price: 900, type: "frame", value: "Неон" },
  { id: "color_blue", name: "Цвет «Синий»", category: "Цвета", description: "Синий цвет карточки профиля.", price: 250, type: "color", value: "5865F2" },
  { id: "color_purple", name: "Цвет «Фиолетовый»", category: "Цвета", description: "Фиолетовый цвет карточки профиля.", price: 400, type: "color", value: "9B59B6" },
  { id: "color_teal", name: "Цвет «Бирюзовый»", category: "Цвета", description: "Бирюзовый цвет карточки профиля.", price: 550, type: "color", value: "1ABC9C" },
]);

db.exec(`
  CREATE TABLE IF NOT EXISTS economy_inventory (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    purchased_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, item_id)
  );
  CREATE TABLE IF NOT EXISTS economy_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    actor_id TEXT,
    amount INTEGER NOT NULL,
    kind TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS member_custom_profiles (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title_item_id TEXT,
    badge_item_id TEXT,
    frame_item_id TEXT,
    color_item_id TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_economy_transactions_member ON economy_transactions(guild_id, user_id, id DESC);
`);

const itemById = new Map(CATALOG.map((item) => [item.id, item]));
const ensureMember = db.prepare("INSERT INTO member_stats (guild_id,user_id) VALUES (?,?) ON CONFLICT(guild_id,user_id) DO NOTHING");
const getBalanceStatement = db.prepare("SELECT balance, last_daily_at FROM member_stats WHERE guild_id=? AND user_id=?");
const logTransaction = db.prepare("INSERT INTO economy_transactions (guild_id,user_id,actor_id,amount,kind,details,created_at) VALUES (?,?,?,?,?,?,?)");

function getBalance(guildId, userId) {
  const row = getBalanceStatement.get(guildId, userId);
  return { balance: Number(row?.balance || 0), lastDailyAt: Number(row?.last_daily_at || 0) };
}
function claimDaily(guildId, userId, now = Date.now()) {
  const run = db.transaction(() => {
    ensureMember.run(guildId, userId);
    const current = getBalance(guildId, userId);
    const elapsed = now - current.lastDailyAt;
    if (current.lastDailyAt > 0 && elapsed < DAILY_COOLDOWN_MS) {
      return { claimed: false, balance: current.balance, remainingMs: Math.max(0, DAILY_COOLDOWN_MS - elapsed) };
    }
    db.prepare("UPDATE member_stats SET balance=balance+?, last_daily_at=? WHERE guild_id=? AND user_id=?")
      .run(DAILY_REWARD, now, guildId, userId);
    logTransaction.run(guildId, userId, null, DAILY_REWARD, "daily", "Ежедневная награда", now);
    return { claimed: true, reward: DAILY_REWARD, balance: current.balance + DAILY_REWARD, remainingMs: DAILY_COOLDOWN_MS };
  });
  return run();
}
function buyItem(guildId, userId, itemId, now = Date.now()) {
  const item = itemById.get(itemId);
  if (!item) return { ok: false, reason: "unknown_item" };
  const run = db.transaction(() => {
    ensureMember.run(guildId, userId);
    if (db.prepare("SELECT 1 FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?").get(guildId,userId,itemId)) {
      return { ok: false, reason: "already_owned", item, balance: getBalance(guildId,userId).balance };
    }
    const debit = db.prepare("UPDATE member_stats SET balance=balance-? WHERE guild_id=? AND user_id=? AND balance>=?")
      .run(item.price, guildId, userId, item.price);
    if (debit.changes !== 1) return { ok: false, reason: "insufficient_funds", item, balance: getBalance(guildId,userId).balance };
    db.prepare("INSERT INTO economy_inventory (guild_id,user_id,item_id,purchased_at) VALUES (?,?,?,?)").run(guildId,userId,itemId,now);
    logTransaction.run(guildId,userId,null,-item.price,"purchase",item.id,now);
    return { ok: true, item, balance: getBalance(guildId,userId).balance };
  });
  return run();
}
function getInventory(guildId, userId) {
  return db.prepare("SELECT item_id, purchased_at FROM economy_inventory WHERE guild_id=? AND user_id=? ORDER BY purchased_at, item_id")
    .all(guildId,userId).map((row) => ({ ...row, item: itemById.get(row.item_id) })).filter((row) => row.item);
}
function getCustomProfile(guildId, userId) {
  const row = db.prepare("SELECT * FROM member_custom_profiles WHERE guild_id=? AND user_id=?").get(guildId,userId);
  if (!row) return { title: null, badge: null, frame: null, color: null };
  return {
    title: row.title_item_id ? itemById.get(row.title_item_id) || null : null,
    badge: row.badge_item_id ? itemById.get(row.badge_item_id) || null : null,
    frame: row.frame_item_id ? itemById.get(row.frame_item_id) || null : null,
    color: row.color_item_id ? itemById.get(row.color_item_id) || null : null,
  };
}
function equipItem(guildId, userId, itemId, now = Date.now()) {
  const item = itemById.get(itemId);
  if (!item) return { ok: false, reason: "unknown_item" };
  const owned = db.prepare("SELECT 1 FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?").get(guildId,userId,itemId);
  if (!owned) return { ok: false, reason: "not_owned", item };
  const column = ({ title: "title_item_id", badge: "badge_item_id", frame: "frame_item_id", color: "color_item_id" })[item.type];
  const run = db.transaction(() => {
    db.prepare(`INSERT INTO member_custom_profiles (guild_id,user_id,${column},updated_at) VALUES (?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET ${column}=excluded.${column},updated_at=excluded.updated_at`)
      .run(guildId,userId,itemId,now);
  });
  run();
  return { ok: true, item, profile: getCustomProfile(guildId,userId) };
}
function removeEquipped(guildId, userId, type, now = Date.now()) {
  const column = ({ title: "title_item_id", badge: "badge_item_id", frame: "frame_item_id", color: "color_item_id" })[type];
  if (!column) return false;
  db.prepare(`UPDATE member_custom_profiles SET ${column}=NULL,updated_at=? WHERE guild_id=? AND user_id=?`).run(now,guildId,userId);
  return true;
}
function adjustBalance(guildId, userId, actorId, amount, reason = "Административная корректировка", now = Date.now()) {
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) throw new RangeError("Сумма должна быть целым числом от -1000000 до 1000000, кроме нуля.");
  const run = db.transaction(() => {
    ensureMember.run(guildId,userId);
    const debit = db.prepare("UPDATE member_stats SET balance=balance+? WHERE guild_id=? AND user_id=? AND balance+?>=0")
      .run(amount,guildId,userId,amount);
    if (debit.changes !== 1) return { ok: false, reason: "negative_balance", balance: getBalance(guildId,userId).balance };
    const balance = getBalance(guildId,userId).balance;
    logTransaction.run(guildId,userId,actorId,amount,"admin_adjustment",String(reason).slice(0,300),now);
    return { ok: true, balance };
  });
  return run();
}
function getTransactions(guildId, userId, limit = 10) {
  return db.prepare("SELECT amount,kind,details,created_at FROM economy_transactions WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT ?")
    .all(guildId,userId,Math.min(25,Math.max(1,limit)));
}
module.exports = { DAILY_REWARD, DAILY_COOLDOWN_MS, CATALOG, getBalance, claimDaily, buyItem, getInventory, getCustomProfile, equipItem, removeEquipped, adjustBalance, getTransactions };
