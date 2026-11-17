"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { localLinks, slug } = require("../lib/links");

test("links to markdown files that exist, to headings, and nothing else", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "render-md-links-"));
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "");
  fs.writeFileSync(path.join(root, "my notes.md"), "");
  const file = path.join(root, "README.md");
  const text = [
    "See the [**guide**](docs/guide.md#setup-steps \"title\") and [notes](my%20notes.md).",
    "Again: [guide](docs/guide.md#setup-steps). [Jump](#usage). [Site](https://x.dev/a.md)",
    "[gone](missing.md) [code](lib/x.js)",
    "```",
    "[inside code](docs/guide.md)",
    "```",
  ].join("\n");
  assert.deepEqual(localLinks(text, file), [
    { label: "guide", file: path.join(root, "docs", "guide.md"), anchor: "setup-steps" },
    { label: "notes", file: path.join(root, "my notes.md"), anchor: "" },
    { label: "Jump", file, anchor: "usage" },
  ]);
});

test("slugs match GitHub's anchors", () => {
  assert.equal(slug("Setup Steps"), "setup-steps");
  assert.equal(slug("What's `new` in 2.0?"), "whats-new-in-20");
  assert.equal(slug("lib/shared & you"), "libshared--you");
});
