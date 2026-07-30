import {
  $, el, svg, domainOf, fmtNum, timeAgo, debounce,
  tokenize, searchScore, highlight, faviconEl, loadPref, savePref,
  bm, openUrl, IS_EXT,
} from '../common/utils.js';
import { applyI18n, getLang, languageButtonText, languageButtonTitle, setLang, tr } from '../common/i18n.js';

const searchInput = $('#search');
const resultsBox = $('#results');
const currentBox = $('#currentPage');
const bodyBox = $('#body');

let allBookmarks = [];
let nodeById = new Map();
let countsById = new Map();   // marcadores recursivos por carpeta
let rootFolders = [];
let currentTab = null;

let expanded = new Set(loadPref('mp-popup-expanded', []));
let activeId = null;          // fila resaltada para navegación con teclado

function pathLabel(node) {
  const parts = [];
  let p = node.parentId ? nodeById.get(node.parentId) : null;
  while (p && p.parentId) { parts.unshift(p.title || tr('Untitled', 'Sin nombre')); p = nodeById.get(p.parentId); }
  return parts.join(' / ');
}

async function loadData() {
  const [root] = await bm.getTree();
  nodeById = new Map();
  countsById = new Map();
  allBookmarks = [];
  (function walk(n) {
    nodeById.set(n.id, n);
    if (n.url) { allBookmarks.push(n); return 1; }
    let b = 0;
    for (const c of n.children || []) b += walk(c);
    countsById.set(n.id, b);
    return b;
  })(root);
  rootFolders = root.children || [];
  $('#total').textContent = `${fmtNum(allBookmarks.length)} ${allBookmarks.length === 1 ? tr('bookmark', 'marcador') : tr('bookmarks', 'marcadores')}`;
}

// ---------- árbol de carpetas ----------
function folderBlock(folder) {
  const open = expanded.has(folder.id);
  const cnt = countsById.get(folder.id) || 0;
  const row = el('button', {
    class: 'row tree', dataset: { id: folder.id, folder: '1' },
    title: folder.title || tr('Untitled', 'Sin nombre'),
  },
    el('span', { class: `twist${open ? ' open' : ''}`, html: svg('chevron', 12) }),
    el('span', { class: 'icn folder-icn', html: svg(open ? 'folderOpen' : 'folder', 15) }),
    el('span', { class: 'tlabel', text: folder.title || tr('Untitled', 'Sin nombre') }),
    el('span', { class: 'count', text: cnt ? fmtNum(cnt) : '' }));
  row.addEventListener('click', () => toggleFolder(folder.id));
  const wrap = el('div', { class: 'node' }, row);
  if (open) {
    const kids = el('div', { class: 'kids' });
    const children = folder.children || [];
    if (!children.length) {
      kids.append(el('div', { class: 'empty-row', text: tr('Empty folder', 'Carpeta vacía') }));
    }
    for (const c of children) kids.append(c.url ? bookmarkRow(c) : folderBlock(c));
    wrap.append(kids);
  }
  return wrap;
}

function bookmarkRow(n) {
  const row = el('button', {
    class: 'row tree bm', dataset: { id: n.id },
    title: `${n.title || ''}\n${n.url}`,
  },
    faviconEl(n.url, 16),
    el('span', { class: 'tlabel', text: n.title || domainOf(n.url) }),
    el('span', { class: 'icn go', html: svg('arrowUpRight', 13) }));
  row.addEventListener('click', () => { openUrl(n.url); window.close(); });
  return row;
}

function toggleFolder(id) {
  if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
  savePref('mp-popup-expanded', [...expanded]);
  activeId = id;
  renderKeepingScroll();
}

function renderKeepingScroll() {
  const st = bodyBox.scrollTop;
  render();
  bodyBox.scrollTop = st;
}

