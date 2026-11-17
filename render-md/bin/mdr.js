#!/usr/bin/env node
"use strict";

// Markdown rendered from a shell. Inside Herdr it opens the viewer in a split
// beside this pane; elsewhere, or with --print, it writes the rendered text.

const fs = require("node:fs");
const path = require("node:path");
const { render } = require("../lib/render");
const { show } = require("../lib/pane");

const USAGE = `mdr: markdown, rendered

  mdr [file]          show file in the viewer beside this pane; with no file,
                      list the markdown files of this folder
  mdr --latest        show the newest markdown file of this folder
  mdr --print <file>  print it rendered (also outside Herdr); - reads stdin
      --width N         wrap at N columns`;

function parse(argv) {
  const flags = { print: false, width: null };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-p" || arg === "--print") flags.print = true;
    else if (arg === "-w" || arg === "--width") flags.width = Number(argv[++i]);
    else if (arg === "-l" || arg === "--latest") flags.latest = true;
    else if (arg === "-h" || arg === "--help") flags.help = true;
    else rest.push(arg);
  }
  return { flags, rest };
}

function main() {
  const { flags, rest } = parse(process.argv.slice(2));
  if (flags.help) return console.log(USAGE);
  const [target] = rest;
  const inHerdr = process.env.HERDR_ENV === "1" && process.env.HERDR_PANE_ID;

  if (!flags.print && inHerdr && target !== "-") {
    const file = target ? path.resolve(target) : null;
    if (file && !fs.existsSync(file)) throw new Error(`${target}: no such file`);
    const res = show({ cwd: process.cwd(), file, latest: flags.latest, pane: process.env.HERDR_PANE_ID });
    if (!res.ok) throw new Error(res.message);
    return;
  }

  if (!target) throw new Error(`which file?\n\n${USAGE}`);
  const text = fs.readFileSync(target === "-" ? 0 : target, "utf8");
  const width = flags.width || Math.min(process.stdout.columns || 80, 100);
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  process.stdout.write(`${render(text, width, { color }).join("\n")}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`mdr: ${error.message}\n`);
  process.exit(1);
}
