# my-herdr-plugins

Plugins for [Herdr](https://herdr.dev), the terminal multiplexer for coding
agents. Each folder is a plugin you install on its own.

| Plugin | What it does | Install |
| --- | --- | --- |
| [Quick Prompt](quick-prompt) | Pick an agent, type a prompt, launch it in a new tab, split or worktree | `herdr plugin install Taanviir/my-herdr-plugins/quick-prompt` |
| [Scratchpad](scratchpad) | A global scratchpad for ideas and notes, linked to folders, that agents can read | `herdr plugin install Taanviir/my-herdr-plugins/scratchpad` |
| [Projects](projects) | Your projects, their past Claude or Codex sessions, and any dev server running in them | `herdr plugin install Taanviir/my-herdr-plugins/projects` |
| [Render MD](render-md) | Markdown rendered in a pane beside your agent, live as it changes | `herdr plugin install Taanviir/my-herdr-plugins/render-md` |

Each plugin's README covers its setup action and keys. Their popups share a
tab strip: `alt+←` and `alt+→` move between Prompt, Notes, Projects and
Markdown.

No dependencies and no build step. Node 18 or newer.

## Working on them

```bash
git clone https://github.com/Taanviir/my-herdr-plugins
cd my-herdr-plugins
herdr plugin link render-md   # or any plugin folder; edits apply on the next run
npm test                      # every plugin, and shared/
```

`shared/` holds what all four use: the Herdr CLI wrapper, the popup loop, keys,
text widths and the tab strip. Under `node --test` the Herdr wrapper never
reaches your running Herdr, so the tests are safe to run from inside it.

Updates follow `main`: `herdr plugin update` picks up any new commit. A version
bump in a plugin's `herdr-plugin.toml` and `package.json` also makes a GitHub
release for it, tagged like `render-md-v0.3.0`.
