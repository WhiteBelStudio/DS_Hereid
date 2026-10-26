# Дух Свободы 🕊 — HeradeLegend Discord bot

Universal Discord community bot built with Node.js 22, discord.js 14 and SQLite for Pterodactyl.

## Features

- Discord login, structured logging and graceful shutdown.
- Slash commands: `/help`, `/ping`, `/botinfo`, `/admin`, `/serverconfig`.
- Interactive ephemeral administration panel with sections for member lookup, XP management, moderation, staff-role access, server settings, feature controls, statistics and audit.
- Persistent feature switches for welcome messages, goodbye messages, automatic roles, repeated-message spam detection and the moderation panel; each change is access-checked and audited.
- Role-based access grants stored in SQLite; server Administrators and configured bot owners have full panel access.
- Moderation actions: 10-minute timeout, kick and ban with required reason, hierarchy/permission checks, case history and optional mod-log channel.
- Welcome/goodbye messages and automatic role assignment.
- Repeated-message spam detection (log-only; no automatic deletion or punishment).
- Music player with YouTube and SoundCloud search, interactive result selection, voice playback, queue, pause/resume, skip/stop, volume and repeat modes.

## Requirements and setup

- Node.js 22 or newer.
- A Discord application/bot and a test server.
- Enable **Server Members Intent** and **Message Content Intent** in Discord Developer Portal.
- Invite the bot with `bot` and `applications.commands` scopes and only the permissions required for the enabled features.

1. Set `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID` in your environment.
2. Optionally set `BOT_OWNER_IDS` to comma-separated Discord user IDs for bot owners.
3. Install dependencies with `npm install`.
4. Check JavaScript syntax with `npm run check`.
5. Music playback dependencies are installed by `npm install`; allow voice UDP traffic on the host and grant the bot `Connect` and `Speak` in voice channels.
5. Start with `npm start`. Slash commands are registered automatically when the bot connects.

## Pterodactyl

- Use a Node.js 22 egg.
- Initial install command: `npm install`.
- For a Git clone of this repository, use this startup command to pull the latest `main` branch before launching: `git pull --ff-only origin main && npm install --omit=dev && npm start`.
- Set the environment variables in Pterodactyl's Variables panel; never commit `.env` or put the token in source.
- Keep `DATABASE_PATH` pointed to persistent storage, default `./data/bot.sqlite`.
- Follow `pterodactyl-startup.txt` for the full deployment procedure and troubleshooting steps.

## Music player

Use `/music play query:<title or artist>` to search YouTube and SoundCloud. Select a result with its button. Playback controls are `/music now`, `/music queue`, `/music pause`, `/music resume`, `/music skip`, `/music stop`, `/music volume percent:<0-100>`, and `/music repeat mode:<off|track|queue>`. The player queue is kept in memory and is reset when the bot restarts; the existing SQLite database is not used or modified by the music module. Provider availability can change, and Spotify is not used as an audio source.

## Admin panel

Use `/admin` in a server. Server Administrators and IDs listed in `BOT_OWNER_IDS` can manage panel access roles. Other staff members need a role granted access to one or more sections. Permissions are checked again when interactive components are used.

The panel includes:
- Member lookup and XP adjustments.
- Timeout (10 minutes), kick and ban; each requires a reason and checks the Discord role hierarchy.
- Per-section staff-role access grants.
- Current server configuration, summary statistics and audit log.
- Feature switches: welcome messages, goodbye messages, automatic roles, spam detection and moderation. Existing installations keep current behavior by default; settings are stored per guild in SQLite and changes are recorded in the audit log.
- Moderation case history and optional posting to the configured moderation-log channel.

## Data and safety notes

- Existing SQLite files are preserved; tables are created with `CREATE TABLE IF NOT EXISTS`. Feature settings use a separate `guild_features` table and do not reset member statistics or other existing data.
- The repository ignores `.env`, `node_modules/`, `data/`, and SQLite database files.
- Never commit `.env` or share the bot token.
- Ensure the bot role is above roles it must manage and has the necessary Discord permissions.
- Spam detection remains log-only. It does not delete messages or issue automatic punishments.
- A successful syntax check does not prove live Discord permissions, interactions, or Pterodactyl startup. Test these on a test server before using the panel on a production community.
