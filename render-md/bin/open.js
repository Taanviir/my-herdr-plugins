"use strict";

// Action entrypoint: show the newest markdown file of the focused pane's
// folder in the viewer beside it.

const { context } = require("../lib/shared/term");
const { show } = require("../lib/pane");

const ctx = context();
const res = show({
  cwd: ctx.focused_pane_cwd ?? ctx.workspace_cwd ?? process.env.HOME,
  pane: ctx.focused_pane_id ?? process.env.HERDR_PANE_ID,
  latest: true,
});
if (!res.ok) {
  process.stderr.write(`${res.message}\n`);
  process.exit(1);
}
