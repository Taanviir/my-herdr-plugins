"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

test("tests never reach the real Herdr, even from inside a Herdr pane", () => {
  process.env.HERDR_BIN_PATH = "/usr/bin/herdr";
  delete require.cache[require.resolve("../herdr")];
  const { BIN, run } = require("../herdr");
  assert.equal(BIN, "false");
  assert.equal(run(["tab", "create"], { check: false }).ok, false);
});
