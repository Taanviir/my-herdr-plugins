"use strict";

// One-command install: bind the viewer in config.toml and put `mdr` on PATH.
// Herdr plugins cannot register their own keys.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { run, notify, BIN } = require("../lib/shared/herdr");
const { PLUGIN_ID } = require("../lib/pane");
const { link } = require("../lib/link");

const KEY = process.env.RENDER_MD_KEY ?? "prefix+m";
const COMMAND = `${PLUGIN_ID}.open`;

// `herdr --help` prints the config path it actually uses.
function configPath() {
  const res = spawnSync(BIN, ["--help"], { encoding: "utf8" });
  const match = /^Config:\s*(.+)$/m.exec(res.stdout ?? "");
  if (match) return match[1].trim();
  const base = process.env.APPDATA ?? path.join(os.homedir(), ".config");
  return path.join(base, "herdr", "config.toml");
}

function bindKey() {
  const file = configPath();
  let config = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (config.includes(`"${COMMAND}"`)) return "Render MD is already bound";
  // Do not quietly shadow a key that is already in use.
  const escaped = KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^\\s*(key\\s*=|[a-z_]+\\s*=)\\s*(["'])${escaped}\\2`, "m").test(config)) {
    return `${KEY} is taken, so Render MD is unbound; set RENDER_MD_KEY and run setup again`;
  }

  if (config) fs.copyFileSync(file, `${file}.bak-render-md`);
  else fs.mkdirSync(path.dirname(file), { recursive: true });
  if (config && !config.endsWith("\n")) config += "\n";
  fs.writeFileSync(file, `${config}\n[[keys.command]]\nkey = "${KEY}"\ntype = "plugin_action"\ncommand = "${COMMAND}"\ndescription = "Render MD"\n`);

  const reloaded = run(["server", "reload-config"], { check: false });
  return reloaded.ok ? `${KEY}: Render MD` : `${KEY}: Render MD (config reload failed: ${reloaded.message})`;
}

const report = [bindKey(), link()];
process.stdout.write(`${report.join("\n")}\n`);
notify("Render MD", report.join(" · "), "done");
