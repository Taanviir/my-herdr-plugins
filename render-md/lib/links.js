"use strict";

// Links from a markdown file to other markdown files, or to headings in it,
// in the order they appear. Links to the web are left to the terminal.

const fs = require("node:fs");
const path = require("node:path");

const LINK = /\[((?:[^\][]|\[[^\]]*\])*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g;
const MARKDOWN = /\.(md|markdown|mdx)$/i;
const CODE = /^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1/gm;

// How GitHub turns a heading into an anchor.
function slug(text) {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
}

function plainLabel(label) {
  return label.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`~]/g, "").trim();
}

// [{ label, file, anchor }], where file is absolute and exists.
function localLinks(text, file) {
  const out = [];
  const seen = new Set();
  for (const [, label, target] of text.replace(CODE, "").matchAll(LINK)) {
    if (/^[a-z][\w+.-]*:/i.test(target)) continue;
    const at = target.indexOf("#");
    const part = at < 0 ? target : target.slice(0, at);
    const anchor = at < 0 ? "" : decodeURIComponent(target.slice(at + 1));
    let linked = file;
    if (part) {
      let decoded;
      try {
        decoded = decodeURIComponent(part);
      } catch {
        continue;
      }
      if (!MARKDOWN.test(decoded)) continue;
      linked = path.resolve(path.dirname(file), decoded);
      if (!fs.existsSync(linked)) continue;
    }
    if (!part && !anchor) continue;
    const key = `${linked}#${anchor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: plainLabel(label) || target, file: linked, anchor });
  }
  return out;
}

module.exports = { localLinks, slug };
