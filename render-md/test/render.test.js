"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { render, inline } = require("../lib/render");

const plain = (markdown, width = 40) => render(markdown, width, { color: false });
const styled = (text) => inline(text).map((piece) => [piece.text, piece.codes.join(";")]);

test("emphasis, code and strikethrough carry their styles", () => {
  assert.deepEqual(styled("a **b** *c* ***d*** `e` ~~f~~"), [
    ["a ", ""], ["b", "1"], [" ", ""], ["c", "3"], [" ", ""], ["d", "1;3"], [" ", ""], ["e", "33"], [" ", ""], ["f", "9"],
  ]);
});

test("emphasis nests, and a strong run does not close a single star", () => {
  assert.deepEqual(styled("**a *b***"), [["a ", "1"], ["b", "1;3"]]);
  assert.deepEqual(styled("*a **b** c*"), [["a ", "3"], ["b", "3;1"], [" c", "3"]]);
});

test("underscores inside words stay literal", () => {
  assert.deepEqual(styled("snake_case_name and _it_"), [["snake_case_name and ", ""], ["it", "3"]]);
});

test("code spans keep what is inside them", () => {
  assert.deepEqual(styled("`**not bold**` and ``a ` b``"), [["**not bold**", "33"], [" and ", ""], ["a ` b", "33"]]);
});

test("links show their target unless it is the text or an anchor", () => {
  assert.deepEqual(plain("[docs](https://x.dev) [https://y.dev](https://y.dev) [top](#top)"), ["docs (https://x.dev) https://y.dev top"]);
});

test("escapes, entities and inline tags", () => {
  assert.deepEqual(plain("\\*not\\* &amp; <kbd>Ctrl</kbd>"), ["*not* & Ctrl"]);
});

test("paragraphs wrap at spaces and break on two trailing spaces", () => {
  assert.deepEqual(plain("one two three four five  \nsix", 14), ["one two three", "four five", "six"]);
});

test("a word wider than the line is cut", () => {
  assert.deepEqual(plain("abcdefghijklmnop", 10), ["abcdefghij", "klmnop"]);
});

test("headings, with rules under the first two levels", () => {
  assert.deepEqual(plain("# One\n## Two\n### Three\nSetext\n---", 10), [
    "One", "━━━━━━━━━━", "", "Two", "──────────", "", "Three", "", "Setext", "──────────",
  ]);
});

test("nested lists, numbers aligned on the right, task boxes", () => {
  const md = "- a\n  - b\n    - c\n- [ ] todo\n- [x] done\n\n9. nine\n10. ten";
  assert.deepEqual(plain(md), ["• a", "  ◦ b", "    ▪ c", "[ ] todo", "[✓] done", "", " 9. nine", "10. ten"]);
});

test("list items wrap under their text and take lazy lines", () => {
  assert.deepEqual(plain("- a long item that wraps\nlazily continued", 16), ["• a long item", "  that wraps", "  lazily", "  continued"]);
});

test("a loose list keeps a blank line between items", () => {
  assert.deepEqual(plain("- a\n\n- b"), ["• a", "", "• b"]);
});

test("quotes and alerts", () => {
  assert.deepEqual(plain("> quoted\n> text\n\n> [!TIP]\n> try this"), ["│ quoted text", "", "│ Tip", "│ try this"]);
});

test("fenced and indented code keep their lines", () => {
  assert.deepEqual(plain("```js\n  if (x) {\n```\n\n    indented"), ["  js", "│   if (x) {", "", "│ indented"]);
});

test("tables align their columns and wrap cells to fit", () => {
  const md = "| a | b |\n| :- | -: |\n| x | 10 |\n| long text here | 2 |";
  assert.deepEqual(plain(md, 18), [
    "┌───────────┬────┐",
    "│ a         │ b  │",
    "├───────────┼────┤",
    "│ x         │ 10 │",
    "│ long text │  2 │",
    "│ here      │    │",
    "└───────────┴────┘",
  ]);
});

test("front matter is shown dim above a rule, and HTML comments vanish", () => {
  assert.deepEqual(plain("---\ntitle: x\n---\n<!-- hidden -->\n\ntext", 10), ["title: x", "──────────", "", "text"]);
});

test("colour codes only when asked", () => {
  assert.equal(render("**b**", 10, { color: true })[0], "\x1b[1mb\x1b[0m");
  assert.equal(render("**b**", 10, { color: false })[0], "b");
});

test("layout says where each top-level heading starts", () => {
  const { lines, headings } = require("../lib/render").layout("# One\n\ntext\n\n## Two `x`\n\n- # not top level", 20, { color: false });
  assert.deepEqual(headings, [{ line: 0, level: 1, text: "One" }, { line: 5, level: 2, text: "Two x" }]);
  assert.equal(lines[5], "Two x");
});

test("code blocks are coloured by language, and cut without losing spaces", () => {
  const out = render("```py\ndef f():  # c\n```\n\n```\ndef f():\n```", 40, { color: true });
  assert.deepEqual(out, ["\x1b[2m  py\x1b[0m", "\x1b[2m│ \x1b[0m\x1b[35mdef\x1b[0m f():  \x1b[2m# c\x1b[0m", "", "\x1b[2m│ \x1b[0mdef f():"]);
  assert.deepEqual(plain("```\nabcdef  gh\n```", 10), ["│ abcdef  ", "│ gh"]);
});
