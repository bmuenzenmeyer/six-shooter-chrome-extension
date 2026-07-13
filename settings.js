// Copyright (C) 2026 Brian Muenzenmeyer
// SPDX-License-Identifier: GPL-3.0-or-later

export const DEFAULTS = Object.freeze({
  enabled: true,
  chambers: 6,
  scope: 'window', // 'window' | 'global'
  immunePinned: true,
  immuneAudible: true,
  immuneActive: false,
  notify: true,
});

export function getSettings() {
  return chrome.storage.sync.get(DEFAULTS);
}

export function setSettings(patch) {
  return chrome.storage.sync.set(patch);
}

export function scopeQuery(settings, windowId) {
  const query = { windowType: 'normal' };
  if (settings.scope === 'window') query.windowId = windowId;
  return query;
}

/**
 * Tabs that occupy a chamber. A pinned tab under `immunePinned` sits outside
 * the cylinder entirely — it neither fills a chamber nor can be shot. Letting
 * it fill one without being shootable would jam the extension: six pinned tabs
 * would put you over the limit with nothing left to kill.
 */
export function countedTabs(tabs, settings) {
  return tabs.filter((tab) => !(settings.immunePinned && tab.pinned));
}

/**
 * Tabs eligible to take the bullet. Audible and active immunity work the other
 * way from pinning: those tabs still fill a chamber, they just can't be shot.
 *
 * `isSpared(tab)` protects the tab that triggered the draw — and any other tab
 * opened in the same breath, which would otherwise look like an old tab to its
 * neighbour's draw and get shot for it.
 */
export function candidateTabs(tabs, settings, isSpared) {
  return countedTabs(tabs, settings).filter(
    (tab) =>
      !isSpared(tab) &&
      !(settings.immuneAudible && tab.audible) &&
      !(settings.immuneActive && tab.active),
  );
}
