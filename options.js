// Copyright (C) 2026 Brian Muenzenmeyer
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULTS, getSettings, setSettings } from './settings.js';

const inputs = [...document.querySelectorAll('[data-setting]')];

function paint(settings) {
  for (const input of inputs) {
    const value = settings[input.dataset.setting];
    if (input.type === 'checkbox') input.checked = value;
    else if (input.type === 'radio') input.checked = input.value === value;
    else input.value = value;
  }
}

let savedTimer;
function flashSaved() {
  const saved = document.getElementById('saved');
  saved.textContent = 'Saved';
  saved.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => saved.classList.remove('show'), 1200);
}

function readValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'radio') return input.value;

  // Chambers. Reject empty or non-numeric input rather than persisting NaN,
  // which would make every tab count as over the limit.
  const parsed = Number.parseInt(input.value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  const clamped = Math.min(50, Math.max(1, parsed));
  input.value = clamped;
  return clamped;
}

for (const input of inputs) {
  input.addEventListener('change', async () => {
    const value = readValue(input);
    if (value === undefined) {
      paint(await getSettings()); // snap the field back to what's stored
      return;
    }
    await setSettings({ [input.dataset.setting]: value });
    flashSaved();
  });
}

document.getElementById('reset').addEventListener('click', async () => {
  await setSettings(DEFAULTS);
  paint(DEFAULTS);
  flashSaved();
});

paint(await getSettings());
