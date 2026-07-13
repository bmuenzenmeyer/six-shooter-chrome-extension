// Copyright (C) 2026 Brian Muenzenmeyer
// SPDX-License-Identifier: GPL-3.0-or-later

import { getSettings, setSettings, countedTabs, scopeQuery } from './settings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CENTER = 50;
const RING_R = 26; // distance from center to each chamber's center
const CHAMBER_R = 10.5;

const el = (name, attrs) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

function drawCylinder(chambers, loaded, armed) {
  const svg = document.getElementById('cylinder');
  svg.replaceChildren();

  svg.append(el('circle', { cx: CENTER, cy: CENTER, r: 47, fill: '#c9a227' }));
  svg.append(el('circle', { cx: CENTER, cy: CENTER, r: 43, fill: '#1f2126' }));

  for (let i = 0; i < chambers; i += 1) {
    const angle = (-90 + (i * 360) / chambers) * (Math.PI / 180);
    const isLoaded = i < loaded;
    svg.append(
      el('circle', {
        class: 'chamber',
        cx: CENTER + RING_R * Math.cos(angle),
        cy: CENTER + RING_R * Math.sin(angle),
        r: CHAMBER_R,
        fill: isLoaded ? (armed ? '#c9a227' : '#6b5714') : '#101114',
        stroke: '#000',
        'stroke-width': 1,
        'stroke-opacity': 0.45,
      }),
    );
  }

  svg.append(el('circle', { cx: CENTER, cy: CENTER, r: 6, fill: '#c9a227' }));
}

function describe(loaded, chambers, armed) {
  if (!armed) return { text: 'Safety on', className: 'safe' };
  if (loaded > chambers) {
    const over = loaded - chambers;
    return { text: `${over} tab${over === 1 ? '' : 's'} over the limit`, className: 'hot' };
  }
  if (loaded === chambers) return { text: 'Cylinder full — next tab draws blood', className: 'hot' };
  const free = chambers - loaded;
  return { text: `${free} chamber${free === 1 ? '' : 's'} empty`, className: 'safe' };
}

async function render() {
  const settings = await getSettings();
  const { id: windowId } = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query(scopeQuery(settings, windowId));
  const loaded = countedTabs(tabs, settings).length;

  drawCylinder(settings.chambers, Math.min(loaded, settings.chambers), settings.enabled);

  document.getElementById('count').innerHTML =
    `${loaded}<span class="cap"> / ${settings.chambers}</span>`;

  const { text, className } = describe(loaded, settings.chambers, settings.enabled);
  const status = document.getElementById('status');
  status.textContent = text;
  status.className = `status ${className}`;

  document.getElementById('enabled').checked = settings.enabled;
}

document.getElementById('enabled').addEventListener('change', async (event) => {
  await setSettings({ enabled: event.target.checked });
  render();
});

document.getElementById('options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

render();
