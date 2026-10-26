const db = require("./database");
const logger = require("./logger");

function audit(guildId, actorId, action, targetId = null, details = "") {
  db.prepare("INSERT INTO admin_audit (guild_id, actor_id, action, target_id, details) VALUES (?, ?, ?, ?, ?)")
    .run(guildId, actorId, action, targetId, String(details).slice(0, 900));
}

async function processDueTasks(client) {
  const due = db.prepare(
    "SELECT * FROM scheduled_tasks WHERE status='pending' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 10",
  ).all(Date.now());

  for (const task of due) {
    const claimed = db.prepare(
      "UPDATE scheduled_tasks SET status='sending', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'",
    ).run(task.id);
    if (!claimed.changes) continue;

    try {
      const guild = await client.guilds.fetch(task.guild_id).catch(() => null);
      const channel = guild ? await guild.channels.fetch(task.channel_id).catch(() => null) : null;
      if (!channel?.isTextBased() || !channel.isSendable()) {
        throw new Error("Канал недоступен или не поддерживает отправку сообщений.");
      }
      await channel.send({
        content: task.payload,
        allowedMentions: { parse: [] },
      });
      db.prepare("UPDATE scheduled_tasks SET status='sent', sent_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, last_error=NULL WHERE id=?")
        .run(task.id);
      audit(task.guild_id, task.creator_id, "automation_sent", String(task.id), `channel=${task.channel_id}`);
      logger.info(`Scheduled automation task sent: id=${task.id} guild=${task.guild_id}`);
    } catch (error) {
      const attempts = Number(task.attempts || 0) + 1;
      const status = attempts >= 3 ? "failed" : "pending";
      const nextRun = status === "pending" ? Date.now() + attempts * 60_000 : task.scheduled_at;
      db.prepare("UPDATE scheduled_tasks SET status=?, attempts=?, scheduled_at=?, last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(status, attempts, nextRun, String(error.message || error).slice(0, 900), task.id);
      logger.warn(`Scheduled automation task failed: id=${task.id} attempt=${attempts}`, error);
    }
  }
}

let timer = null;
function startAutomationScheduler(client) {
  if (timer) return;
  // Recover tasks interrupted before they were sent. Attempts limit prevents endless retries.
  db.prepare("UPDATE scheduled_tasks SET status=CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END, updated_at=CURRENT_TIMESTAMP WHERE status='sending'").run();
  void processDueTasks(client).catch((error) => logger.error("Automation scheduler initial run failed.", error));
  timer = setInterval(() => {
    void processDueTasks(client).catch((error) => logger.error("Automation scheduler run failed.", error));
  }, 30_000);
  timer.unref?.();
}
function stopAutomationScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
module.exports = { startAutomationScheduler, stopAutomationScheduler, processDueTasks, audit };
