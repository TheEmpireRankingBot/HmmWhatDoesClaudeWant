// Landing page: wire the edition CTAs to whatever's configured in
// src/core/config.js (single source of truth). Buttons that aren't configured
// quietly fall back to the gallery, so the page always works.

import { config, isLink } from './src/core/config.js';

function link(id, url) {
  const el = document.getElementById(id);
  if (el && isLink(url)) el.href = url;
}

link('cta-support', config.links.support);
link('cta-shop', config.links.shop);
// A Pro key is bought from the shop; fall back there if set.
link('cta-pro', config.links.shop);

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());
