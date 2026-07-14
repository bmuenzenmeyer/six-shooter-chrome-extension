// Copyright (C) 2026 Brian Muenzenmeyer
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  getSettings,
  countedTabs,
  candidateTabs,
  iconAssignments,
  scopeQuery,
} from './settings.js';
import { renderIconSet } from './icon.js';

// Chrome replays onCreated for every tab it restores at launch. Without a grace
// window, "continue where you left off" would open twenty tabs and we would
// execute fourteen of them.
const STARTUP_GRACE_MS = 5000;

// onCreated fires before the tab has settled into its window. Waiting a beat
// also gives onStartup time to land, since the two are not ordered.
const SETTLE_MS = 200;

// Ctrl-clicking two links opens two tabs a few milliseconds apart. To the first
// tab's draw, the second one just looks like another old tab sitting in the
// cylinder — and it would get shot. Anything opened this recently is spared;
// it will face its own draw.
const RECENT_SPARE_MS = 1500;

const recentlyCreated = new Map(); // tabId -> created-at ms

function noteCreated(tabId) {
  const now = Date.now();
  recentlyCreated.set(tabId, now);
  for (const [id, at] of recentlyCreated) {
    if (now - at > RECENT_SPARE_MS) recentlyCreated.delete(id);
  }
}

const isRecent = (tabId) => Date.now() - (recentlyCreated.get(tabId) ?? -Infinity) <= RECENT_SPARE_MS;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Two tabs opened in the same instant would each read a pre-kill tab count and
// each fire, taking out two tabs for one offence. Serialize every draw.
let queue = Promise.resolve();
const enqueue = (task) => {
  queue = queue.then(task).catch((err) => console.error('[six-shooter]', err));
  return queue;
};

const markStartup = () => chrome.storage.session.set({ startupAt: Date.now() });
chrome.runtime.onStartup.addListener(markStartup);
chrome.runtime.onInstalled.addListener(markStartup);

async function inStartupGrace() {
  const { startupAt = 0 } = await chrome.storage.session.get('startupAt');
  return Date.now() - startupAt < STARTUP_GRACE_MS;
}

async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null; // closed while we were waiting
  }
}

function announce(victim) {
  const name = victim.title || victim.url || 'a tab';
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Six Shooter',
    message: `Shot: ${name.length > 80 ? `${name.slice(0, 79)}…` : name}`,
    priority: 0,
  });
}

/** Spare `sparedTab`, then shoot one of the tabs sharing its cylinder. */
async function shoot(sparedTab) {
  const settings = await getSettings();
  if (!settings.enabled) return;

  const tabs = await chrome.tabs.query(scopeQuery(settings, sparedTab.windowId));
  if (countedTabs(tabs, settings).length <= settings.chambers) return;

  const isSpared = (tab) => tab.id === sparedTab.id || isRecent(tab.id);
  const candidates = candidateTabs(tabs, settings, isSpared);
  if (candidates.length === 0) {
    // Over the limit with nothing shootable. Fail open rather than break a
    // promise we made about immunity.
    console.warn('[six-shooter] over the limit, but every tab is immune.');
    return;
  }

  const victim = candidates[Math.floor(Math.random() * candidates.length)];
  try {
    await chrome.tabs.remove(victim.id);
  } catch {
    return; // it closed itself between the draw and the trigger
  }
  if (settings.notify) announce(victim);
}

// Repaint each tab's toolbar icon to show how full its cylinder is. Rendered
// icons are cached by (loaded, chambers) so a burst of tab churn reuses images
// instead of re-rasterizing the same cylinder over and over.
const iconCache = new Map();
function iconFor(loaded, chambers) {
  const key = `${loaded}|${chambers}`;
  if (!iconCache.has(key)) iconCache.set(key, renderIconSet(loaded, chambers));
  return iconCache.get(key);
}

async function refreshIcons() {
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  for (const { tabId, loaded, chambers } of iconAssignments(tabs, settings)) {
    const imageData = iconFor(loaded, chambers);
    if (!imageData) return; // no canvas in this environment; nothing to paint
    try {
      await chrome.action.setIcon({ tabId, imageData });
    } catch {
      // tab closed between query and paint; the next refresh will catch up
    }
  }
}

// Coalesce bursts (closing a window fires one onRemoved per tab) into a single
// repaint at the tail of the work queue, so it can't race an in-flight draw.
let refreshQueued = false;
function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  enqueue(async () => {
    refreshQueued = false;
    await refreshIcons();
  });
}

chrome.tabs.onCreated.addListener((tab) => {
  noteCreated(tab.id); // synchronously, before any draw can queue behind us
  enqueue(async () => {
    await sleep(SETTLE_MS);
    if (await inStartupGrace()) return;
    const live = await getTab(tab.id);
    if (live) await shoot(live);
  });
  scheduleRefresh();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  recentlyCreated.delete(tabId);
  scheduleRefresh();
});

// Dragging a tab into a full window has to count, or the per-window limit is
// one drag away from meaningless. A move never changes the global count, so
// this only applies to per-window scope.
chrome.tabs.onAttached.addListener((tabId) => {
  enqueue(async () => {
    const settings = await getSettings();
    if (settings.scope !== 'window') return;
    const live = await getTab(tabId);
    if (live) await shoot(live);
  });
  scheduleRefresh();
});

// A tab leaving a window drops that window's count; a tab getting pinned or
// unpinned moves in or out of the cylinder. Both change what the icon shows.
chrome.tabs.onDetached.addListener(scheduleRefresh);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.pinned !== undefined) scheduleRefresh();
});

// Chamber count, scope, or pinned-immunity changing all restyle every icon.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'sync') return;
  iconCache.clear();
  scheduleRefresh();
});

// Paint on every wake-up of the service worker, so the icons are correct after
// a browser start, an extension reload, or the worker being torn down and
// revived.
scheduleRefresh();
