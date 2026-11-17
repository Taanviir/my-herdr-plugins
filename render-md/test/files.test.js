"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { markdownFiles, age } = require("../lib/files");

function folder(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "render-md-"));
  for (const [rel, when] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "# x\n");
    fs.utimesSync(file, when, when);
  }
  return root;
}

test("outside git: markdown files newest first, skipping dot folders and node_modules", () => {
  const root = folder({ "old.md": 1000, "docs/new.markdown": 3000, "notes.txt": 4000, ".hidden/a.md": 5000, "node_modules/b.md": 5000 });
  const { files } = markdownFiles(root);
  assert.deepEqual(files.map((f) => f.rel), ["docs/new.markdown", "old.md"]);
});

test("inside git: tracked and untracked files, without ignored ones", () => {
  const root = folder({ "README.md": 2000, "plan.md": 3000, "ignored/c.md": 4000 });
  fs.writeFileSync(path.join(root, ".gitignore"), "ignored/\n");
  require("node:child_process").spawnSync("git", ["init", "-q"], { cwd: root });
  const { root: found, files } = markdownFiles(path.join(root));
  assert.equal(fs.realpathSync(found), fs.realpathSync(root));
  assert.deepEqual(files.map((f) => f.rel), ["plan.md", "README.md"]);
});

test("ages read the way a list wants them", () => {
  const now = 10 * 24 * 3600 * 1000;
  assert.equal(age(now - 5000, now), "now");
  assert.equal(age(now - 5 * 60000, now), "5m");
  assert.equal(age(now - 3 * 3600000, now), "3h");
  assert.equal(age(now - 2 * 86400000, now), "2d");
});
