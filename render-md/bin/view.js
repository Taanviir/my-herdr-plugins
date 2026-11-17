"use strict";

// The viewer. In its own pane it opens on the newest markdown file of the
// folder you were in, or the one it was given, or the list of them; another
// request swaps what it shows. The open file is watched, so an agent writing
// it shows up as it goes, with what changed marked in the margin for a while.
// Opened from the popup tab strip, it is a popup tab.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { layout } = require("../lib/render");
const { markdownFiles, age } = require("../lib/files");
const { relink } = require("../lib/link");
const { onRequest } = require("../lib/pane");
const { localLinks, slug } = require("../lib/links");
const {
  style,
  pad,
  truncate,
  shortenPath,
  displayWidth,
} = require("../lib/shared/ui");
const { start, isPrintable } = require("../lib/shared/term");
const { strip, switchFor, switchTo } = require("../lib/shared/tabs");

// Prose past this width is hard to read, so wide panes keep a margin.
const MAX_WIDTH = 100;
// Polling, because inotify does not see changes on WSL's /mnt drives.
const WATCH_MS = 500;
const WHEEL_ROWS = 3;
// How long lines that just changed keep their mark.
const CHANGED_MS = 8000;
// The mark and a space before every line of the file.
const MARGIN = 2;
const ANSI = /\x1b\[[0-9;]*m/g;

// A popup has no pane of its own, so Herdr gives it no pane id.
const pane = process.env.HERDR_PANE_ID;
const popup = !pane;
const CHROME = popup ? 1 : 0;

const state = {
  screen: "list", // list | file | picker
  cwd: process.env.RENDER_MD_CWD || process.cwd(),
  list: { root: "", files: [] },
  query: "",
  index: 0,
  offset: 0,
  page: 1, // rows of the list, file or picker on screen, as of the last frame
  file: null,
  text: "",
  missing: false,
  rendered: null, // { width, lines, headings }
  top: 0,
  stick: false, // follow the end of the file as it grows
  search: null, // what is being typed after /
  found: "",
  match: -1,
  picker: null, // { title, items: [{ text, bold?, hint? }], index, choose(item) }
  history: [], // { file, top } for each link followed, so q goes back
  anchor: null, // the heading to show once the file is laid out
  before: null, // the lines as they were before the file last changed
  changed: null, // { lines: Set, timer }
  notice: null,
};

function bar(left, right, width) {
  const gap = width - displayWidth(left) - displayWidth(right);
  return gap >= 2 ? `${left}${" ".repeat(gap)}${right}` : truncate(left, width);
}

function selected(line, width) {
  return style.selected(pad(truncate(line.replace(ANSI, ""), width), width));
}

// Keeps `index` on screen in a list `height` rows tall.
function scrollTo(index, offset, height) {
  if (index < offset) return index;
  if (index >= offset + height) return index - height + 1;
  return offset;
}

// ---- requests ------------------------------------------------------------

// { cwd?, file?, latest? }: a file, the newest one in cwd, or the list.
function show({ cwd, file, latest }) {
  if (cwd) state.cwd = cwd;
  state.history = [];
  if (file) return open(path.resolve(state.cwd, file));
  state.list = markdownFiles(state.cwd);
  if (latest && state.list.files[0]) return open(state.list.files[0].file);
  showList();
}

// ---- the file -------------------------------------------------------------

function load() {
  try {
    state.text = fs.readFileSync(state.file, "utf8");
    state.missing = false;
  } catch {
    state.missing = true;
  }
  state.rendered = null;
}

function maxTop() {
  return Math.max(0, (state.rendered?.lines.length ?? 0) - state.page);
}

function open(file, { top = 0, anchor = null } = {}) {
  if (state.file) fs.unwatchFile(state.file);
  clearChanged();
  Object.assign(state, {
    screen: "file",
    file,
    top,
    anchor,
    match: -1,
    found: "",
    search: null,
    notice: null,
  });
  load();
  fs.watchFile(file, { interval: WATCH_MS }, (now, before) => {
    if (now.mtimeMs === before.mtimeMs && now.size === before.size) return;
    state.stick = state.top > 0 && state.top >= maxTop();
    if (state.rendered) state.before = state.rendered;
    load();
    ui.scheduleRender();
  });
}

function clearChanged() {
  clearTimeout(state.changed?.timer);
  state.changed = null;
  state.before = null;
}

// Lines that were not there before, counting repeats, so a blank line or a
// rule that moved down is not news.
function markChanged(before, after) {
  const plain = (line) => line.replace(ANSI, "");
  const left = new Map();
  for (const line of before.map(plain)) left.set(line, (left.get(line) ?? 0) + 1);
  const lines = new Set();
  after.map(plain).forEach((line, at) => {
    const count = left.get(line) ?? 0;
    if (count > 0) left.set(line, count - 1);
    else if (line.trim()) lines.add(at);
  });
  clearTimeout(state.changed?.timer);
  if (!lines.size) return (state.changed = null);
  const timer = setTimeout(() => {
    state.changed = null;
    ui.scheduleRender();
  }, CHANGED_MS);
  state.changed = { lines, timer };
}

function jumpChanged() {
  const lines = [...(state.changed?.lines ?? [])].sort((a, b) => a - b);
  if (!lines.length) return (state.notice = "nothing changed lately");
  const next = lines.find((line) => line > state.top + 2) ?? lines[0];
  state.top = Math.max(0, next - 2);
}

// Links and anchors open in the viewer; q comes back to where you were.
function follow({ file, anchor }) {
  if (file === state.file) {
    state.screen = "file";
    return goToAnchor(anchor);
  }
  state.history.push({ file: state.file, top: state.top });
  open(file, { anchor: anchor || null });
}

function goToAnchor(anchor) {
  const heading = headings().find((h) => slug(h.text) === anchor);
  if (heading) state.top = heading.line;
  else state.notice = `no heading "#${anchor}" in this file`;
}

function showList() {
  if (state.file) fs.unwatchFile(state.file);
  if (!state.list.root) state.list = markdownFiles(state.cwd);
  state.screen = "list";
  state.index = Math.max(
    0,
    visible().findIndex((entry) => entry.file === state.file),
  );
}

function back() {
  const previous = state.history.pop();
  if (previous) return open(previous.file, { top: previous.top });
  state.list = markdownFiles(state.cwd);
  showList();
}

function find(direction) {
  const query = state.found.toLowerCase();
  const lines = (state.rendered?.lines ?? []).map((line) =>
    line.replace(ANSI, "").toLowerCase(),
  );
  if (!query || !lines.length) return;
  const from =
    state.match >= 0
      ? state.match + direction
      : direction > 0
        ? state.top
        : state.top - 1;
  for (let step = 0; step < lines.length; step += 1) {
    const at =
      (((from + step * direction) % lines.length) + lines.length) %
      lines.length;
    if (lines[at].includes(query)) {
      state.match = at;
      state.top = Math.max(0, at - 2);
      return;
    }
  }
  state.match = -1;
  state.notice = `"${state.found}" is not in this file`;
}

function headings() {
  return state.rendered?.headings ?? [];
}

function jumpHeading(direction) {
  const list = headings();
  const next =
    direction > 0
      ? list.find((h) => h.line > state.top)
      : list.findLast((h) => h.line < state.top);
  if (next) state.top = next.line;
  else state.notice = direction > 0 ? "no heading below" : "no heading above";
}

function edit() {
  const editor = process.env.VISUAL || process.env.EDITOR || "nvim";
  const quoted =
    process.platform === "win32"
      ? `"${state.file}"`
      : `'${state.file.replace(/'/g, "'\\''")}'`;
  const res = ui.suspend(() =>
    spawnSync(`${editor} ${quoted}`, { stdio: "inherit", shell: true }),
  );
  if (res.error || res.status)
    state.notice = `${editor} failed: ${res.error?.message ?? `exit ${res.status}`}`;
  load();
}

function prepare(width) {
  const room = Math.min(width, MAX_WIDTH) - MARGIN;
  if (state.rendered?.width !== room) {
    state.rendered = {
      width: room,
      ...(state.missing
        ? { lines: [], headings: [] }
        : layout(state.text, room)),
    };
    if (state.before?.width === room) markChanged(state.before.lines, state.rendered.lines);
    state.before = null;
    if (state.anchor) goToAnchor(state.anchor);
    state.anchor = null;
  }
  return room;
}

function title(width) {
  return `${style.bold(path.basename(state.file))}  ${style.dim(shortenPath(path.dirname(state.file), Math.floor(width / 2)))}`;
}

function fileBody(width, rows) {
  const room = prepare(width);
  const lines = state.rendered.lines;
  state.page = Math.max(1, rows - 2);
  if (state.stick) state.top = maxTop();
  state.stick = false;
  state.top = Math.min(Math.max(0, state.top), maxTop());

  const where =
    lines.length <= state.page
      ? "all"
      : state.top === 0
        ? "top"
        : state.top >= maxTop()
          ? "end"
          : `${Math.round((state.top / maxTop()) * 100)}%`;
  const fresh = state.changed ? `${style.ok(`${state.changed.lines.size} changed`)}  ` : "";
  const out = [
    bar(
      title(width),
      state.missing ? style.danger("file is gone") : `${fresh}${style.dim(where)}`,
      width,
    ),
  ];

  for (let row = 0; row < state.page; row += 1) {
    const at = state.top + row;
    if (at >= lines.length) {
      out.push("");
      continue;
    }
    const mark = state.changed?.lines.has(at) ? style.ok("▎") : " ";
    out.push(`${mark} ${at === state.match ? selected(lines[at], room) : lines[at]}`);
  }

  if (state.search !== null) {
    out.push(`${style.accent("/")}${state.search}`);
    return {
      lines: out,
      caret: { row: rows - 1, col: 1 + displayWidth(state.search) },
    };
  }
  out.push(
    state.notice
      ? style.warn(state.notice)
      : style.dim(
          `↑↓ scroll · [ ] headings · o outline · l links · c changes · / find · e edit · q ${state.history.length ? "back" : "list"}`,
        ),
  );
  return { lines: out };
}

function fileKey(chunk, key) {
  state.notice = null;
  if (state.search !== null) {
    if (key.name === "return") {
      state.found = state.search;
      state.search = null;
      state.match = -1;
      find(1);
    } else if (key.name === "backspace") {
      state.search = state.search.slice(0, -1);
    } else if (isPrintable(chunk, key)) {
      state.search += chunk;
    }
    return;
  }

  const half = Math.max(1, Math.floor(state.page / 2));
  const moves = {
    j: 1,
    down: 1,
    k: -1,
    up: -1,
    space: state.page,
    f: state.page,
    pagedown: state.page,
    b: -state.page,
    pageup: -state.page,
    d: half,
    u: -half,
  };
  if (chunk === "G" || key.name === "end") state.top = maxTop();
  else if (key.name in moves) state.top += moves[key.name];
  else if (key.name === "g" || key.name === "home") state.top = 0;
  else if (chunk === "]") jumpHeading(1);
  else if (chunk === "[") jumpHeading(-1);
  else if (key.name === "n") find(chunk === "N" ? -1 : 1);
  else if (chunk === "/") state.search = "";
  else if (key.name === "o") openOutline();
  else if (key.name === "l") openLinks();
  else if (key.name === "c") jumpChanged();
  else if (key.name === "e") edit();
  else if (key.name === "r") load();
  else if (key.name === "q") back();
}

// ---- pickers: the outline and the links ---------------------------------

function pick(title, items, index, choose) {
  state.picker = { title, items, index: Math.max(0, index), choose };
  state.offset = 0;
  state.screen = "picker";
}

function openOutline() {
  if (!headings().length) return (state.notice = "no headings in this file");
  const items = headings().map((h) => ({ text: `${"  ".repeat(h.level - 1)}${h.text}`, bold: h.level <= 2, line: h.line }));
  const above = headings().findLastIndex((h) => h.line <= state.top);
  pick("outline", items, above, (item) => {
    state.top = item.line;
    state.screen = "file";
  });
}

function openLinks() {
  const links = state.missing ? [] : localLinks(state.text, state.file);
  if (!links.length) return (state.notice = "no links to other markdown here");
  const items = links.map((link) => {
    const where = link.file === state.file ? "" : path.relative(path.dirname(state.file), link.file);
    return { text: link.label, hint: `${where}${link.anchor ? `#${link.anchor}` : ""}`, link };
  });
  pick("links", items, 0, (item) => follow(item.link));
}

function pickerBody(width, rows) {
  prepare(width);
  const picker = state.picker;
  state.page = Math.max(1, rows - 2);
  picker.index = Math.min(Math.max(0, picker.index), picker.items.length - 1);
  state.offset = scrollTo(picker.index, state.offset, state.page);

  const out = [bar(title(width), style.dim(picker.title), width)];
  for (let row = 0; row < state.page; row += 1) {
    const at = state.offset + row;
    const item = picker.items[at];
    if (!item) {
      out.push("");
      continue;
    }
    const hint = item.hint ? `  ${item.hint}` : "";
    const text = truncate(`${item.text}${hint}`, width);
    if (at === picker.index) out.push(selected(text, width));
    else if (hint) out.push(`${item.text}${style.dim(text.slice(item.text.length))}`);
    else out.push(item.bold ? style.bold(text) : text);
  }
  out.push(style.dim("↑↓ move · ⏎ go · esc back"));
  return { lines: out };
}

function pickerKey(chunk, key) {
  const picker = state.picker;
  if (key.name === "up" || key.name === "k") picker.index -= 1;
  else if (key.name === "down" || key.name === "j") picker.index += 1;
  else if (key.name === "pageup") picker.index -= state.page;
  else if (key.name === "pagedown") picker.index += state.page;
  else if (key.name === "return" && picker.items[picker.index]) picker.choose(picker.items[picker.index]);
  else if (key.name === "q" || key.name === "o" || key.name === "l") state.screen = "file";
}

// ---- the list -------------------------------------------------------------

function visible() {
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
  return state.list.files.filter((entry) =>
    terms.every((term) => entry.rel.toLowerCase().includes(term)),
  );
}

function listBody(width, rows) {
  const entries = visible();
  state.page = Math.max(1, rows - 3);
  state.index = Math.min(
    Math.max(0, state.index),
    Math.max(0, entries.length - 1),
  );
  state.offset = scrollTo(state.index, state.offset, state.page);

  const name = `${style.bold("Markdown")}  ${style.dim(shortenPath(state.list.root, Math.floor(width / 2)))}`;
  const count = `${entries.length} file${entries.length === 1 ? "" : "s"}`;
  const out = [bar(name, style.dim(count), width)];
  out.push(
    `${style.accent("›")} ${state.query || style.dim("type to filter")}`,
  );

  const now = Date.now();
  for (let row = 0; row < state.page; row += 1) {
    const at = state.offset + row;
    const entry = entries[at];
    if (!entry) {
      out.push(
        row === 0
          ? style.dim(
              state.list.files.length
                ? "nothing matches"
                : "no markdown files here",
            )
          : "",
      );
      continue;
    }
    const when = age(entry.mtime, now);
    const rel = truncate(entry.rel, width - when.length - 2);
    out.push(
      at === state.index
        ? style.selected(`${pad(rel, width - when.length)}${when}`)
        : `${rel}${" ".repeat(width - displayWidth(rel) - when.length)}${style.dim(when)}`,
    );
  }

  out.push(style.dim("↑↓ move · ⏎ open · esc close"));
  return { lines: out, caret: { row: 1, col: 2 + displayWidth(state.query) } };
}

function listKey(chunk, key) {
  const entries = visible();
  if (key.name === "up" || (key.ctrl && key.name === "p")) state.index -= 1;
  else if (key.name === "down" || (key.ctrl && key.name === "n"))
    state.index += 1;
  else if (key.name === "pageup") state.index -= state.page;
  else if (key.name === "pagedown") state.index += state.page;
  else if (key.name === "return" && entries[state.index])
    open(entries[state.index].file);
  else if (key.name === "backspace") state.query = state.query.slice(0, -1);
  else if (key.ctrl && key.name === "u") state.query = "";
  else if (isPrintable(chunk, key)) {
    state.query += chunk;
    state.index = 0;
  }
}

// ---- the mouse ------------------------------------------------------------

const WHEEL_UP = 64;
const WHEEL_DOWN = 65;
const MODIFIERS = 4 | 8 | 16;

function onMouse({ button, row, release }) {
  const base = button & ~MODIFIERS;
  const wheel =
    base === WHEEL_UP ? -WHEEL_ROWS : base === WHEEL_DOWN ? WHEEL_ROWS : 0;
  const line = row - CHROME;
  if (state.screen === "file") {
    state.top += wheel;
  } else if (state.screen === "picker") {
    const picker = state.picker;
    if (wheel) picker.index += wheel;
    else if (base === 0 && !release && line >= 1 && line <= state.page) {
      const at = state.offset + line - 1;
      if (at === picker.index && picker.items[at]) picker.choose(picker.items[at]);
      else if (picker.items[at]) picker.index = at;
    }
  } else if (wheel) {
    state.index += wheel;
  } else if (base === 0 && !release && line >= 2 && line < 2 + state.page) {
    const at = state.offset + line - 2;
    const entry = visible()[at];
    if (entry && at === state.index) open(entry.file);
    else if (entry) state.index = at;
  }
}

// ---- wiring ---------------------------------------------------------------

const SCREENS = {
  list: { body: listBody, key: listKey },
  file: { body: fileBody, key: fileKey },
  picker: { body: pickerBody, key: pickerKey },
};

relink();
show({
  file: process.env.RENDER_MD_FILE,
  latest: process.env.RENDER_MD_LATEST === "1",
});

const ui = start({
  title: "Render MD",
  name: "view",
  body: (width, rows) => {
    const view = SCREENS[state.screen].body(width, rows - CHROME);
    if (!popup) return view;
    const caret = view.caret && { ...view.caret, row: view.caret.row + 1 };
    return { lines: [strip("markdown", width), ...view.lines], caret };
  },
  onKey: (chunk, key) => {
    const tab = popup && switchFor(key, "markdown");
    if (tab) {
      switchTo(tab, {
        cwd: state.cwd,
        workspace: process.env.RENDER_MD_WORKSPACE,
        pane: process.env.RENDER_MD_PANE,
      });
      return;
    }
    SCREENS[state.screen].key(chunk, key);
  },
  onEscape: () => {
    if (state.screen === "picker") state.screen = "file";
    else if (state.screen === "file" && state.search !== null)
      state.search = null;
    else if (state.screen === "file") back();
    else if (state.query) state.query = "";
    else ui.quit(0);
  },
  onMouse,
});

if (pane) {
  onRequest(pane, (request) => {
    show(request);
    ui.scheduleRender();
  });
}
