const db = require("./database");

const FEATURES = Object.freeze({
  welcome_messages: { label: "Приветствия новым участникам", description: "Отправка приветствий при входе" },
  goodbye_messages: { label: "Сообщения об уходе", description: "Сообщения при выходе участника" },
  autorole: { label: "Автоматическая роль", description: "Выдача настроенной роли новым участникам" },
  spam_detection: { label: "Обнаружение повторного спама", description: "Предупреждения в журнале о повторяющихся сообщениях" },
  moderation: { label: "Панель модерации", description: "Наказания через административную панель" },
});

const getStatement = db.prepare("SELECT enabled FROM guild_features WHERE guild_id = ? AND feature_key = ?");
const setStatement = db.prepare(`
  INSERT INTO guild_features (guild_id, feature_key, enabled, updated_by, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(guild_id, feature_key) DO UPDATE SET
    enabled = excluded.enabled,
    updated_by = excluded.updated_by,
    updated_at = CURRENT_TIMESTAMP
`);

function isFeatureEnabled(guildId, key) {
  if (!Object.prototype.hasOwnProperty.call(FEATURES, key)) {
    throw new Error(`Unknown feature: ${key}`);
  }
  const row = getStatement.get(guildId, key);
  // Existing installations retain current behavior until an administrator explicitly changes it.
  return row ? row.enabled === 1 : true;
}

function setFeatureEnabled(guildId, key, enabled, actorId) {
  if (!Object.prototype.hasOwnProperty.call(FEATURES, key)) {
    throw new Error(`Unknown feature: ${key}`);
  }
  if (typeof enabled !== "boolean") throw new TypeError("enabled must be a boolean");
  if (!/^\\d{17,20}$/.test(String(guildId)) || !/^\\d{17,20}$/.test(String(actorId))) {
    throw new Error("Invalid Discord guild or actor ID");
  }
  setStatement.run(guildId, key, enabled ? 1 : 0, actorId);
  return enabled;
}

function listFeatures(guildId) {
  return Object.entries(FEATURES).map(([key, feature]) => ({
    key, ...feature, enabled: isFeatureEnabled(guildId, key),
  }));
}

module.exports = { FEATURES, isFeatureEnabled, setFeatureEnabled, listFeatures };
