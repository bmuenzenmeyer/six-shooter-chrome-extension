/**
 * Drives background.js against a fake chrome API. Exercises the real listeners:
 * we fire onCreated and assert on which tabs actually get removed.
 */
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULTS = {
  enabled: true,
  chambers: 6,
  scope: 'window',
  immunePinned: true,
  immuneAudible: true,
  immuneActive: false,
  notify: true,
};

let listeners;
let tabs;
let removed;
let notified;

function makeChrome(settings = {}, session = {}) {
  const sync = { ...DEFAULTS, ...settings };
  return {
    runtime: {
      getURL: (p) => `chrome-extension://x/${p}`,
      onStartup: { addListener: (f) => listeners.startup.push(f) },
      onInstalled: { addListener: (f) => listeners.installed.push(f) },
    },
    storage: {
      sync: { get: async (defs) => ({ ...defs, ...sync }), set: async (p) => Object.assign(sync, p) },
      session: {
        get: async (k) => (k in session ? { [k]: session[k] } : {}),
        set: async (p) => Object.assign(session, p),
      },
    },
    tabs: {
      onCreated: { addListener: (f) => listeners.created.push(f) },
      onAttached: { addListener: (f) => listeners.attached.push(f) },
      onRemoved: { addListener: (f) => listeners.removed.push(f) },
      query: async (q) => tabs.filter((t) => (q.windowId === undefined ? true : t.windowId === q.windowId)),
      get: async (id) => {
        const t = tabs.find((x) => x.id === id);
        if (!t) throw new Error('no tab');
        return t;
      },
      remove: async (id) => {
        const i = tabs.findIndex((x) => x.id === id);
        if (i === -1) throw new Error('no tab');
        removed.push(tabs[i].id);
        tabs.splice(i, 1);
        for (const f of listeners.removed) f(id, { windowId: 1, isWindowClosing: false });
      },
    },
    notifications: { create: async (o) => notified.push(o) },
  };
}

const tab = (id, extra = {}) => ({
  id,
  windowId: 1,
  title: `tab${id}`,
  pinned: false,
  audible: false,
  active: false,
  ...extra,
});

/** Fresh module instance each test so the enqueue chain / listeners don't leak. */
async function setup(settings, session, startTabs) {
  listeners = { startup: [], installed: [], created: [], attached: [], removed: [] };
  removed = [];
  notified = [];
  tabs = startTabs;
  globalThis.chrome = makeChrome(settings, session);
  await import(`file://${ROOT}/background.js?bust=${Math.random()}`);
}

async function fireCreated(t) {
  tabs.push(t);
  for (const f of listeners.created) f(t);
  await sleep(450); // clear SETTLE_MS plus the async chain
}

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(['pass', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
  }
}

// ---------------------------------------------------------------------------

await test('7th tab kills exactly one of the original six, never itself', async () => {
  for (let i = 0; i < 20; i += 1) {
    await setup({}, {}, [1, 2, 3, 4, 5, 6].map((n) => tab(n)));
    await fireCreated(tab(7));
    assert.equal(removed.length, 1, 'exactly one death');
    assert.notEqual(removed[0], 7, 'the new tab must survive');
    assert.ok(removed[0] >= 1 && removed[0] <= 6);
    assert.equal(tabs.length, 6, 'back to six');
  }
});

await test('randomness actually spreads across all six victims', async () => {
  const seen = new Set();
  for (let i = 0; i < 60; i += 1) {
    await setup({}, {}, [1, 2, 3, 4, 5, 6].map((n) => tab(n)));
    await fireCreated(tab(7));
    seen.add(removed[0]);
  }
  assert.equal(seen.size, 6, `every tab should be reachable, saw ${[...seen]}`);
});

await test('under the limit, nobody dies', async () => {
  await setup({}, {}, [1, 2, 3].map((n) => tab(n)));
  await fireCreated(tab(4));
  assert.equal(removed.length, 0);
});

await test('pinned tabs neither fill a chamber nor get shot', async () => {
  // 3 pinned + 6 normal = 9 tabs, but only 6 count. Opening a 7th normal tab
  // pushes counted to 7, so exactly one *normal* tab dies.
  await setup({}, {}, [
    ...[1, 2, 3].map((n) => tab(n, { pinned: true })),
    ...[4, 5, 6, 7, 8, 9].map((n) => tab(n)),
  ]);
  await fireCreated(tab(10));
  assert.equal(removed.length, 1);
  assert.ok(removed[0] >= 4 && removed[0] <= 9, 'a pinned tab was shot');
});

await test('six pinned tabs do not jam the extension', async () => {
  await setup({}, {}, [1, 2, 3, 4, 5, 6].map((n) => tab(n, { pinned: true })));
  await fireCreated(tab(7));
  assert.equal(removed.length, 0, 'pinned are free; 1 counted tab is under the limit');
  assert.equal(tabs.length, 7);
});

