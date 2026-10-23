const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const config = require("./config");
const logger = require("./logger");

const filename = path.resolve(config.databasePath);
fs.mkdirSync(path.dirname(filename), { recursive: true });
const db = new Database(filename);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    welcome_channel_id TEXT,
    goodbye_channel_id TEXT,
    mod_log_channel_id TEXT,
    ticket_category_id TEXT,
    welcome_message TEXT,
    goodbye_message TEXT,
    autorole_id TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS member_stats (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 0,
    balance INTEGER NOT NULL DEFAULT 0,
    last_xp_at INTEGER NOT NULL DEFAULT 0,
    last_daily_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS moderation_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT UNIQUE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT
  );
`);

logger.info(`SQLite database ready at ${filename}`);
module.exports = db;
