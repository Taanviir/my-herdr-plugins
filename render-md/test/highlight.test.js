"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { highlight } = require("../lib/highlight");

const marked = (lines, lang) => highlight(lines, lang).map((line) => line.map((p) => (p.codes.length ? `<${p.codes}>${p.text}` : p.text)).join(""));

test("keywords, strings, numbers and comments", () => {
  assert.deepEqual(marked(['const x = "a" + 42; // c'], "ts"), ['<35>const x = <32>"a" + <33>42; <2>// c']);
});

test("block comments carry over to the next line", () => {
  assert.deepEqual(marked(["a /* b", "c */ return"], "js"), ["a <2>/* b", "<2>c */ <35>return"]);
});

test("a # only starts a comment after a space", () => {
  assert.deepEqual(marked(["echo $# x # c"], "bash"), ["echo $# x <2># c"]);
});

test("keys in yaml and json", () => {
  assert.deepEqual(marked(["runs-on: x", '  - name: "y"'], "yml"), ["<36>runs-on: x", '  - <36>name: <32>"y"']);
  assert.deepEqual(marked(['{"a": true}'], "json"), ['{<36>"a": <35>true}']);
});

test("diff lines by their first character", () => {
  assert.deepEqual(marked(["+new", "-old", "@@ 1 @@", " same"], "diff"), ["<32>+new", "<31>-old", "<36>@@ 1 @@", " same"]);
});

test("an unknown language stays plain", () => {
  assert.deepEqual(marked(["const x"], "brainfuck"), ["const x"]);
});