// ---------- render ----------
function render() {
  const q = searchInput.value.trim();
  resultsBox.innerHTML = '';

  if (!q) {
    currentBox.hidden = !currentTab;
    if (expanded.size === 0) for (const r of rootFolders) expanded.add(r.id);
    const hasAnything = allBookmarks.length || rootFolders.some((f) => f.children?.length);
    if (!hasAnything) {
      resultsBox.append(el('div', { class: 'empty-msg', text: tr('You do not have any saved bookmarks yet.', 'Todavía no tienes marcadores guardados.') }));
    } else {
      for (const r of rootFolders) resultsBox.append(folderBlock(r));
    }
    applyActive();
    return;
  }

  currentBox.hidden = true;
  const tokens = tokenize(q);
  const scored = [];
  for (const n of nodeById.values()) {
    if (!n.parentId) continue;
    const s = searchScore(n, tokens);
    if (s >= 0) scored.push([s, n]);
  }
  scored.sort((a, b) => b[0] - a[0] || (b[1].dateAdded || 0) - (a[1].dateAdded || 0));
  const top = scored.slice(0, 12).map((r) => r[1]);
  if (!top.length) {
    resultsBox.append(el('div', { class: 'empty-msg', text: tr(`No results for “${q}”`, `Sin resultados para “${q}”`) }));
    applyActive();
    return;
  }
  for (const n of top) resultsBox.append(resultRow(n, tokens));
  if (scored.length > top.length) {
    const more = el('button', { class: 'row', dataset: { id: '__more' } },
      el('span', { class: 'icn folder-icn', html: svg('search', 15) }),
      el('span', { class: 'meta' }, el('span', { class: 'title', text: tr(`View all ${fmtNum(scored.length)} results`, `Ver los ${fmtNum(scored.length)} resultados`) })),
      el('span', { class: 'icn go', html: svg('arrowUpRight', 14) }));
    more.addEventListener('click', () => openManager(`?q=${encodeURIComponent(q)}`));
    resultsBox.append(more);
  }
  applyActive();
}

function resultRow(node, tokens) {
  const isFolder = !node.url;
  const row = el('button', { class: 'row', dataset: { id: node.id } },
    isFolder ? el('span', { class: 'icn folder-icn', html: svg('folder', 16) }) : faviconEl(node.url, 18),
    el('span', { class: 'meta' },
      el('span', { class: 'title', html: highlight(node.title || (isFolder ? tr('Untitled', 'Sin nombre') : domainOf(node.url)), tokens) }),
      el('span', { class: 'sub', text: isFolder ? pathLabel(node) || tr('Folder', 'Carpeta') : (pathLabel(node) ? `${pathLabel(node)} · ` : '') + domainOf(node.url) })),
    el('span', { class: 'icn go', html: svg(isFolder ? 'chevron' : 'arrowUpRight', 14) }));
  row.addEventListener('click', () => openNode(node));
  return row;
}

function openNode(node) {
  if (node.url) {
    openUrl(node.url);
    window.close();
  } else {
    openManager(`?folder=${encodeURIComponent(node.id)}`);
  }
}

function openManager(params = '') {
  if (IS_EXT) {
    if (!params && chrome.runtime?.sendMessage) {
      try { chrome.runtime.sendMessage({ type: 'open-manager' }).catch(() => {}); } catch { /* */ }
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') + params });
    }
    window.close();
  } else {
    window.open(`../manager/manager.html${params}`, '_blank');
  }
}

// ---------- navegación con teclado ----------
const navRows = () => [...resultsBox.querySelectorAll('button.row')];

function applyActive() {
  for (const r of navRows()) r.classList.toggle('active', r.dataset.id === activeId);
}

function activeIndex() {
  return navRows().findIndex((r) => r.dataset.id === activeId);
}

function setActiveByIndex(i) {
  const rows = navRows();
  if (!rows.length) return;
  if (i < 0) {
    activeId = null;
    applyActive();
    return;
  }
  const idx = Math.min(rows.length - 1, i);
  activeId = rows[idx].dataset.id ?? null;
  applyActive();
  rows[idx].scrollIntoView({ block: 'nearest' });
}

