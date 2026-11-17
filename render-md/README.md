# Render MD

A [Herdr](https://herdr.dev) plugin for reading markdown in a pane beside your
agent. Open a plan, a README or an ADR and read it rendered, not as raw text.
The pane follows the file, so you can watch an agent write a plan as it goes.

- Opens in a split to the right of the pane you were in, on the newest
  markdown file in that repo (or folder): usually the plan an agent is writing.
- Pressing the key again reuses that pane instead of opening another.
- `q` goes to a list of the repo's markdown files, newest first. Type to filter.
- Renders headings, bold, italic, inline code, links, lists, task boxes,
  quotes, GitHub alerts, tables, rules, front matter, and code blocks with
  colours for common languages and diffs.
- Jump between headings, or pick one from an outline. Scroll with the wheel.
- Also a **Markdown** tab in the popup strip shared with Quick Prompt,
  Scratchpad and Projects (`alt+←→`).
- `mdr` opens a file from the shell, or prints it rendered with `--print`.
- No dependencies, no build step. Node 18 or newer.

## Install

```bash
herdr plugin install Taanviir/herdr-render-md
herdr plugin action invoke taanviir.render-md.setup
```

Setup binds **ctrl+b** then **m** in your `config.toml`, and links `mdr` into
`~/.local/bin`. Set `RENDER_MD_KEY` first to use another key, and
`RENDER_MD_BIN_DIR` to link `mdr` somewhere else. A key that is already bound
is left alone.

## The pane

**The list.** Type to filter by path, `↑` `↓` to move, `⏎` to open, `esc` to
clear the filter or close. Click a file to select it, click again to open.

**A file.**

| Key | Does |
| --- | --- |
| `j` `k` `↑` `↓` | scroll a line |
| `space` `f` / `b` | page down / up |
| `d` / `u` | half a page down / up |
| `g` / `G` | top / end |
| `[` / `]` | previous / next heading |
| `o` | outline: pick a heading with `↑` `↓` and `⏎` |
| `/` then `n` `N` | find, next, previous |
| `e` | edit in `$VISUAL`, `$EDITOR` or nvim; the view reloads after |
| `r` | reload |
| `q` `esc` | back to the list |

The file is checked for changes twice a second. If you are at the end when it
grows, the view stays at the end.

## mdr

```bash
mdr                      # list this folder's markdown files in the viewer
mdr --latest             # show the newest one
mdr PLAN.md              # show PLAN.md
mdr --print README.md    # print it rendered, in or out of Herdr
cat notes.md | mdr -p -  # from stdin
```

`--width N` sets the wrap width for `--print`. Colour is off when the output is
not a terminal, or when `NO_COLOR` is set.

## Not supported

Images, footnotes, reference-style links and Obsidian syntax such as
`[[wikilinks]]`. Inline HTML tags are dropped and their text kept. Code colours
cover keywords, strings, comments, numbers and keys only.

The viewer takes mouse input for the wheel, so selecting text in it may need
shift held.

## Development

```bash
herdr plugin link .
node --test
```

`lib/shared` is synced from herdr-quick-prompt; edit it there.
