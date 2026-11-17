"use strict";

// `mdr` on PATH is a symlink to bin/mdr.js in this checkout. Herdr installs
// every update into a new folder and later removes the old one, so the viewer
// moves the link along each time it starts.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.resolve(__dirname, "..", "bin", "mdr.js");

function binDir() {
  return process.env.RENDER_MD_BIN_DIR ?? path.join(os.homedir(), ".local", "bin");
}

// Setup's link, as a line for its report.
function link() {
  if (process.platform === "win32") return `add an mdr command that runs: node "${SCRIPT}"`;
  const dir = binDir();
  const at = path.join(dir, "mdr");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const existing = fs.lstatSync(at, { throwIfNoEntry: false });
    if (existing && !existing.isSymbolicLink()) return `${at} exists and is not ours; mdr was not linked`;
    if (existing) fs.unlinkSync(at);
    fs.symlinkSync(SCRIPT, at);
    const onPath = (process.env.PATH ?? "").split(path.delimiter).includes(dir);
    return `mdr linked into ${dir}${onPath ? "" : " (not on your PATH)"}`;
  } catch (error) {
    return `could not link mdr: ${error.message}`;
  }
}

// Points a link to another checkout of this plugin at this one. Anything else,
// or no link at all, is left alone.
function relink() {
  const at = path.join(binDir(), "mdr");
  try {
    const target = fs.readlinkSync(at);
    if (target === SCRIPT || !/render-md.*[\\/]bin[\\/]mdr\.js$/.test(target)) return;
    fs.unlinkSync(at);
    fs.symlinkSync(SCRIPT, at);
  } catch { /* not linked */ }
}

module.exports = { link, relink };
