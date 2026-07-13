# Six Shooter

A Chrome extension that holds you to six open tabs. Open a seventh and one of the other six —
picked at random — takes a bullet.

Named for the revolver. Six chambers, and you do not get to pick which one comes up.

Take it for a spin...

## Install

1. Visit `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select this folder

## The rules

**The tab you just opened always survives.** The bullet only ever finds one of the six that were
already there. This holds even when two tabs open in the same instant — anything opened within the
last 1.5 seconds is spared and faces its own draw instead.

**One trigger pull per tab opened.** Opening one tab kills at most one tab. If you install this
with twenty tabs already open, it thins them out one per new tab rather than staging a massacre.

**Scope** decides what counts as one revolver:

- *Per window* (default) — each window has its own six chambers. Opening a new window is a way out.
- *All windows* — six tabs across the whole browser. No escape hatch.

**Immunity** comes in two flavours, and the difference matters:

- *Pinned tabs* sit **outside** the cylinder. They can't be shot, and they don't occupy a chamber.
  This is deliberate: if immune tabs still filled chambers, six pinned tabs would put you over the
  limit with nothing left to kill, and the extension would jam.
- *Tabs playing audio* and *the active tab* **do** occupy a chamber. They just can't be the one that
  dies.

If a full cylinder turns out to be nothing but immune tabs, nobody dies and you go over the limit.
Immunity beats the six.

Session restore is exempt. Chrome replays a tab-created event for every tab it reopens at launch,
so there's a five-second grace period — otherwise "continue where you left off" would be a bloodbath.

## Settings

Click the toolbar icon for the cylinder and a safety switch; **Settings** opens the full page.
Everything above is configurable, including the chamber count, if six offends you.

## Development

```sh
npm test          # drives background.js against a fake chrome API
npm run icons     # regenerates icons/ from tools/make_icons.py (no dependencies)
```

The tab-selection rules live in `settings.js` so the popup's chamber count and the background
worker's kill logic can't drift apart. `tests/background.test.mjs` fires real `onCreated` events at
the real listeners and asserts on which tabs actually get removed.

## License

Copyright (C) 2026 Brian Muenzenmeyer.

Six Shooter is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. See [LICENSE](LICENSE) for the full text.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
