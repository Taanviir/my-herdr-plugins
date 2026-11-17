# shared

The files every plugin in this repo uses: the Herdr CLI wrapper, the popup
loop, keys, text widths, the editor, the clipboard and the tab strip.

- Plugins require them by relative path, such as `../../shared/herdr`.
- Nothing in here may require a file from a plugin.
- A change here reaches all four plugins, so run every test: `npm test` at the
  repo root.
