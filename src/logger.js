const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = levels[process.env.LOG_LEVEL || "info"] ?? levels.info;

function write(level, message, extra) {
  if (levels[level] > threshold) return;
  const stamp = new Date().toISOString();
  const suffix = extra === undefined ? "" : ` ${extra instanceof Error ? extra.stack || extra.message : JSON.stringify(extra)}`;
  const line = `[${stamp}] [${level.toUpperCase()}] ${message}${suffix}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

module.exports = {
  error: (message, extra) => write("error", message, extra),
  warn: (message, extra) => write("warn", message, extra),
  info: (message, extra) => write("info", message, extra),
  debug: (message, extra) => write("debug", message, extra),
};
