"use strict";

// Colours for code blocks: keywords, strings, comments, numbers and keys, for
// the languages agents write most. A language it does not know stays plain.

const KEYWORD = "35";
const STRING = "32";
const COMMENT = "2";
const NUMBER = "33";
const KEY = "36";

const words = (text) => new Set(text.split(/\s+/));

const C_LIKE = { line: "//", block: ["/*", "*/"], quotes: "\"'" };

const LANGS = {
  js: {
    ...C_LIKE,
    quotes: "\"'`",
    keywords: words(`as async await break case catch class const continue debugger default delete do else enum export
      extends false finally for from function if implements import in instanceof interface let new null of private
      protected public readonly return satisfies static super switch this throw true try type typeof undefined var void
      while yield`),
  },
  python: {
    line: "#",
    quotes: "\"'",
    keywords: words(`and as assert async await break case class continue def del elif else except False finally for
      from global if import in is lambda match None nonlocal not or pass raise return self True try while with yield`),
  },
  sh: {
    line: "#",
    quotes: "\"'",
    keywords: words(`case do done elif else esac exit export fi for function if in local return set source then unset
      until while`),
  },
  go: {
    ...C_LIKE,
    quotes: "\"'`",
    keywords: words(`break case chan const continue default defer else fallthrough false for func go goto if import
      interface map nil package range return select struct switch true type var`),
  },
  rust: {
    ...C_LIKE,
    keywords: words(`as async await break const continue crate dyn else enum Err extern false fn for if impl in let loop
      match mod move mut None Ok pub ref return self Self Some static struct super trait true type unsafe use where
      while`),
  },
  c: {
    ...C_LIKE,
    keywords: words(`abstract auto bool break case catch char class const continue default delete do double else enum
      extends extern false final finally float for fun if implements import int interface long namespace new null
      nullptr override package private protected public return short sizeof static struct super switch template this
      throw throws true try typedef typename union unsigned using val var virtual void volatile when while`),
  },
  sql: {
    line: "--",
    block: ["/*", "*/"],
    quotes: "'\"",
    caseless: true,
    keywords: words(`add all alter and as asc by create default delete desc distinct drop exists from group having in
      index inner insert into is join key left like limit not null on or order outer primary references right select
      set table union update values where with`),
  },
  json: { ...C_LIKE, quotes: "\"", keys: true, keywords: words("true false null") },
  yaml: { line: "#", quotes: "\"'", keys: true, keywords: words("true false null yes no on off") },
  toml: { line: "#", quotes: "\"'", keys: true, keywords: words("true false") },
  css: { block: ["/*", "*/"], quotes: "\"'", keywords: words("important") },
  diff: { diff: true },
};

const ALIASES = {
  javascript: "js", jsx: "js", mjs: "js", cjs: "js", ts: "js", typescript: "js", tsx: "js",
  py: "python", python3: "python",
  bash: "sh", zsh: "sh", shell: "sh", console: "sh", shellscript: "sh", fish: "sh",
  golang: "go", rs: "rust",
  cpp: "c", "c++": "c", h: "c", hpp: "c", cc: "c", java: "c", cs: "c", csharp: "c", kotlin: "c", kt: "c",
  swift: "c", php: "c", scala: "c", dart: "c",
  jsonc: "json", json5: "json", yml: "yaml", scss: "css", less: "css", patch: "diff", postgres: "sql",
};

function language(name) {
  const key = String(name ?? "").toLowerCase();
  return LANGS[ALIASES[key] ?? key] ?? null;
}

function diffLine(line) {
  if (/^(\+\+\+|---) /.test(line)) return [{ text: line, codes: ["1"] }];
  if (line.startsWith("+")) return [{ text: line, codes: ["32"] }];
  if (line.startsWith("-")) return [{ text: line, codes: ["31"] }];
  if (line.startsWith("@@")) return [{ text: line, codes: ["36"] }];
  return [{ text: line, codes: [] }];
}

// One piece list per line. Block comments carry over from line to line.
function highlight(lines, lang) {
  const spec = language(lang);
  if (!spec) return lines.map((line) => [{ text: line, codes: [] }]);
  if (spec.diff) return lines.map(diffLine);

  let inBlock = false;
  return lines.map((line) => {
    const pieces = [];
    let plain = "";
    const push = (text, codes) => {
      if (plain) pieces.push({ text: plain, codes: [] });
      plain = "";
      if (text) pieces.push({ text, codes });
    };

    let i = 0;
    if (inBlock) {
      const end = line.indexOf(spec.block[1]);
      if (end < 0) return [{ text: line, codes: [COMMENT] }];
      push(line.slice(0, end + spec.block[1].length), [COMMENT]);
      i = end + spec.block[1].length;
      inBlock = false;
    }

    while (i < line.length) {
      const rest = line.slice(i);
      const before = line[i - 1] ?? " ";
      let match;
      if (spec.line && rest.startsWith(spec.line) && (spec.line !== "#" || /\s/.test(before))) {
        push(rest, [COMMENT]);
        break;
      }
      if (spec.block && rest.startsWith(spec.block[0])) {
        const end = line.indexOf(spec.block[1], i + spec.block[0].length);
        if (end < 0) {
          push(rest, [COMMENT]);
          inBlock = true;
          break;
        }
        push(line.slice(i, end + spec.block[1].length), [COMMENT]);
        i = end + spec.block[1].length;
        continue;
      }
      if (spec.quotes.includes(line[i])) {
        let end = i + 1;
        while (end < line.length && line[end] !== line[i]) end += line[end] === "\\" ? 2 : 1;
        const text = line.slice(i, end + 1);
        const isKey = spec.keys && /^\s*:/.test(line.slice(end + 1));
        push(text, [isKey ? KEY : STRING]);
        i = end + 1;
        continue;
      }
      if (/[\w$]/.test(before) === false && (match = /^\d[\w.]*/.exec(rest))) {
        push(match[0], [NUMBER]);
        i += match[0].length;
        continue;
      }
      if ((match = /^[A-Za-z_$][\w$-]*/.exec(rest)) && !/[\w$]/.test(before)) {
        const word = spec.keys ? match[0] : match[0].replace(/-.*/, "");
        const isKey = spec.keys && /^\s*[:=]/.test(line.slice(i + word.length)) && /^\s*(- )?$/.test(line.slice(0, i));
        const known = spec.keywords?.has(spec.caseless ? word.toLowerCase() : word);
        if (isKey) push(word, [KEY]);
        else if (known) push(word, [KEYWORD]);
        else plain += word;
        i += word.length;
        continue;
      }
      plain += line[i];
      i += 1;
    }
    push("", []);
    return pieces;
  });
}

module.exports = { highlight, language };
