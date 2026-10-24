# Дух Свободы 🕊 — HeradeLegend Discord bot

Universal Discord community bot built with Node.js 22, discord.js 14 and SQLite for Pterodactyl.

## Features

- Discord login, structured logging and graceful shutdown.
- Slash commands: `/help`, `/ping`, `/botinfo`, `/admin`, `/serverconfig`.
- Interactive ephemeral administration panel with sections for member lookup, XP management, moderation, staff-role access, RP actions, server settings, statistics and audit.
- Role-based access grants stored in SQLite; server Administrators and configured bot owners have full panel access.
- Moderation actions: 10-minute timeout, kick and ban with required reason, hierarchy/permission checks, case history and optional mod-log channel.
- RP action creation, enable/disable and exact phrase triggers.
- SQLite tables for guild settings, member stats, moderation cases, tickets, admin access roles, audit and RP actions.
- Welcome/goodbye messages and automatic role assignment.
- Repeated-message spam detection (log-only; no automatic deletion or punishment).

## Requirements and setup

- Node.js 22 or newer.
- A Discord application/bot and a test server.
- Enable **Server Members Intent** and **Message Content Intent** in Discord Developer Portal.
- Invite the bot with `bot` and `applications.commands` scopes and only the permissions required for the enabled features.

1. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`.
2. Optionally set `BOT_OWNER_IDS` to comma-separated Discord user IDs for bot owners.
3. Install dependencies with `npm install`.
4. Check syntax with `npm run check`.
5. Register commands with `npm run deploy:commands`.
6. Start with `npm start`.

## Pterodactyl

- Use a Node.js 22 egg.
- Install command: `npm install`.
- Startup command: `npm start`.
- Keep `data/bot.sqlite` persistent across restarts and reinstallations.
- After command definitions change, run `npm run deploy:commands` again.

## Admin panel

Use `/admin` in a server. Server Administrators and IDs listed in `BOT_OWNER_IDS` can manage panel access roles. Other staff members need a role granted access to one or more sections. Permissions are checked again when interactive components are used.

The panel includes:
- Member lookup and XP adjustments.
- Timeout (10 minutes), kick and ban; each requires a reason and checks the Discord role hierarchy.
- Per-section staff-role access grants.
- RP action creation and enable/disable.
- Current server configuration, summary statistics and audit log.
- Moderation case history and optional posting to the configured moderation-log channel.

## Data and safety notes

- Existing SQLite files are preserved; tables are created with `CREATE TABLE IF NOT EXISTS`.
- Never commit `.env` or share the bot token.
- Ensure the bot role is above roles it must manage and has the necessary Discord permissions.
- Spam detection remains log-only. It does not delete messages or issue automatic punishments.
- A successful syntax check does not prove live Discord permissions, interactions, or Pterodactyl startup. Test these on a test server before using the panel on a production community.
