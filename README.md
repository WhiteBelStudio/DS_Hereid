# DS_Hereid — Discord bot for Nugzar

Universal Discord bot built with JavaScript, Node.js 22 and discord.js 14 for Pterodactyl hosting.

## Setup
1. Configure a Discord application and bot in the Discord Developer Portal.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`.
3. Enable Server Members Intent and Message Content Intent in the Developer Portal.
4. Run `npm install`.
5. Register slash commands with `npm run deploy:commands`.
6. Start with `npm start`.

See `README.md` sections added with the project for setup details. Never commit `.env` or expose your bot token.

## Current status
Foundation stage: slash commands, SQLite schema, basic welcome/goodbye/autorole event handlers, error logging, and log-only repeated-message detection. Moderation actions, tickets, XP/economy and dashboard are planned next and are not yet complete.
