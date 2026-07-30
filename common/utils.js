import { createMockBookmarks } from './mock.js';

export const IS_EXT = typeof chrome !== 'undefined' && !!chrome.bookmarks && !!chrome.runtime?.id;

// ---------- DOM ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(c));
  }
  return n;
}

// ---------- Iconos SVG (estilo lucide, stroke) ----------
const PATHS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bookmark: '<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderPlus: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6M9 13h6"/>',
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  pen: '<path d="M21.28 6.4a2.1 2.1 0 0 0-2.97-2.97L4.5 17.25 3 21l3.75-1.5Z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>',
  arrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  window: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20"/><circle cx="5.5" cy="6.5" r=".5"/><circle cx="8" cy="6.5" r=".5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sort: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  collapse: '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>',
  sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 17v4M17 19h4"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="10"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
};

export function svg(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

export function icon(name, size = 18) {
  return el('span', { class: 'icn', html: svg(name, size) });
}

// ---------- Texto ----------
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; }
}

const NF = new Intl.NumberFormat('es');
export const fmtNum = (n) => NF.format(n);

const RTF = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
export function timeAgo(ts) {
  if (!ts) return '';
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'ahora';
  if (abs < 3600) return RTF.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return RTF.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return RTF.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 365) return RTF.format(Math.round(diff / (86400 * 30)), 'month');
  return RTF.format(Math.round(diff / (86400 * 365)), 'year');
}

export function fullDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- Búsqueda ----------
export function tokenize(query) {
  return normalize(query).split(/\s+/).filter(Boolean);
}

// Puntúa un nodo contra los tokens; devuelve -1 si no matchea todos
export function searchScore(node, tokens) {
  const title = normalize(node.title || '');
  const url = normalize(node.url || '');
  const domain = node.url ? normalize(domainOf(node.url)) : '';
  let score = 0;
  for (const t of tokens) {
    const it = title.indexOf(t);
    const iu = url.indexOf(t);
    if (it === -1 && iu === -1) return -1;
    if (it === 0) score += 60;
    else if (it > 0 && /[\s\-_./|:]/.test(title[it - 1] || '')) score += 40;
    else if (it > 0) score += 20;
    if (domain.startsWith(t)) score += 25;
    else if (iu !== -1) score += 8;
  }
  if (!node.url) score += 5; // las carpetas que matchean, un poco arriba
  return score;
}

// Resalta ocurrencias de los tokens (devuelve HTML seguro)
export function highlight(text, tokens) {
  const raw = String(text);
  if (!tokens?.length) return escapeHtml(raw);
  const norm = normalize(raw);
  const marks = new Array(raw.length).fill(false);
  for (const t of tokens) {
    let from = 0;
    while (true) {
      const i = norm.indexOf(t, from);
      if (i === -1) break;
      for (let j = i; j < Math.min(i + t.length, raw.length); j++) marks[j] = true;
      from = i + t.length;
    }
  }
  let out = '';
  let open = false;
  for (let i = 0; i < raw.length; i++) {
    if (marks[i] && !open) { out += '<mark>'; open = true; }
    if (!marks[i] && open) { out += '</mark>'; open = false; }
    out += escapeHtml(raw[i]);
  }
  if (open) out += '</mark>';
  return out;
}

// ---------- Favicons ----------
export function faviconUrl(url, size = 32) {
  if (IS_EXT) {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', url);
    u.searchParams.set('size', String(size));
    return u.toString();
  }
  return null;
}

const HUES = [4, 26, 42, 145, 165, 200, 225, 258, 285, 320];
export function letterAvatarStyle(url) {
  const d = domainOf(url);
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) >>> 0;
  const hue = HUES[h % HUES.length];
  return { letter: (d[0] || '?').toUpperCase(), hue };
}

// Nodo <img>/avatar con fallback a letra
export function faviconEl(url, size = 20) {
  const wrap = el('span', { class: 'fav', style: `--fav-size:${size}px` });
  const src = faviconUrl(url, size >= 24 ? 64 : 32);
  const { letter, hue } = letterAvatarStyle(url);
  const letterEl = el('span', { class: 'fav-letter', style: `--h:${hue}`, text: letter });
  if (src) {
    const img = el('img', { src, alt: '', loading: 'lazy', width: size, height: size });
    img.addEventListener('error', () => { img.replaceWith(letterEl); });
    wrap.append(img);
  } else {
    wrap.append(letterEl);
  }
  return wrap;
}

// ---------- Storage local (preferencias) ----------
export function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function savePref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* */ }
}

// ---------- API de marcadores (real o mock para desarrollo) ----------
function realApi() {
  const b = chrome.bookmarks;
  return {
    isMock: false,
    getTree: () => b.getTree(),
    getSubTree: (id) => b.getSubTree(id),
    getChildren: (id) => b.getChildren(id),
    getRecent: (n) => b.getRecent(n),
    create: (o) => b.create(o),
    update: (id, o) => b.update(id, o),
    move: (id, o) => b.move(id, o),
    remove: (id) => b.remove(id),
    removeTree: (id) => b.removeTree(id),
    onAny(cb) {
      for (const ev of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered']) {
        b[ev]?.addListener(cb);
      }
      b.onImportBegan?.addListener(() => { this._importing = true; });
      b.onImportEnded?.addListener(() => { this._importing = false; cb(); });
    },
  };
}

export const bm = IS_EXT ? realApi() : createMockBookmarks();

// ---------- Pestañas ----------
export function openUrl(url, { active = true } = {}) {
  if (IS_EXT && chrome.tabs?.create) chrome.tabs.create({ url, active });
  else window.open(url, '_blank');
}
export function openInWindow(url) {
  if (IS_EXT && chrome.windows?.create) chrome.windows.create({ url });
  else window.open(url, '_blank', 'noopener,width=1100,height=800');
}
