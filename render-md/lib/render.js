"use strict";

// Markdown to terminal lines: headings, emphasis, code with colours, lists and
// task boxes, quotes and GitHub alerts, tables, links, rules and front matter.
// Inline HTML tags are dropped and their text kept. No images.

const { clusters, clusterWidth, displayWidth } = require("./shared/text");
const { highlight } = require("./highlight");

const BOLD = "1";
const DIM = "2";
const ITALIC = "3";
const UNDERLINE = "4";
const STRIKE = "9";
const ACCENT = "36";
const CODE = "33";
const LINK = "34";

const BULLETS = ["•", "◦", "▪"];
const ALERTS = {
  note: { title: "Note", color: "34" },
  tip: { title: "Tip", color: "32" },
  important: { title: "Important", color: "35" },
  warning: { title: "Warning", color: "33" },
  caution: { title: "Caution", color: "31" },
};

const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const TABLE_RULE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const HTML = /^ {0,3}<(\/?[a-zA-Z][\w-]*([\s/>]|$)|!--)/;
const ALERT = /^\[!(note|tip|important|warning|caution)\][ \t]*$/i;
const BLANK = /^[ \t]*$/;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// ---- inline ---------------------------------------------------------------

// A piece is a run of text and the SGR codes it carries.

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

// Where the code span opening at `at` closes: the next backtick run of the
// same length.
function codeSpanEnd(text, at) {
  const run = /^`+/.exec(text.slice(at))[0];
  const close = new RegExp(`(?<!\`)${run}(?!\`)`, "g");
  close.lastIndex = at + run.length;
  const found = close.exec(text);
  return found ? { run, end: found.index } : null;
}

// Where an emphasis run of `delim` opened before `from` closes. A run of three
// can close anything, giving up its last characters, so ***a*** and **a *b***
// work; a run of two never closes a single *.
function emphasisEnd(text, from, delim) {
  const char = delim[0];
  for (let at = from; at < text.length; at += 1) {
    if (text[at] === "\\") {
      at += 1;
      continue;
    }
    if (text[at] === "`") {
      const span = codeSpanEnd(text, at);
      if (span) at = span.end + span.run.length - 1;
      continue;
    }
    if (text[at] !== char) continue;
    let end = at;
    while (text[end] === char) end += 1;
    const length = end - at;
    const flanked = !/\s/.test(text[at - 1] ?? " ") && at > from;
    const inWord = char === "_" && /[\p{L}\p{N}]/u.test(text[end] ?? "");
    if (flanked && !inWord && (length === delim.length || length >= 3)) return end - delim.length;
    at = end - 1;
  }
  return -1;
}