searchInput.addEventListener('keydown', (e) => {
  const rows = navRows();
  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveByIndex(activeIndex() + 1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); setActiveByIndex(activeIndex() - 1); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    const row = rows[activeIndex() >= 0 ? activeIndex() : 0];
    row?.click();
    return;
  }
  if (e.key === 'Escape' && searchInput.value) {
    searchInput.value = '';
    activeId = null;
    render();
    return;
  }
  // expandir/contraer carpetas con ← → (solo cuando no se está escribiendo)
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !searchInput.value) {
    const row = rows[activeIndex()];
    if (!row?.dataset.folder) return;
    e.preventDefault();
    const id = row.dataset.id;
    const isOpen = expanded.has(id);
    if (e.key === 'ArrowRight' && !isOpen) toggleFolder(id);
    if (e.key === 'ArrowLeft' && isOpen) toggleFolder(id);
  }
});

searchInput.addEventListener('input', debounce(() => { activeId = null; render(); }, 100));

// ---------- página actual ----------
async function loadCurrentTab() {
  if (!IS_EXT || !chrome.tabs?.query) {
    currentTab = { title: tr('Example page (development mode)', 'Página de ejemplo (modo desarrollo)'), url: 'https://example.dev/article' };
  } else {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && /^https?:/.test(tab.url)) currentTab = { title: tab.title || tab.url, url: tab.url };
    } catch { /* sin permiso */ }
  }
  if (!currentTab) return;
  renderCurrent();
}

function findByUrl(url) {
  return allBookmarks.find((b) => b.url === url);
}

function renderCurrent() {
  currentBox.innerHTML = '';
  currentBox.hidden = !!searchInput.value.trim();
  const existing = findByUrl(currentTab.url);
  const star = el('button', {
    class: `star${existing ? ' saved' : ''}`,
    title: existing ? tr('Remove from bookmarks', 'Quitar de marcadores') : tr('Save this page', 'Guardar esta página'),
  });
  star.innerHTML = existing
    ? `<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/></svg>`
    : svg('bookmark', 19);
  star.addEventListener('click', async () => {
    const cur = findByUrl(currentTab.url);
    try {
      if (cur) {
        await bm.remove(cur.id);
      } else {
        await bm.create({ parentId: rootFolders[0]?.id, title: currentTab.title, url: currentTab.url });
      }
      await loadData();
      renderCurrent();
      renderKeepingScroll();
    } catch { /* */ }
  });
  currentBox.append(
    faviconEl(currentTab.url, 20),
    el('span', { class: 'meta' },
      el('span', { class: 'title', text: currentTab.title }),
      el('span', { class: 'sub', text: existing ? tr(`Saved ${timeAgo(existing.dateAdded)}`, `Guardado ${timeAgo(existing.dateAdded)}`) : domainOf(currentTab.url) })),
    star,
  );
}

// ---------- init ----------
async function init() {
  applyI18n();
  $('#searchBar .search-icn').innerHTML = svg('search', 16);
  const mb = $('#btnManager');
  mb.innerHTML = `${svg('grid', 14)}<span>${tr('Manager', 'Administrador')}</span>`;
  mb.addEventListener('click', () => openManager());
  const lb = $('#btnLang');
  lb.textContent = languageButtonText();
  lb.title = languageButtonTitle();
  lb.addEventListener('click', () => {
    setLang(getLang() === 'en' ? 'es' : 'en');
    location.reload();
  });
  const cb = $('#btnCollapse');
  cb.innerHTML = svg('collapse', 15);
  cb.addEventListener('click', () => {
    expanded = new Set(rootFolders.map((r) => r.id));
    savePref('mp-popup-expanded', [...expanded]);
    activeId = null;
    render();
    bodyBox.scrollTop = 0;
  });

  bodyBox.addEventListener('scroll', debounce(() => savePref('mp-popup-scroll', bodyBox.scrollTop), 150), { passive: true });

  await loadData();
  render();
  await loadCurrentTab();
  bodyBox.scrollTop = loadPref('mp-popup-scroll', 0);
  searchInput.focus();
}

init();
