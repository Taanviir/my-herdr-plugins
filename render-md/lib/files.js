"use strict";

// The markdown files of a folder, newest first. Inside a git repo that is what
// git knows about, minus what it ignores; elsewhere a shallow walk.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const EXTENSIONS = /\.(md|markdown|mdx)$/i;
const SKIP = new Set(["node_modules", "vendor", "dist", "build", "target", "out", "__pycache__"]);
const MAX_DEPTH = 6;
const MAX_FILES = 5000;

function gitRoot(cwd) {
  const res = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 3000 });
  return res.status === 0 ? res.stdout.trim() : null;
}

function fromGit(root) {
  const res = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z", "--", "*.md", "*.markdown", "*.mdx"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return res.status === 0 ? res.stdout.split("\0").filter(Boolean) : null;
}

function walk(root) {
  const found = [];
  const visit = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_FILES) return;
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH && !entry.name.startsWith(".") && !SKIP.has(entry.name)) visit(rel, depth + 1);
      } else if (EXTENSIONS.test(entry.name)) {
        found.push(rel);
      }
    }
  };
  visit("", 0);
  return found;
}

// [{ rel, file, mtime }] for the folder `cwd` is in.
function markdownFiles(cwd) {
  const repo = gitRoot(cwd);
  const root = repo ?? cwd;
  const names = (repo && fromGit(root)) || walk(root);
  const files = [];
  for (const rel of names.slice(0, MAX_FILES)) {
    const file = path.join(root, rel);
    try {
      files.push({ rel, file, mtime: fs.statSync(file).mtimeMs });
    } catch { /* listed but deleted */ }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return { root, files };
}

function age(mtime, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - mtime) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

module.exports = { markdownFiles, walk, age };
