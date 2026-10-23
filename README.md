# DS_Hereid — Discord bot for Nugzar

Universal Discord bot built with JavaScript, Node.js 22 and discord.js 14 for Pterodactyl hosting.

## Foundation included
- Discord login and structured console logging.
- Slash commands: `/help`, `/ping`, `/botinfo`.
- SQLite tables for guild settings, member statistics, moderation cases, and tickets.
- Event-handler foundations for welcome/goodbye messages and automatic role assignment.
- Basic repeated-message detection that logs suspicious activity only.

**Not implemented yet:** moderation punishments, configurable anti-raid enforcement, ticket workflows, XP/levels, economy, and management dashboard. These are planned for subsequent stages.

## Requirements
- Node.js 22 or newer.
- A Discord application and bot created in the Discord Developer Portal.
- The bot invited to a test server.

## Discord setup
1. Create an application at https://discord.com/developers/applications and add a Bot user.
2. Copy the bot token into the Pterodactyl environment variable `DISCORD_TOKEN`. Never share or commit it.
3. Copy the Application ID into `CLIENT_ID`.
4. Set the test server ID as `GUILD_ID`.
5. In Bot settings, enable **Server Members Intent** and **Message Content Intent**.
6. Invite the bot using OAuth2 URL Generator with scopes `bot` and `applications.commands`. Grant only the permissions needed for testing.

## Local setup
1. Copy `.env.example` to `.env` and fill in the values.
2. Install packages: `npm install`.
3. Check the entry-point syntax: `npm run check`.
4. Register guild slash commands: `npm run deploy:commands`.
5. Start the bot: `npm start`.

On Windows, copy the example file manually if `cp` is unavailable.

## Pterodactyl setup
- Use a Node.js 22 egg.
- Install command: `npm install`.
- Startup command: `npm start`.
- Add `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, and optionally `DATABASE_PATH=./data/bot.sqlite` and `LOG_LEVEL=info` under Startup → Variables. Alternatively upload a local `.env` only if your hosting setup supports it.
- Keep the `data` directory persistent across restarts and reinstallations.
- Run `npm run deploy:commands` once before the first start and again after changing command definitions.

## Security and data
- Never commit `.env` or expose your bot token.
- Do not delete `data/bot.sqlite` if it contains data.
- The anti-spam foundation currently only logs repeated messages; it does not delete messages or punish users.
