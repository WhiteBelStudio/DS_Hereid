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
    category TEXT NOT NULL DEFAULT 'general',
    initial_message TEXT,
    assigned_to TEXT,
    closed_by TEXT,
    close_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_tag TEXT NOT NULL,
    content TEXT NOT NULL,
    message_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS admin_access_roles (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    section TEXT NOT NULL,
    granted_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, role_id, section)
  );
  CREATE TABLE IF NOT EXISTS guild_features (
    guild_id TEXT NOT NULL,
    feature_key TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, feature_key)
  );
  CREATE TABLE IF NOT EXISTS admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_created ON moderation_cases(guild_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_guild_id ON admin_audit(guild_id, id);
`);

// Additive migrations: preserve existing ticket records and extend them in place.
const ticketColumns = db.prepare("PRAGMA table_info(tickets)").all().map((column) => column.name);
for (const [name, definition] of [
  ["category", "TEXT NOT NULL DEFAULT 'general'"],
  ["initial_message", "TEXT"],
  ["assigned_to", "TEXT"],
  ["closed_by", "TEXT"],
  ["close_reason", "TEXT"],
  ["updated_at", "TEXT"],
]) {
  if (!ticketColumns.includes(name)) db.exec(`ALTER TABLE tickets ADD COLUMN ${name} ${definition}`);
}
db.exec("UPDATE tickets SET updated_at = COALESCE(updated_at, closed_at, created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status, id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON support_ticket_messages(ticket_id, id)");

// Additive migration: keep existing moderation cases while recording timeout duration.
const moderationColumns = db.prepare("PRAGMA table_info(moderation_cases)").all().map((column) => column.name);
if (!moderationColumns.includes("duration_minutes")) {
  db.exec("ALTER TABLE moderation_cases ADD COLUMN duration_minutes INTEGER");
}

logger.info(`SQLite database ready at ${filename}`);
module.exports = db;