// [label](url "title"), from the [ at `at`.
function linkAt(text, at) {
  let depth = 0;
  let close = -1;
  for (let i = at; i < text.length; i += 1) {
    if (text[i] === "\\") i += 1;
    else if (text[i] === "[") depth += 1;
    else if (text[i] === "]" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0 || text[close + 1] !== "(") return null;
  depth = 0;
  for (let i = close + 1; i < text.length; i += 1) {
    if (text[i] === "\\") i += 1;
    else if (text[i] === "(") depth += 1;
    else if (text[i] === ")" && --depth === 0) {
      const target = text.slice(close + 2, i).trim();
      const url = /^<([^>]*)>/.exec(target)?.[1] ?? target.split(/\s+/)[0] ?? "";
      return { label: text.slice(at + 1, close), url, end: i + 1 };
    }
  }
  return null;
}

const EMPHASIS = { "***": [BOLD, ITALIC], "**": [BOLD], "*": [ITALIC], "~~": [STRIKE] };

function inline(text, codes = []) {
  const out = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push({ text: decode(plain), codes });
    plain = "";
  };
  const add = (pieces) => {
    flush();
    out.push(...pieces);
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const rest = text.slice(i);
    let match;

    if (char === "\\" && /[!-/:-@[-`{-~]/.test(text[i + 1] ?? "")) {
      plain += text[i + 1];
      i += 2;
    } else if (char === "\n") {
      add([{ text: "\n", codes }]);
      i += 1;
    } else if (char === "`") {
      const span = codeSpanEnd(text, i);
      if (!span) {
        const run = /^`+/.exec(rest)[0];
        plain += run;
        i += run.length;
        continue;
      }
      let body = text.slice(i + span.run.length, span.end).replace(/\n/g, " ");
      if (/^ .*[^ ].* $/.test(body)) body = body.slice(1, -1);
      add([{ text: body, codes: [...codes, CODE] }]);
      i = span.end + span.run.length;
    } else if (char === "!" && text[i + 1] === "[" && (match = linkAt(text, i + 1))) {
      add([{ text: `[image: ${match.label || match.url}]`, codes: [...codes, DIM] }]);
      i = match.end;
    } else if (char === "[" && (match = linkAt(text, i))) {
      const label = inline(match.label, [...codes, LINK, UNDERLINE]);
      const shown = label.map((piece) => piece.text).join("");
      add(label);
      if (match.url && shown !== match.url && !match.url.startsWith("#")) {
        add([{ text: ` (${match.url})`, codes: [...codes, DIM] }]);
      }
      i = match.end;
    } else if (char === "<" && (match = /^<((?:https?|mailto):[^>\s]+|[^@>\s]+@[^>\s]+)>/.exec(rest))) {
      add([{ text: match[1], codes: [...codes, LINK, UNDERLINE] }]);
      i += match[0].length;
    } else if (char === "<" && /^<br\s*\/?>/i.test(rest)) {
      add([{ text: "\n", codes }]);
      i += /^<br\s*\/?>/i.exec(rest)[0].length;
    } else if (char === "<" && (match = /^<!--[\s\S]*?-->|^<\/?[a-zA-Z][\w-]*(\s[^>]*)?\/?>/.exec(rest))) {
      i += match[0].length;
    } else if (char === "h" && /[\s(]/.test(text[i - 1] ?? " ") && (match = /^https?:\/\/[^\s<>]+/.exec(rest))) {
      let url = match[0].replace(/[.,;:!?'"]+$/, "");
      if (url.endsWith(")") && !url.includes("(")) url = url.slice(0, -1);
      add([{ text: url, codes: [...codes, LINK, UNDERLINE] }]);
      i += url.length;
    } else if (char === "*" || char === "_" || (char === "~" && text[i + 1] === "~")) {
      const run = new RegExp(`^\\${char}+`).exec(rest)[0];
      const delim = char === "~" ? "~~" : run.slice(0, 3);
      const opens = run.length <= 3 && !/\s/.test(text[i + run.length] ?? " ") &&
        !(char === "_" && /[\p{L}\p{N}]/u.test(text[i - 1] ?? ""));
      const end = opens ? emphasisEnd(text, i + delim.length, delim) : -1;
      if (end < 0) {
        plain += run;
        i += run.length;
        continue;
      }
      add(inline(text.slice(i + delim.length, end), [...codes, ...EMPHASIS[char === "~" ? "~~" : "*".repeat(delim.length)]]));
      i = end + delim.length;
    } else {
      plain += char;
      i += 1;
    }
  }
  flush();
  return out;
}

// ---- wrapping and painting -----------------------------------------------

function words(pieces) {
  const out = [];
  let word = [];
  const end = () => {
    if (word.length) out.push({ word });
    word = [];
  };
  for (const piece of pieces) {
    if (piece.text === "\n") {
      end();
      out.push({ newline: true });
      continue;
    }
    for (const part of piece.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        end();
        out.push({ space: piece.codes });
      } else {
        word.push({ text: part, codes: piece.codes });
      }
    }
  }
  end();
  return out;
}

// Breaks at spaces. Only a word wider than the line is cut by cells.
function wrap(pieces, width) {
  const lines = [];
  let line = [];
  let used = 0;
  let space = null;
  const finish = () => {
    lines.push(line);
    line = [];
    used = 0;
    space = null;
  };

  for (const token of words(pieces)) {
    if (token.newline) {
      finish();
      continue;
    }
    if (token.space) {
      if (used > 0) space = token.space;
      continue;
    }
    const size = token.word.reduce((sum, piece) => sum + displayWidth(piece.text), 0);
    if (used > 0 && used + 1 + size > width) finish();
    if (space) {
      line.push({ text: " ", codes: space });
      used += 1;
      space = null;
    }
    if (used + size <= width) {
      line.push(...token.word);
      used += size;
      continue;
    }
    for (const piece of token.word) {
      for (const cluster of clusters(piece.text)) {
        const cells = clusterWidth(cluster);
        if (used > 0 && used + cells > width) finish();
        line.push({ text: cluster, codes: piece.codes });
        used += cells;
      }
    }
  }
  if (line.length || !lines.length) lines.push(line);
  return lines;
}

function painter(color) {
  const paint = (codes, text) => (color && codes.length && text ? `\x1b[${codes.join(";")}m${text}\x1b[0m` : text);
  paint.pieces = (pieces) => {
    let out = "";
    let run = "";
    let key = [];
    for (const piece of pieces) {
      if (piece.codes.join(";") !== key.join(";")) {
        out += paint(key, run);
        run = "";
        key = piece.codes;
      }
      run += piece.text;
    }
    return out + paint(key, run);
  };
  return paint;
}

// Cuts by cells, keeping every space: code and front matter are not prose.
function cut(pieces, width) {
  const lines = [];
  let line = [];
  let used = 0;
  for (const piece of pieces) {
    for (const cluster of clusters(piece.text)) {
      const cells = clusterWidth(cluster);
      if (used + cells > width && used > 0) {
        lines.push(line);
        line = [];
        used = 0;
      }
      line.push({ text: cluster, codes: piece.codes });
      used += cells;
    }
  }
  lines.push(line);
  return lines;
}

function align(text, width, how) {
  const gap = Math.max(0, width - displayWidth(text));
  if (how === "right") return " ".repeat(gap) + text;
  if (how === "center") return " ".repeat(Math.floor(gap / 2)) + text + " ".repeat(Math.ceil(gap / 2));
  return text + " ".repeat(gap);
}

// ---- blocks ---------------------------------------------------------------

const indentOf = (line) => /^ */.exec(line)[0].length;

function startsBlock(line) {
  if (FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line)) return true;
  const item = ITEM.exec(line);
  return Boolean(item && item[1].length < 4 && item[4] && (!/\d/.test(item[2]) || /^1[.)]$/.test(item[2])));
}

function splitRow(line) {
  const cells = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/);
  return cells.map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isTableStart(lines, i) {
  if (!lines[i].includes("|") || !TABLE_RULE.test(lines[i + 1] ?? "") || !lines[i + 1].includes("-")) return false;
  return splitRow(lines[i]).length === splitRow(lines[i + 1]).length;
}

function parseList(lines, start) {
  const first = ITEM.exec(lines[start]);
  const ordered = /\d/.test(first[2]);
  const base = first[1].length;
  const items = [];
  let loose = false;
  let gapBefore = false;
  let i = start;

  while (i < lines.length) {
    const marker = ITEM.exec(lines[i]);
    if (!marker || marker[1].length !== base || /\d/.test(marker[2]) !== ordered || RULE.test(lines[i])) break;
    if (gapBefore) loose = true;
    const spaces = marker[3] ?? "";
    const content = base + marker[2].length + (!marker[4] || spaces.length > 4 ? 1 : spaces.length);
    const body = [marker[4] ?? ""];
    i += 1;

    let blank = false;
    while (i < lines.length) {
      const line = lines[i];
      if (BLANK.test(line)) {
        body.push("");
        blank = true;
        i += 1;
        continue;
      }
      const indent = indentOf(line);
      if (indent > base) {
        body.push(line.slice(Math.min(indent, content)));
        blank = false;
        i += 1;
        continue;
      }
      if (blank || ITEM.test(line) || startsBlock(line) || isTableStart(lines, i)) break;
      body.push(line);
      i += 1;
    }

    let trailing = 0;
    while (body.length > 1 && body[body.length - 1] === "") {
      body.pop();
      trailing += 1;
    }
    gapBefore = trailing > 0;
    if (body.includes("")) loose = true;

    const task = /^\[([ xX])\](?:[ \t]+|$)/.exec(body[0]);
    if (task) body[0] = body[0].slice(task[0].length);
    items.push({ task: task ? task[1] !== " " : null, children: parseBlocks(body) });
  }

  const block = { type: "list", ordered, start: ordered ? Number(first[2].slice(0, -1)) : 1, items, loose };
  return { block, next: i };
}

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let match;

    if (BLANK.test(line)) {
      i += 1;
    } else if ((match = FENCE.exec(line))) {
      const [, indent, fence, lang] = match;
      const body = [];
      i += 1;
      while (i < lines.length) {
        const closing = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
        if (closing.test(lines[i])) {
          i += 1;
          break;
        }
        body.push(lines[i].slice(Math.min(indent.length, indentOf(lines[i]))));
        i += 1;
      }
      blocks.push({ type: "code", lang, lines: body });
    } else if ((match = HEADING.exec(line))) {
      blocks.push({ type: "heading", level: match[1].length, text: match[2] ?? "" });
      i += 1;
    } else if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
    } else if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && !BLANK.test(lines[i])) {
        if (QUOTE.test(lines[i])) body.push(lines[i].replace(QUOTE, ""));
        else if (startsBlock(lines[i])) break;
        else body.push(lines[i]);
        i += 1;
      }
      const alert = ALERT.exec(body[0] ?? "");
      if (alert) body.shift();
      blocks.push({ type: "quote", alert: alert?.[1].toLowerCase() ?? null, children: parseBlocks(body) });
    } else if ((match = ITEM.exec(line)) && match[1].length < 4) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
    } else if (isTableStart(lines, i)) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((cell) => {
        if (cell.startsWith(":") && cell.endsWith(":")) return "center";
        return cell.endsWith(":") ? "right" : "left";
      });
      const rows = [];
      i += 2;
      while (i < lines.length && !BLANK.test(lines[i]) && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", head, aligns, rows });
    } else if (indentOf(line) >= 4) {
      const body = [];
      while (i < lines.length && (BLANK.test(lines[i]) || indentOf(lines[i]) >= 4)) {
        body.push(lines[i].slice(4));
        i += 1;
      }
      while (body.length && BLANK.test(body[body.length - 1])) body.pop();
      blocks.push({ type: "code", lang: "", lines: body });
    } else if (HTML.test(line)) {
      const body = [];
      while (i < lines.length && !BLANK.test(lines[i])) body.push(lines[i++]);
      blocks.push({ type: "html", text: body.join("\n") });
    } else {
      const body = [line];
      i += 1;
      let level = 0;
      while (i < lines.length && !BLANK.test(lines[i])) {
        const setext = SETEXT.exec(lines[i]);
        if (setext) {
          level = setext[1][0] === "=" ? 1 : 2;
          i += 1;
          break;
        }
        if (startsBlock(lines[i]) || isTableStart(lines, i)) break;
        body.push(lines[i]);
        i += 1;
      }
      const text = body.map((part, k) => {
        const last = k === body.length - 1;
        const hard = !last && / {2,}$|\\$/.test(part);
        const trimmed = part.trim().replace(/\\$/, last ? "\\" : "");
        return last ? trimmed : `${trimmed}${hard ? "\n" : " "}`;
      }).join("");
      blocks.push(level ? { type: "heading", level, text } : { type: "paragraph", text });
    }
  }
  return blocks;
}

// ---- rendering ------------------------------------------------------------

// `headings`, when given, collects where each heading starts.
function renderBlocks(blocks, width, ctx, tight = false, headings = null) {
  const out = [];
  for (const block of blocks) {
    const lines = renderBlock(block, width, ctx);
    if (!lines.length) continue;
    if (out.length && !tight) out.push("");
    if (headings && block.type === "heading") {
      headings.push({ line: out.length, level: block.level, text: inline(block.text).map((piece) => piece.text).join("") });
    }
    out.push(...lines);
  }
  return out;
}

function renderBlock(block, width, ctx) {
  const { paint } = ctx;
  const prose = (text, codes = []) => wrap(inline(text, codes), width).map(paint.pieces);

  switch (block.type) {
    case "heading": {
      const codes = [[BOLD, ACCENT], [BOLD, ACCENT], [BOLD], [BOLD, ITALIC], [BOLD, ITALIC], [BOLD, ITALIC]][block.level - 1];
      const lines = prose(block.text, codes);
      if (block.level === 1) lines.push(paint([DIM, ACCENT], "━".repeat(width)));
      if (block.level === 2) lines.push(paint([DIM], "─".repeat(width)));
      return lines;
    }
    case "paragraph":
      return prose(block.text);
    case "html": {
      const text = block.text.replace(/<!--[\s\S]*?(-->|$)/g, "");
      return text.trim() ? prose(text).filter((line) => line.trim()) : [];
    }
    case "rule":
      return [paint([DIM], "─".repeat(width))];
    case "code": {
      const bar = paint([DIM], "│ ");
      const lines = block.lang ? [paint([DIM], `  ${block.lang}`)] : [];
      for (const pieces of highlight(block.lines.length ? block.lines : [""], block.lang)) {
        for (const part of cut(pieces, Math.max(1, width - 2))) lines.push(`${bar}${paint.pieces(part)}`);
      }
      return lines;
    }
    case "quote": {
      const alert = ALERTS[block.alert];
      const codes = alert ? [alert.color] : [DIM];
      const inner = renderBlocks(block.children, Math.max(1, width - 2), ctx);
      if (alert) inner.unshift(paint([BOLD, alert.color], alert.title));
      return inner.map((line) => `${paint(codes, "│")} ${line}`);
    }
    case "list":
      return renderList(block, width, ctx);
    case "table":
      return renderTable(block, width, ctx);
    case "front":
      return [...block.lines.flatMap((line) => cut([{ text: line, codes: [DIM] }], width).map(paint.pieces)), paint([DIM], "─".repeat(width))];
    default:
      return [];
  }
}

function renderList(block, width, ctx) {
  const { paint } = ctx;
  const markers = block.items.map((item, k) => {
    if (item.task !== null) return item.task ? paint(["32"], "[✓]") : paint([DIM], "[ ]");
    if (block.ordered) return paint([ACCENT], `${block.start + k}.`);
    return paint([ACCENT], BULLETS[ctx.depth % BULLETS.length]);
  });
  // Numbers line up on the right; bullets and task boxes keep their own width.
  const numbered = (item) => block.ordered && item.task === null;
  const numbers = Math.max(0, ...markers.filter((_, k) => numbered(block.items[k])).map(displayWidth));
  const out = [];

  block.items.forEach((item, k) => {
    if (k > 0 && block.loose) out.push("");
    const size = numbered(item) ? numbers : displayWidth(markers[k]);
    const lines = renderBlocks(item.children, Math.max(1, width - size - 1), { ...ctx, depth: ctx.depth + 1 }, !block.loose);
    const marker = align(markers[k], size, "right");
    out.push(`${marker} ${lines[0] ?? ""}`.trimEnd());
    for (const line of lines.slice(1)) out.push(line ? `${" ".repeat(size + 1)}${line}` : "");
  });
  return out;
}

// Columns get their natural width when it fits, and otherwise share what
// there is, narrow ones first.
function columnWidths(natural, room) {
  if (natural.reduce((sum, n) => sum + n, 0) <= room) return natural;
  const widths = natural.map(() => 0);
  let left = room;
  let open = natural.map((_, k) => k);
  while (open.length) {
    const share = Math.max(1, Math.floor(left / open.length));
    const settled = open.filter((k) => natural[k] <= share);
    if (!settled.length) {
      open.forEach((k, n) => {
        widths[k] = share + (n < left - share * open.length ? 1 : 0);
      });
      break;
    }
    for (const k of settled) {
      widths[k] = natural[k];
      left -= natural[k];
    }
    open = open.filter((k) => !settled.includes(k));
  }
  return widths.map((w) => Math.max(1, w));
}

function renderTable(block, width, ctx) {
  const { paint } = ctx;
  const count = block.head.length;
  const rows = [block.head, ...block.rows].map((row, r) =>
    Array.from({ length: count }, (_, k) => inline(row[k] ?? "", r === 0 ? [BOLD] : [])));
  const natural = Array.from({ length: count }, (_, k) =>
    Math.max(1, ...rows.map((row) => row[k].reduce((sum, piece) => sum + displayWidth(piece.text), 0))));
  const widths = columnWidths(natural, Math.max(count, width - (count * 3 + 1)));

  const border = (left, middle, right) => paint([DIM], left + widths.map((w) => "─".repeat(w + 2)).join(middle) + right);
  const bar = paint([DIM], "│");
  const out = [border("┌", "┬", "┐")];
  rows.forEach((row, r) => {
    const cells = row.map((pieces, k) => wrap(pieces, widths[k]).map(paint.pieces));
    const height = Math.max(...cells.map((lines) => lines.length));
    for (let line = 0; line < height; line += 1) {
      const parts = cells.map((lines, k) => align(lines[line] ?? "", widths[k], r === 0 ? "left" : block.aligns[k]));
      out.push(`${bar} ${parts.join(` ${bar} `)} ${bar}`);
    }
    if (r === 0) out.push(border("├", "┼", "┤"));
  });
  out.push(border("└", "┴", "┘"));
  return out;
}

// ---- entry ----------------------------------------------------------------

function parse(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  if (lines[0] === "---") {
    const end = lines.findIndex((line, k) => k > 0 && (line === "---" || line === "..."));
    if (end > 0) return [{ type: "front", lines: lines.slice(1, end) }, ...parseBlocks(lines.slice(end + 1))];
  }
  return parseBlocks(lines);
}

// The lines, and where each top-level heading starts among them.
function layout(markdown, width, { color = !process.env.NO_COLOR } = {}) {
  const headings = [];
  const lines = renderBlocks(parse(markdown), Math.max(10, width), { paint: painter(color), depth: 0 }, false, headings);
  return { lines, headings };
}

const render = (markdown, width, options) => layout(markdown, width, options).lines;

module.exports = { render, layout, parse, inline };
