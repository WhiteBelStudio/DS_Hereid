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
    report_channel_id TEXT,
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
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    target_id TEXT,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence_url TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
    handled_by TEXT,
    resolution TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS admin_access_roles (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    section TEXT NOT NULL,
    granted_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, role_id, section)
  );
  CREATE TABLE IF NOT EXISTS music_settings (guild_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), voice_channel_id TEXT, volume INTEGER NOT NULL DEFAULT 50 CHECK(volume BETWEEN 0 AND 100), repeat_mode TEXT NOT NULL DEFAULT 'off' CHECK(repeat_mode IN ('off','track','queue')), updated_by TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS music_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, owner_id, name)
  );
  CREATE TABLE IF NOT EXISTS music_playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL REFERENCES music_playlists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    source TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_music_playlists_owner ON music_playlists(guild_id, owner_id, name);
  CREATE INDEX IF NOT EXISTS idx_music_playlist_tracks_order ON music_playlist_tracks(playlist_id, id);
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
  CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'announcement',
    payload TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS automod_settings (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    mass_mention_limit INTEGER NOT NULL DEFAULT 5 CHECK (mass_mention_limit BETWEEN 3 AND 20),
    filter_links INTEGER NOT NULL DEFAULT 0 CHECK (filter_links IN (0,1)),
    filter_invites INTEGER NOT NULL DEFAULT 1 CHECK (filter_invites IN (0,1)),
    delete_flagged INTEGER NOT NULL DEFAULT 1 CHECK (delete_flagged IN (0,1)),
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS automod_terms (
    guild_id TEXT NOT NULL,
    term TEXT NOT NULL,
    added_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, term)
  );
  CREATE TABLE IF NOT EXISTS automod_exempt_channels (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    added_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, channel_id)
  );
  CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_created ON moderation_cases(guild_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_guild_id ON admin_audit(guild_id, id);
`);

const guildSettingsColumns = db.prepare("PRAGMA table_info(guild_settings)").all().map((column) => column.name);
if (!guildSettingsColumns.includes("report_channel_id")) db.exec("ALTER TABLE guild_settings ADD COLUMN report_channel_id TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_reports_guild_status ON reports(guild_id, status, id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due ON scheduled_tasks(status, scheduled_at)");
db.exec("CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_guild ON scheduled_tasks(guild_id, status, scheduled_at)");
db.exec("CREATE INDEX IF NOT EXISTS idx_automod_terms_guild ON automod_terms(guild_id)");
const moderationColumns = db.prepare("PRAGMA table_info(moderation_cases)").all().map((column) => column.name);
if (!moderationColumns.includes("duration_minutes")) db.exec("ALTER TABLE moderation_cases ADD COLUMN duration_minutes INTEGER");
const memberStatsColumns = db.prepare("PRAGMA table_info(member_stats)").all().map((column) => column.name);
for (const [name, definition] of [
  ["xp", "INTEGER NOT NULL DEFAULT 0"],
  ["level", "INTEGER NOT NULL DEFAULT 0"],
  ["balance", "INTEGER NOT NULL DEFAULT 0"],
  ["last_xp_at", "INTEGER NOT NULL DEFAULT 0"],
  ["last_daily_at", "INTEGER NOT NULL DEFAULT 0"],
]) {
  if (!memberStatsColumns.includes(name)) db.exec(`ALTER TABLE member_stats ADD COLUMN ${name} ${definition}`);
}

logger.info(`SQLite database ready at ${filename}`);
module.exports = db;
