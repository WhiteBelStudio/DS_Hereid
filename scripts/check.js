const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const ignored = new Set(["node_modules", ".git", "data"]);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) walk(path.join(directory, entry.name));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path.join(directory, entry.name));
    }
  }
}

walk(root);
files.sort();

if (files.length === 0) {
  console.error("[check] No JavaScript files found.");
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  const relative = path.relative(root, file).split(path.sep).join("/");

  if (result.status !== 0) {
    failed = true;
    console.error(`[FAIL] ${relative}`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  } else {
    console.log(`[ OK ] ${relative}`);
  }
}

if (failed) {
  console.error("[check] One or more JavaScript files have syntax errors.");
  process.exit(1);
}

console.log(`[check] Syntax OK: ${files.length} JavaScript file(s).`);