await test('audible tabs fill a chamber but are spared', async () => {
  await setup({}, {}, [
    tab(1, { audible: true }),
    ...[2, 3, 4, 5, 6].map((n) => tab(n)),
  ]);
  for (let i = 0; i < 15; i += 1) {
    await setup({}, {}, [tab(1, { audible: true }), ...[2, 3, 4, 5, 6].map((n) => tab(n))]);
    await fireCreated(tab(7));
    assert.equal(removed.length, 1);
    assert.notEqual(removed[0], 1, 'shot the tab playing audio');
  }
});

await test('when every tab is immune, fail open instead of killing', async () => {
  await setup({}, {}, [1, 2, 3, 4, 5, 6].map((n) => tab(n, { audible: true })));
  await fireCreated(tab(7));
  assert.equal(removed.length, 0, 'nothing should die');
  assert.equal(tabs.length, 7, 'we go over the limit rather than break immunity');
});

await test('active-tab immunity spares the foreground tab', async () => {
  for (let i = 0; i < 20; i += 1) {
    await setup({ immuneActive: true }, {}, [
      tab(1, { active: true }),
      ...[2, 3, 4, 5, 6].map((n) => tab(n)),
    ]);
    await fireCreated(tab(7, { active: false }));
    assert.equal(removed.length, 1);
    assert.notEqual(removed[0], 1);
  }
});

await test('safety on: disabled kills nothing', async () => {
  await setup({ enabled: false }, {}, [1, 2, 3, 4, 5, 6].map((n) => tab(n)));
  await fireCreated(tab(7));
  assert.equal(removed.length, 0);
});

await test('startup grace: session restore does not massacre tabs', async () => {
  await setup({}, { startupAt: Date.now() }, [1, 2, 3, 4, 5, 6].map((n) => tab(n)));
  await fireCreated(tab(7));
  await fireCreated(tab(8));
  assert.equal(removed.length, 0, 'restored tabs must be left alone');
});

await test('per-window scope ignores tabs in other windows', async () => {
  await setup({ scope: 'window' }, {}, [
    ...[1, 2, 3].map((n) => tab(n, { windowId: 1 })),
    ...[4, 5, 6, 7, 8, 9].map((n) => tab(n, { windowId: 2 })),
  ]);
  await fireCreated(tab(10, { windowId: 1 })); // window 1 now has 4 tabs
  assert.equal(removed.length, 0, 'window 2 being full is not window 1s problem');
});

await test('global scope counts across all windows', async () => {
  await setup({ scope: 'global' }, {}, [
    ...[1, 2, 3].map((n) => tab(n, { windowId: 1 })),
    ...[4, 5, 6].map((n) => tab(n, { windowId: 2 })),
  ]);
  await fireCreated(tab(7, { windowId: 1 })); // 7 total across the browser
  assert.equal(removed.length, 1);
  assert.notEqual(removed[0], 7);
});

// Regression: the first tab's draw used to see the second one as an ordinary
// old tab and shoot it, roughly one run in seven. Repeat to make that visible.
await test('two tabs opened at once kill two old tabs, never each other', async () => {
  for (let i = 0; i < 25; i += 1) {
    await setup({}, {}, [1, 2, 3, 4, 5, 6].map((n) => tab(n)));
    const a = tab(7);
    const b = tab(8);
    tabs.push(a, b);
    for (const f of listeners.created) f(a);
    for (const f of listeners.created) f(b);
    await sleep(700);
    assert.equal(removed.length, 2, `serialized draws, got ${removed.length}`);
    assert.equal(tabs.length, 6, 'settles back to exactly six');
    assert.ok(!removed.includes(7) && !removed.includes(8), 'a freshly opened tab was shot');
  }
});

await test('a tab that closes itself mid-draw does not throw', async () => {
  await setup({}, {}, [1, 2, 3, 4, 5, 6].map((n) => tab(n)));
  const t = tab(7);
  tabs.push(t);
  for (const f of listeners.created) f(t);
  tabs.splice(tabs.findIndex((x) => x.id === 7), 1); // gone before SETTLE_MS elapses
  await sleep(450);
  assert.equal(removed.length, 0, 'no victim when the trigger tab vanished');
});

await test('notification names the dead tab', async () => {
  await setup({}, {}, [1, 2, 3, 4, 5, 6].map((n) => tab(n)));
  await fireCreated(tab(7));
  assert.equal(notified.length, 1);
  assert.match(notified[0].message, /^Shot: tab[1-6]$/);
});

await test('notify=false stays quiet', async () => {
  await setup({ notify: false }, {}, [1, 2, 3, 4, 5, 6].map((n) => tab(n)));
  await fireCreated(tab(7));
  assert.equal(removed.length, 1);
  assert.equal(notified.length, 0);
});

// ---------------------------------------------------------------------------

let failed = 0;
for (const [status, name, msg] of results) {
  if (status === 'FAIL') failed += 1;
  console.log(`${status === 'pass' ? ' ok ' : 'FAIL'}  ${name}${msg ? `\n        ${msg}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
