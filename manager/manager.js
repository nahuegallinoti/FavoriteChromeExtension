import {
  $, $$, el, svg, domainOf, fmtNum, timeAgo, fullDate, debounce,
  tokenize, searchScore, highlight, faviconEl, loadPref, savePref,
  bm, openUrl, openInWindow, IS_EXT,
} from '../common/utils.js';

// ============ Estado ============
const state = {
  view: loadPref('mp-view', { type: 'folder', folderId: null }),
  query: '',
  sort: loadPref('mp-sort', 'manual'),
  layout: loadPref('mp-layout', 'grid'),
  expanded: new Set(loadPref('mp-expanded', [])),
  selection: new Set(),
  anchorIndex: null,
  items: [],          // nodos renderizados, en orden visual
  limit: 400,
  tipDismissed: loadPref('mp-tip-dismissed', false),
};

let tree = null;
let nodeById = new Map();
let countsById = new Map();   // { b: marcadores recursivos, f: carpetas recursivas }
let allBookmarks = [];
let rootFolders = [];

const content = $('#content');
const searchInput = $('#search');

const SORTS = [
  { id: 'manual', label: 'Personalizado' },
  { id: 'title-asc', label: 'Nombre (A → Z)' },
  { id: 'title-desc', label: 'Nombre (Z → A)' },
  { id: 'date-new', label: 'Más recientes primero' },
  { id: 'date-old', label: 'Más antiguos primero' },
];

// ============ Datos ============
async function refresh() {
  const [root] = await bm.getTree();
  tree = root;
  nodeById = new Map();
  countsById = new Map();
  allBookmarks = [];
  walk(root);
  rootFolders = root.children || [];
  for (const id of [...state.selection]) if (!nodeById.has(id)) state.selection.delete(id);
  if (state.view.type === 'folder' && (!state.view.folderId || !nodeById.get(state.view.folderId) || nodeById.get(state.view.folderId).url)) {
    state.view = { type: 'folder', folderId: rootFolders[0]?.id };
  }
  renderSidebar();
  renderContent();
}

function walk(node) {
  nodeById.set(node.id, node);
  if (node.url) { allBookmarks.push(node); return { b: 1, f: 0 }; }
  let b = 0, f = 0;
  for (const c of node.children || []) {
    const r = walk(c);
    b += r.b;
    f += r.f + (c.url ? 0 : 1);
  }
  countsById.set(node.id, { b, f });
  return { b, f };
}

const searching = () => state.query.trim().length > 0;
const isRootFolder = (n) => n && n.parentId === tree.id;

function pathOf(node) {
  const out = [];
  let p = node?.parentId ? nodeById.get(node.parentId) : null;
  while (p && p.id !== tree.id) { out.unshift(p); p = p.parentId ? nodeById.get(p.parentId) : null; }
  return out;
}

function isDescendant(id, ancestorId) {
  let p = nodeById.get(id)?.parentId;
  while (p) { if (p === ancestorId) return true; p = nodeById.get(p)?.parentId; }
  return false;
}

// filtra ids cuyo ancestro también está en la lista
function topLevelOnly(ids) {
  const set = new Set(ids);
  return ids.filter((id) => {
    let p = nodeById.get(id)?.parentId;
    while (p) { if (set.has(p)) return false; p = nodeById.get(p)?.parentId; }
    return true;
  });
}

function collectUrls(folder) {
  const out = [];
  (function w(n) { for (const c of n.children || []) { if (c.url) out.push(c.url); else w(c); } })(folder);
  return out;
}

function urlKey(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).toLowerCase().replace(/\/$/, '') + u.search;
  } catch { return url; }
}

function dupeGroups() {
  const map = new Map();
  for (const n of allBookmarks) {
    const k = urlKey(n.url);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(n);
  }
  return [...map.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
}

function cmpTitle(a, b) {
  return (a.title || '').localeCompare(b.title || '', 'es', { sensitivity: 'base' });
}

function sortArr(arr, { fallbackDate = false } = {}) {
  switch (state.sort) {
    case 'title-asc': arr.sort(cmpTitle); break;
    case 'title-desc': arr.sort((a, b) => cmpTitle(b, a)); break;
    case 'date-new': arr.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)); break;
    case 'date-old': arr.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0)); break;
    default: if (fallbackDate) arr.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
  }
  return arr;
}

const errMsg = (err) => 'No se pudo completar: ' + (err?.message || 'error desconocido');

// ============ Navegación ============
function setView(v) {
  state.view = v;
  state.limit = 400;
  clearSelection({ silent: true });
  if (searching()) { state.query = ''; searchInput.value = ''; $('#btnClearSearch').hidden = true; }
  if (v.type === 'folder' && v.folderId) {
    for (const a of pathOf(nodeById.get(v.folderId))) state.expanded.add(a.id);
    savePref('mp-expanded', [...state.expanded]);
  }
  savePref('mp-view', { type: v.type, folderId: v.folderId ?? null });
  closeSidebarMobile();
  renderSidebar();
  renderContent();
  content.scrollTop = 0;
}

function setQuery(q, { fromInput = false } = {}) {
  state.query = q;
  if (!fromInput) searchInput.value = q;
  $('#btnClearSearch').hidden = !q;
  state.limit = 400;
  clearSelection({ silent: true });
  renderSidebar();
  renderContent();
}

function openItem(node) {
  if (node.url) openUrl(node.url);
  else setView({ type: 'folder', folderId: node.id });
}

// ============ Sidebar ============
function renderSidebar() {
  renderViews();
  renderTree();
  const t = countsById.get(tree.id) || { b: 0, f: 0 };
  $('#stats').textContent = `${fmtNum(t.b)} marcadores · ${fmtNum(Math.max(0, t.f - rootFolders.length))} carpetas`;
}

function renderViews() {
  const wrap = $('#views');
  wrap.innerHTML = '';
  const total = countsById.get(tree.id) || { b: 0 };
  const extras = dupeGroups().reduce((n, g) => n + g.length - 1, 0);
  const defs = [
    { id: 'all', label: 'Todos los marcadores', icon: 'bookmark', count: fmtNum(total.b) },
    { id: 'recent', label: 'Recientes', icon: 'clock' },
    { id: 'dupes', label: 'Duplicados', icon: 'copy', badge: extras || null },
  ];
  for (const d of defs) {
    const active = !searching() && state.view.type === d.id;
    const b = el('button', { class: `side-item${active ? ' active' : ''}` },
      el('span', { class: 'icn', html: svg(d.icon, 17) }),
      el('span', { class: 'label', text: d.label }),
      d.badge ? el('span', { class: 'badge', text: String(d.badge) })
        : (d.count != null ? el('span', { class: 'count', text: d.count }) : null));
    b.addEventListener('click', () => setView({ type: d.id }));
    wrap.append(b);
  }
}

function renderTree() {
  const wrap = $('#tree');
  wrap.innerHTML = '';
  const build = (folder, depth) => {
    const subs = (folder.children || []).filter((c) => !c.url);
    const isOpen = state.expanded.has(folder.id);
    const active = !searching() && state.view.type === 'folder' && state.view.folderId === folder.id;
    const row = el('div', {
      class: `tree-row${active ? ' active' : ''}`,
      role: 'treeitem', 'aria-expanded': subs.length ? String(isOpen) : null,
      dataset: { id: folder.id },
      style: `padding-left:${6 + depth * 14}px`,
    });
    const twist = el('button', { class: `twist${isOpen ? ' open' : ''}${subs.length ? '' : ' leaf'}`, html: svg('chevron', 13), tabindex: '-1', title: isOpen ? 'Contraer' : 'Expandir' });
    twist.addEventListener('click', (e) => { e.stopPropagation(); toggleExpand(folder.id); });
    const cnt = countsById.get(folder.id)?.b || 0;
    const menuBtn = el('button', { class: 'icon-btn sm row-menu', html: svg('more', 14), title: 'Opciones', tabindex: '-1' });
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = menuBtn.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, folderMenuItems(folder));
    });
    row.append(
      twist,
      el('span', { class: 'icn', html: svg(active ? 'folderOpen' : 'folder', 16) }),
      el('span', { class: 'label', text: folder.title || 'Sin nombre' }),
      el('span', { class: 'count', text: cnt ? fmtNum(cnt) : '' }),
      menuBtn,
    );
    row.addEventListener('click', () => setView({ type: 'folder', folderId: folder.id }));
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, folderMenuItems(folder)); });
    bindTreeDrop(row, folder);
    wrap.append(row);
    if (isOpen) for (const s of subs) build(s, depth + 1);
  };
  for (const r of rootFolders) build(r, 0);
}

function toggleExpand(id) {
  if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
  savePref('mp-expanded', [...state.expanded]);
  renderTree();
}

function bindTreeDrop(row, folder) {
  let expandTimer = null;
  row.addEventListener('dragover', (e) => {
    if (!draggingIds) return;
    if (draggingIds.includes(folder.id)) return;
    if (draggingIds.some((id) => isDescendant(folder.id, id))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropMarkers();
    row.classList.add('drop-into');
    if (!expandTimer && !state.expanded.has(folder.id) && (folder.children || []).some((c) => !c.url)) {
      expandTimer = setTimeout(() => toggleExpand(folder.id), 650);
    }
  });
  row.addEventListener('dragleave', () => {
    row.classList.remove('drop-into');
    clearTimeout(expandTimer); expandTimer = null;
  });
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(expandTimer);
    const ids = draggingIds;
    draggingIds = null;
    clearDropMarkers();
    if (ids?.length) moveNodesTo(ids, folder.id, null);
  });
}

// ============ Encabezado ============
function setHead({ crumbs = [], title = '', countText = '', actions = [] }) {
  const bc = $('#breadcrumb');
  bc.innerHTML = '';
  crumbs.forEach((f, i) => {
    const last = i === crumbs.length - 1;
    if (i > 0) bc.append(el('span', { class: 'sep', html: svg('chevron', 11) }));
    const c = el(last ? 'span' : 'button', { class: `crumb${last ? ' current' : ''}`, text: f.title || 'Sin nombre' });
    if (!last) c.addEventListener('click', () => setView({ type: 'folder', folderId: f.id }));
    bc.append(c);
  });
  $('#viewTitle').textContent = title;
  $('#viewCount').textContent = countText;
  const act = $('#headActions');
  act.innerHTML = '';
  for (const a of actions) act.append(a);
}

// ============ Contenido ============
function renderContent() {
  hideMenu();
  content.innerHTML = '';
  state.items = [];
  state.anchorIndex = null;
  if (searching()) renderSearch();
  else if (state.view.type === 'all') renderAllView();
  else if (state.view.type === 'recent') renderRecentView();
  else if (state.view.type === 'dupes') renderDupesView();
  else renderFolderView();
  syncSelectionUI();
}

function renderFolderView() {
  const folder = nodeById.get(state.view.folderId);
  if (!folder) return;
  const c = countsById.get(folder.id) || { b: 0, f: 0 };
  const actions = [];
  if (c.b > 0) {
    actions.push(btnGhost('external', 'Abrir todos', () => openAll(collectUrls(folder))));
  }
  actions.push(btnGhost('folderPlus', 'Nueva carpeta', () => modalFolder(null, { parentId: folder.id })));
  setHead({
    crumbs: [...pathOf(folder), folder],
    title: folder.title || 'Sin nombre',
    countText: `${fmtNum(c.b)} ${c.b === 1 ? 'marcador' : 'marcadores'}${c.f ? ` · ${fmtNum(c.f)} ${c.f === 1 ? 'carpeta' : 'carpetas'}` : ''}`,
    actions,
  });
  const children = (folder.children || []).slice();
  let nodes;
  if (state.sort === 'manual') {
    nodes = children;
  } else {
    const folders = sortArr(children.filter((x) => !x.url));
    const books = sortArr(children.filter((x) => x.url));
    nodes = [...folders, ...books];
  }
  if (!nodes.length) {
    emptyState({
      icon: 'bookmark', title: 'Esta carpeta está vacía',
      msg: 'Agrega tu primer marcador o arrastra elementos hasta aquí.',
      action: { label: 'Nuevo marcador', onClick: () => modalBookmark(null, { parentId: folder.id }) },
    });
    return;
  }
  renderItems(content, nodes, {});
}

function renderAllView() {
  setHead({ title: 'Todos los marcadores', countText: `${fmtNum(allBookmarks.length)} ${allBookmarks.length === 1 ? 'marcador' : 'marcadores'}` });
  if (!allBookmarks.length) {
    emptyState({
      icon: 'bookmark', title: 'Todavía no hay marcadores',
      msg: 'Guarda tu primera página y va a aparecer acá.',
      action: { label: 'Nuevo marcador', onClick: () => modalBookmark(null, {}) },
    });
    return;
  }
  renderLimited(sortArr(allBookmarks.slice(), { fallbackDate: true }), { showPath: true });
}

function renderRecentView() {
  const sorted = allBookmarks.slice().sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)).slice(0, 150);
  setHead({ title: 'Recientes', countText: sorted.length ? `Últimos ${fmtNum(sorted.length)} marcadores guardados` : '' });
  if (!sorted.length) {
    emptyState({ icon: 'clock', title: 'Nada por aquí todavía', msg: 'Los marcadores que guardes van a aparecer acá, del más nuevo al más viejo.' });
    return;
  }
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets = [
    { label: 'Hoy', test: (t) => t >= startToday },
    { label: 'Ayer', test: (t) => t >= startToday - 86400000 },
    { label: 'Últimos 7 días', test: (t) => t >= startToday - 7 * 86400000 },
    { label: 'Últimos 30 días', test: (t) => t >= startToday - 30 * 86400000 },
    { label: 'Anteriores', test: () => true },
  ];
  const grouped = buckets.map((b) => ({ ...b, items: [] }));
  for (const n of sorted) {
    grouped.find((g) => g.test(n.dateAdded || 0)).items.push(n);
  }
  for (const g of grouped) {
    if (!g.items.length) continue;
    content.append(el('div', { class: 'section-label', text: g.label }));
    renderItems(content, g.items, { showPath: true });
  }
}

function renderSearch() {
  const tokens = tokenize(state.query);
  const results = [];
  for (const n of nodeById.values()) {
    if (n.id === tree.id) continue;
    const s = searchScore(n, tokens);
    if (s >= 0) results.push([s, n]);
  }
  results.sort((a, b) => b[0] - a[0] || (b[1].dateAdded || 0) - (a[1].dateAdded || 0));
  const nodes = results.slice(0, 300).map((r) => r[1]);
  setHead({
    title: 'Resultados',
    countText: `${fmtNum(results.length)} ${results.length === 1 ? 'resultado' : 'resultados'} para “${state.query.trim()}”`,
  });
  if (!nodes.length) {
    emptyState({ icon: 'search', title: 'Sin resultados', msg: 'Prueba con otras palabras o revisa la ortografía.' });
    return;
  }
  renderLimited(nodes, { tokens, showPath: true });
}

function renderDupesView() {
  const groups = dupeGroups();
  const extras = groups.reduce((n, g) => n + g.length - 1, 0);
  const actions = [];
  if (groups.length) {
    const b = el('button', { class: 'btn danger', html: svg('trash', 15) }, ` Limpiar duplicados (${extras})`);
    b.addEventListener('click', async () => {
      const ok = await modalConfirm({
        title: `¿Eliminar ${extras} ${extras === 1 ? 'duplicado' : 'duplicados'}?`,
        msg: 'Se conserva el marcador más antiguo de cada grupo. Puedes deshacerlo después.',
        confirmLabel: 'Limpiar',
      });
      if (ok) deleteNodes(groups.flatMap((g) => sortByAge(g).slice(1).map((n) => n.id)), { skipConfirm: true });
    });
    actions.push(b);
  }
  setHead({
    title: 'Duplicados',
    countText: groups.length ? `${fmtNum(groups.length)} ${groups.length === 1 ? 'URL repetida' : 'URLs repetidas'} · ${fmtNum(extras)} de más` : '',
    actions,
  });
  if (!groups.length) {
    emptyState({ icon: 'sparkles', title: '¡Todo limpio!', msg: 'No hay marcadores duplicados en tu colección.' });
    return;
  }
  for (const g of groups) {
    const ordered = sortByAge(g);
    const keepBtn = el('button', { class: 'btn ghost', style: 'height:28px;font-size:12px' }, 'Dejar solo el más antiguo');
    keepBtn.addEventListener('click', () => deleteNodes(ordered.slice(1).map((n) => n.id), { skipConfirm: true }));
    const box = el('div', { class: 'dupe-group' },
      el('div', { class: 'dupe-head' },
        faviconEl(g[0].url, 18),
        el('span', { class: 'url', text: g[0].url, title: g[0].url }),
        keepBtn,
      ));
    const listWrap = el('div', { class: 'list' });
    for (const n of ordered) {
      listWrap.append(rowEl(n, { showPath: true }));
      state.items.push(n);
    }
    box.append(listWrap);
    content.append(box);
  }
}

const sortByAge = (g) => g.slice().sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));

function renderLimited(nodes, opts) {
  renderItems(content, nodes.slice(0, state.limit), opts);
  if (nodes.length > state.limit) {
    const rest = nodes.length - state.limit;
    content.append(el('div', { style: 'display:flex;justify-content:center;padding:18px' },
      el('button', { class: 'btn', text: `Mostrar ${fmtNum(Math.min(400, rest))} más`, onClick: () => { state.limit += 400; renderContent(); } })));
  }
}

function renderItems(container, nodes, opts = {}) {
  const wrap = el('div', { class: state.layout === 'grid' ? 'grid' : 'list' });
  for (const n of nodes) {
    wrap.append(state.layout === 'grid' ? cardEl(n, opts) : rowEl(n, opts));
    state.items.push(n);
  }
  container.append(wrap);
}

function btnGhost(iconName, label, onClick) {
  const b = el('button', { class: 'btn ghost', html: svg(iconName, 15) }, ` ${label}`);
  b.addEventListener('click', onClick);
  return b;
}

function emptyState({ icon: ic, title, msg, action }) {
  content.append(el('div', { class: 'empty' },
    el('div', { class: 'art', html: svg(ic, 34) }),
    el('h3', { text: title }),
    msg ? el('p', { text: msg }) : null,
    action ? el('button', { class: 'btn primary', text: action.label, onClick: action.onClick }) : null,
  ));
}

// ============ Elementos (card / fila) ============
function selCheckEl() {
  return el('button', { class: 'sel-check', title: 'Seleccionar', html: svg('check', 13), tabindex: '-1' });
}

function menuBtnEl(cls) {
  return el('button', { class: cls, html: svg('more', 15), title: 'Opciones', tabindex: '-1' });
}

function pathChip(node) {
  const parts = pathOf(node).map((f) => f.title || 'Sin nombre');
  if (!parts.length) return null;
  const chip = el('button', { class: 'path-chip', title: 'Ir a la carpeta' },
    el('span', { class: 'icn', html: svg('folder', 11) }),
    el('span', { text: parts.join(' / ') }));
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    setView({ type: 'folder', folderId: node.parentId });
  });
  return chip;
}

function cardEl(node, { tokens, showPath } = {}) {
  const isFolder = !node.url;
  const card = el('div', {
    class: `card${isFolder ? ' is-folder' : ''}`,
    tabindex: '0', role: isFolder ? 'button' : 'link',
    dataset: { id: node.id }, draggable: 'true',
    title: isFolder ? (node.title || 'Sin nombre') : `${node.title || ''}\n${node.url}`,
  });
  const c = isFolder ? (countsById.get(node.id) || { b: 0 }) : null;
  card.append(
    selCheckEl(),
    el('div', { class: 'tile' }, isFolder ? el('span', { class: 'icn', html: svg('folder', 22) }) : faviconEl(node.url, 24)),
    el('div', { class: 'meta' },
      el('div', { class: 'title', html: highlight(node.title || (isFolder ? 'Sin nombre' : domainOf(node.url)), tokens) }),
      el('div', { class: 'sub', text: isFolder ? `${fmtNum(c.b)} ${c.b === 1 ? 'marcador' : 'marcadores'}` : domainOf(node.url) }),
      showPath ? pathChip(node) : null,
    ),
    menuBtnEl('icon-btn card-menu'),
  );
  return card;
}

function rowEl(node, { tokens, showPath } = {}) {
  const isFolder = !node.url;
  const c = isFolder ? (countsById.get(node.id) || { b: 0 }) : null;
  return el('div', {
    class: 'item-row', tabindex: '0', role: isFolder ? 'button' : 'link',
    dataset: { id: node.id }, draggable: 'true',
    title: isFolder ? (node.title || 'Sin nombre') : `${node.title || ''}\n${node.url}`,
  },
    selCheckEl(),
    isFolder
      ? el('span', { class: 'row-icn', html: svg('folder', 18) })
      : faviconEl(node.url, 18),
    el('span', { class: 'title', html: highlight(node.title || (isFolder ? 'Sin nombre' : domainOf(node.url)), tokens) }),
    showPath ? pathChip(node) : null,
    el('span', { class: 'domain', text: isFolder ? `${fmtNum(c.b)} ${c.b === 1 ? 'marcador' : 'marcadores'}` : domainOf(node.url) }),
    el('span', { class: 'date', text: timeAgo(node.dateAdded), title: fullDate(node.dateAdded) }),
    menuBtnEl('icon-btn sm row-menu'),
  );
}

const itemEls = () => $$('[data-id].card, [data-id].item-row', content);

// ============ Selección ============
function clearSelection({ silent = false } = {}) {
  state.selection.clear();
  state.anchorIndex = null;
  if (!silent) syncSelectionUI();
}

function toggleSelect(id) {
  if (state.selection.has(id)) state.selection.delete(id);
  else state.selection.add(id);
  state.anchorIndex = state.items.findIndex((n) => n.id === id);
  syncSelectionUI();
}

function rangeSelect(id) {
  const idx = state.items.findIndex((n) => n.id === id);
  if (state.anchorIndex == null || idx === -1) { toggleSelect(id); return; }
  const [a, b] = [Math.min(state.anchorIndex, idx), Math.max(state.anchorIndex, idx)];
  for (let i = a; i <= b; i++) state.selection.add(state.items[i].id);
  syncSelectionUI();
}

function selectAll() {
  for (const n of state.items) state.selection.add(n.id);
  syncSelectionUI();
}

function syncSelectionUI() {
  content.classList.toggle('selecting', state.selection.size > 0);
  for (const elm of itemEls()) elm.classList.toggle('selected', state.selection.has(elm.dataset.id));
  renderBulkbar();
}

function renderBulkbar() {
  const bar = $('#bulkbar');
  const n = state.selection.size;
  if (!n) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = '';
  const nodes = [...state.selection].map((id) => nodeById.get(id)).filter(Boolean);
  const urls = nodes.filter((x) => x.url).map((x) => x.url);
  const open = btnGhost('external', 'Abrir', () => openAll(urls));
  if (!urls.length) open.setAttribute('disabled', '');
  bar.append(
    el('span', { class: 'count', text: `${n} ${n === 1 ? 'seleccionado' : 'seleccionados'}` }),
    open,
    btnGhost('folder', 'Mover', () => modalMove([...state.selection])),
    btnGhost('copy', 'Copiar', () => copyText(urls.join('\n'), urls.length === 1 ? 'Enlace copiado' : `${urls.length} enlaces copiados`)),
    (() => { const b = el('button', { class: 'btn danger', html: svg('trash', 15) }, ' Eliminar'); b.addEventListener('click', () => deleteNodes([...state.selection])); return b; })(),
    el('button', { class: 'icon-btn', html: svg('x', 16), title: 'Deseleccionar (Esc)', onClick: () => clearSelection() }),
  );
}

// ============ Acciones ============
async function openAll(urls) {
  if (!urls.length) return;
  if (urls.length > 15) {
    const ok = await modalConfirm({
      title: `¿Abrir ${urls.length} pestañas?`,
      msg: 'Se van a abrir muchas pestañas a la vez.',
      confirmLabel: 'Abrir todas',
      danger: false,
    });
    if (!ok) return;
  }
  urls.forEach((u) => openUrl(u, { active: false }));
  toast(`${urls.length} ${urls.length === 1 ? 'pestaña abierta' : 'pestañas abiertas'}`, { icon: 'external' });
}

async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg, { icon: 'copy' }); }
  catch { toast('No se pudo copiar al portapapeles', { kind: 'err', icon: 'alert' }); }
}

async function moveNodesTo(ids, parentId, index) {
  const list = topLevelOnly(ids.filter((id) => nodeById.has(id)));
  if (!list.length) return;
  if (list.some((id) => isRootFolder(nodeById.get(id)))) {
    toast('Las carpetas principales no se pueden mover', { kind: 'err', icon: 'alert' });
    return;
  }
  const records = list.map((id) => {
    const n = nodeById.get(id);
    return { id, parentId: n.parentId, index: n.index ?? 0 };
  });
  const sameParentReorder = index != null;
  let pos = index;
  try {
    for (const id of list) {
      await bm.move(id, { parentId, ...(pos != null ? { index: pos++ } : {}) });
    }
  } catch (err) {
    toast(errMsg(err), { kind: 'err', icon: 'alert' });
    return;
  }
  clearSelection({ silent: true });
  if (!sameParentReorder || records.some((r) => r.parentId !== parentId)) {
    const dest = nodeById.get(parentId);
    toast(`${list.length === 1 ? 'Movido' : `${list.length} elementos movidos`} a “${dest?.title || 'carpeta'}”`, {
      icon: 'folder', actionLabel: 'Deshacer', onAction: () => undoMoves(records),
    });
  }
}

async function undoMoves(records) {
  const sorted = [...records].sort((a, b) => (a.parentId === b.parentId ? a.index - b.index : 0));
  try {
    for (const r of sorted) await bm.move(r.id, { parentId: r.parentId, index: r.index });
  } catch (err) { toast(errMsg(err), { kind: 'err', icon: 'alert' }); }
}

async function deleteNodes(ids, { skipConfirm = false } = {}) {
  const list = topLevelOnly(ids.filter((id) => nodeById.has(id)));
  if (!list.length) return;
  if (list.some((id) => isRootFolder(nodeById.get(id)))) {
    toast('Las carpetas principales no se pueden eliminar', { kind: 'err', icon: 'alert' });
    return;
  }
  const folders = list.filter((id) => !nodeById.get(id).url);
  if (folders.length && !skipConfirm) {
    const inside = folders.reduce((n, id) => n + (countsById.get(id)?.b || 0), 0);
    const single = list.length === 1 && folders.length === 1;
    const ok = await modalConfirm({
      title: single ? `¿Eliminar la carpeta “${nodeById.get(folders[0]).title || 'Sin nombre'}”?` : `¿Eliminar ${list.length} elementos?`,
      msg: inside
        ? `También se ${inside === 1 ? 'eliminará 1 marcador guardado' : `eliminarán ${fmtNum(inside)} marcadores guardados`} adentro. Vas a poder deshacerlo.`
        : 'Vas a poder deshacerlo desde el aviso.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
  }
  const records = [];
  try {
    for (const id of list) {
      const n = nodeById.get(id);
      const [sub] = await bm.getSubTree(id);
      records.push({ parentId: n.parentId, index: n.index ?? 0, sub });
    }
    records.sort((a, b) => (a.parentId === b.parentId ? a.index - b.index : 0));
    for (const id of list) {
      const n = nodeById.get(id);
      await (n.url ? bm.remove(id) : bm.removeTree(id));
    }
  } catch (err) {
    toast(errMsg(err), { kind: 'err', icon: 'alert' });
    return;
  }
  clearSelection({ silent: true });
  toast(list.length === 1 ? 'Eliminado' : `${list.length} elementos eliminados`, {
    icon: 'trash', kind: 'info', actionLabel: 'Deshacer', onAction: () => restoreRecords(records),
  });
}

async function restoreRecords(records) {
  try {
    for (const r of records) await recreate(r.sub, r.parentId, r.index);
    toast('Restaurado', { icon: 'undo' });
  } catch (err) { toast(errMsg(err), { kind: 'err', icon: 'alert' }); }
}

async function recreate(node, parentId, index) {
  if (node.url) {
    await bm.create({ parentId, ...(index != null ? { index } : {}), title: node.title, url: node.url });
    return;
  }
  const created = await bm.create({ parentId, ...(index != null ? { index } : {}), title: node.title });
  for (const c of node.children || []) await recreate(c, created.id, null);
}

// ============ Drag & drop ============
let draggingIds = null;
let dropTarget = null;
let dropMode = null;

const reorderAllowed = () => !searching() && state.view.type === 'folder' && state.sort === 'manual';

function clearDropMarkers() {
  for (const x of $$('.drop-into, .drop-marker')) x.classList.remove('drop-into', 'drop-marker', 'before', 'after');
  dropTarget = null;
  dropMode = null;
}

content.addEventListener('dragstart', (e) => {
  const item = e.target.closest?.('[data-id]');
  if (!item) return;
  const id = item.dataset.id;
  draggingIds = state.selection.has(id) && state.selection.size > 0 ? topLevelOnly([...state.selection]) : [id];
  e.dataTransfer.effectAllowed = 'move';
  try {
    e.dataTransfer.setData('text/plain', draggingIds.map((i) => nodeById.get(i)?.url || nodeById.get(i)?.title || '').join('\n'));
  } catch { /* */ }
  requestAnimationFrame(() => {
    for (const elm of itemEls()) if (draggingIds?.includes(elm.dataset.id)) elm.classList.add('dragging');
  });
});

content.addEventListener('dragend', () => {
  draggingIds = null;
  clearDropMarkers();
  for (const x of $$('.dragging', content)) x.classList.remove('dragging');
});

content.addEventListener('dragover', (e) => {
  if (!draggingIds) return;
  const item = e.target.closest?.('[data-id]');
  clearDropMarkers();
  if (!item || draggingIds.includes(item.dataset.id)) return;
  const node = nodeById.get(item.dataset.id);
  if (!node) return;
  const isFolder = !node.url;
  const canReorder = reorderAllowed();
  const rect = item.getBoundingClientRect();
  const horiz = state.layout === 'grid';
  const t = horiz ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height;
  let mode = null;
  if (isFolder && !draggingIds.some((id) => id === node.id || isDescendant(node.id, id))) {
    mode = canReorder ? (t < .28 ? 'before' : t > .72 ? 'after' : 'into') : 'into';
  } else if (canReorder) {
    mode = t < .5 ? 'before' : 'after';
  }
  if (!mode) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  dropTarget = item.dataset.id;
  dropMode = mode;
  if (mode === 'into') item.classList.add('drop-into');
  else item.classList.add('drop-marker', mode);
});

content.addEventListener('drop', (e) => {
  e.preventDefault();
  const ids = draggingIds;
  const target = dropTarget;
  const mode = dropMode;
  draggingIds = null;
  clearDropMarkers();
  if (!ids?.length || !target || !mode) return;
  if (mode === 'into') { moveNodesTo(ids, target, null); return; }
  reorderDrop(ids, target, mode === 'before');
});

async function reorderDrop(ids, targetId, before) {
  const parentId = state.view.folderId;
  try {
    const children = await bm.getChildren(parentId);
    const dragSet = new Set(ids);
    const order = children.map((c) => c.id).filter((id) => !dragSet.has(id));
    let pos = order.indexOf(targetId);
    if (pos === -1) pos = order.length;
    else if (!before) pos += 1;
    await moveNodesTo(ids, parentId, pos);
  } catch (err) { toast(errMsg(err), { kind: 'err', icon: 'alert' }); }
}

// ============ Menú contextual ============
let menuOpen = false;

function showMenu(x, y, items) {
  const menu = $('#ctxMenu');
  menu.innerHTML = '';
  for (const it of items) {
    if (it === '-') { menu.append(el('div', { class: 'menu-sep' })); continue; }
    if (it.title) { menu.append(el('div', { class: 'menu-title', text: it.title })); continue; }
    const b = el('button', {
      class: `menu-item${it.danger ? ' danger' : ''}`, role: 'menuitem',
      disabled: it.disabled ? true : null,
    },
      el('span', { class: 'icn', html: svg(it.icon || 'chevron', 16) }),
      el('span', { class: 'label', text: it.label }),
      it.hint ? el('span', { class: 'hint', text: it.hint }) : null,
      it.checked ? el('span', { class: 'icn', html: svg('check', 14) }) : null);
    b.addEventListener('click', () => { hideMenu(); it.onClick?.(); });
    menu.append(b);
  }
  menu.hidden = false;
  menuOpen = true;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
}

function hideMenu() {
  const menu = $('#ctxMenu');
  if (menu.hidden) return;
  menu.hidden = true;
  menuOpen = false;
}

function bookmarkMenuItems(node) {
  return [
    { label: 'Abrir en pestaña nueva', icon: 'external', onClick: () => openUrl(node.url) },
    { label: 'Abrir en segundo plano', icon: 'arrowUpRight', onClick: () => openUrl(node.url, { active: false }) },
    { label: 'Abrir en ventana nueva', icon: 'window', onClick: () => openInWindow(node.url) },
    '-',
    { label: 'Editar', icon: 'pen', hint: 'F2', onClick: () => modalBookmark(node) },
    { label: 'Copiar enlace', icon: 'copy', onClick: () => copyText(node.url, 'Enlace copiado') },
    { label: 'Mover a…', icon: 'folder', onClick: () => modalMove([node.id]) },
    '-',
    { label: 'Eliminar', icon: 'trash', danger: true, hint: 'Supr', onClick: () => deleteNodes([node.id]) },
  ];
}

function folderMenuItems(node) {
  const isRoot = isRootFolder(node);
  const c = countsById.get(node.id) || { b: 0 };
  return [
    { label: 'Abrir carpeta', icon: 'folderOpen', onClick: () => setView({ type: 'folder', folderId: node.id }) },
    { label: `Abrir todos (${fmtNum(c.b)})`, icon: 'external', disabled: !c.b, onClick: () => openAll(collectUrls(node)) },
    '-',
    { label: 'Nuevo marcador', icon: 'plus', onClick: () => modalBookmark(null, { parentId: node.id }) },
    { label: 'Nueva subcarpeta', icon: 'folderPlus', onClick: () => modalFolder(null, { parentId: node.id }) },
    '-',
    { label: 'Renombrar', icon: 'pen', disabled: isRoot, hint: 'F2', onClick: () => modalFolder(node) },
    { label: 'Mover a…', icon: 'folder', disabled: isRoot, onClick: () => modalMove([node.id]) },
    '-',
    { label: 'Eliminar', icon: 'trash', danger: true, disabled: isRoot, hint: 'Supr', onClick: () => deleteNodes([node.id]) },
  ];
}

function multiMenuItems() {
  const ids = [...state.selection];
  const urls = ids.map((id) => nodeById.get(id)).filter((n) => n?.url).map((n) => n.url);
  return [
    { title: `${ids.length} seleccionados` },
    { label: 'Abrir todos', icon: 'external', disabled: !urls.length, onClick: () => openAll(urls) },
    { label: 'Mover a…', icon: 'folder', onClick: () => modalMove(ids) },
    { label: 'Copiar enlaces', icon: 'copy', disabled: !urls.length, onClick: () => copyText(urls.join('\n'), `${urls.length} enlaces copiados`) },
    '-',
    { label: 'Eliminar', icon: 'trash', danger: true, onClick: () => deleteNodes(ids) },
    { label: 'Deseleccionar', icon: 'x', hint: 'Esc', onClick: () => clearSelection() },
  ];
}

function itemMenuItems(node) {
  if (state.selection.size > 1 && state.selection.has(node.id)) return multiMenuItems();
  return node.url ? bookmarkMenuItems(node) : folderMenuItems(node);
}

function backgroundMenuItems() {
  const parentId = state.view.folderId;
  return [
    { label: 'Nuevo marcador', icon: 'plus', onClick: () => modalBookmark(null, { parentId }) },
    { label: 'Nueva carpeta', icon: 'folderPlus', onClick: () => modalFolder(null, { parentId }) },
    '-',
    { label: 'Seleccionar todo', icon: 'check', hint: 'Ctrl+A', onClick: selectAll },
  ];
}

// ============ Modales ============
let currentModalClose = null;

function openModal({ title, submitLabel, danger = false, build, onSubmit, onClose }) {
  const root = $('#modalRoot');
  root.hidden = false;
  root.innerHTML = '';
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.hidden = true;
    root.innerHTML = '';
    currentModalClose = null;
    onClose?.();
  };
  currentModalClose = close;
  const form = el('form', { class: 'modal' });
  const body = el('div', { class: 'modal-body' });
  build(body, close);
  form.append(
    el('div', { class: 'modal-head' },
      el('h2', { text: title }),
      el('button', { type: 'button', class: 'icon-btn', html: svg('x', 16), title: 'Cerrar (Esc)', onClick: close })),
    body,
    el('div', { class: 'modal-foot' },
      el('button', { type: 'button', class: 'btn', text: 'Cancelar', onClick: close }),
      submitLabel ? el('button', { type: 'submit', class: `btn ${danger ? 'danger' : 'primary'}`, text: submitLabel }) : null),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await onSubmit?.();
    if (ok !== false) close();
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); form.requestSubmit(); }
  });
  root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
  root.append(form);
  setTimeout(() => body.querySelector('input, select')?.focus(), 30);
  return { close };
}

const modalOpen = () => currentModalClose != null;

function normalizeUrl(v) {
  if (!v) return null;
  try { return new URL(v).href; } catch { /* */ }
  try {
    const u = new URL('https://' + v);
    if (u.hostname.includes('.') || u.hostname === 'localhost') return u.href;
  } catch { /* */ }
  return null;
}

function currentFolderId() {
  if (state.view.type === 'folder' && state.view.folderId) return state.view.folderId;
  return rootFolders[1]?.id ?? rootFolders[0]?.id;
}

function folderSelect(selectedId, { excludeIds = [] } = {}) {
  const sel = el('select');
  const ex = new Set(excludeIds);
  (function walkF(nodes, depth) {
    for (const n of nodes) {
      if (n.url || ex.has(n.id)) continue;
      sel.append(el('option', { value: n.id, text: '   '.repeat(depth) + (n.title || 'Sin nombre') }));
      walkF(n.children || [], depth + 1);
    }
  })(rootFolders, 0);
  if (selectedId && sel.querySelector(`option[value="${CSS.escape(selectedId)}"]`)) sel.value = selectedId;
  return sel;
}

function modalBookmark(node, { parentId } = {}) {
  const isEdit = !!node;
  let nameI, urlI, folderS, urlField;
  openModal({
    title: isEdit ? 'Editar marcador' : 'Nuevo marcador',
    submitLabel: isEdit ? 'Guardar' : 'Agregar',
    build(body) {
      nameI = el('input', { type: 'text', value: node?.title ?? '', placeholder: 'Nombre del marcador' });
      urlI = el('input', { type: 'text', value: node?.url ?? '', placeholder: 'https://ejemplo.com', spellcheck: 'false' });
      urlI.addEventListener('input', () => urlField.classList.remove('invalid'));
      folderS = folderSelect(isEdit ? node.parentId : (parentId ?? currentFolderId()));
      urlField = el('div', { class: 'field' }, el('label', { text: 'URL' }), urlI, el('span', { class: 'err', text: 'Ingresa una dirección válida' }));
      body.append(
        el('div', { class: 'field' }, el('label', { text: 'Nombre' }), nameI),
        urlField,
        el('div', { class: 'field' }, el('label', { text: 'Carpeta' }), folderS),
      );
    },
    async onSubmit() {
      const url = normalizeUrl(urlI.value.trim());
      if (!url) { urlField.classList.add('invalid'); urlI.focus(); return false; }
      const title = nameI.value.trim() || domainOf(url);
      try {
        if (isEdit) {
          await bm.update(node.id, { title, url });
          if (folderS.value !== node.parentId) await bm.move(node.id, { parentId: folderS.value });
          toast('Marcador actualizado', { icon: 'check' });
        } else {
          await bm.create({ parentId: folderS.value, title, url });
          toast('Marcador agregado', { icon: 'bookmark' });
        }
      } catch (err) { toast(errMsg(err), { kind: 'err', icon: 'alert' }); }
    },
  });
}

function modalFolder(node, { parentId } = {}) {
  const isEdit = !!node;
  let nameI, parentS, nameField;
  openModal({
    title: isEdit ? 'Renombrar carpeta' : 'Nueva carpeta',
    submitLabel: isEdit ? 'Guardar' : 'Crear',
    build(body) {
      nameI = el('input', { type: 'text', value: node?.title ?? '', placeholder: 'Nombre de la carpeta' });
      nameI.addEventListener('input', () => nameField.classList.remove('invalid'));
      nameField = el('div', { class: 'field' }, el('label', { text: 'Nombre' }), nameI, el('span', { class: 'err', text: 'Escribe un nombre' }));
      body.append(nameField);
      if (!isEdit) {
        parentS = folderSelect(parentId ?? currentFolderId());
        body.append(el('div', { class: 'field' }, el('label', { text: 'Dentro de' }), parentS));
      }
    },
    async onSubmit() {
      const title = nameI.value.trim();
      if (!title) { nameField.classList.add('invalid'); nameI.focus(); return false; }
      try {
        if (isEdit) { await bm.update(node.id, { title }); toast('Carpeta renombrada', { icon: 'check' }); }
        else {
          const created = await bm.create({ parentId: parentS.value, title });
          state.expanded.add(parentS.value);
          savePref('mp-expanded', [...state.expanded]);
          toast('Carpeta creada', { icon: 'folderPlus', actionLabel: 'Abrir', onAction: () => setView({ type: 'folder', folderId: created.id }) });
        }
      } catch (err) { toast(errMsg(err), { kind: 'err', icon: 'alert' }); }
    },
  });
}

function modalMove(ids) {
  const list = topLevelOnly(ids.filter((id) => nodeById.has(id)));
  if (!list.length) return;
  const excluded = new Set(list.filter((id) => !nodeById.get(id).url));
  const inExcluded = (id) => {
    if (excluded.has(id)) return true;
    for (const ex of excluded) if (isDescendant(id, ex)) return true;
    return false;
  };
  let picked = null;
  let pickedRow = null;
  const localExpanded = new Set(rootFolders.map((f) => f.id));
  const single = list.length === 1 ? nodeById.get(list[0]) : null;

  openModal({
    title: single ? `Mover “${single.title || 'Sin nombre'}”` : `Mover ${list.length} elementos`,
    submitLabel: 'Mover acá',
    build(body) {
      const pickWrap = el('div', { class: 'folder-pick' });
      const render = () => {
        pickWrap.innerHTML = '';
        const build = (folder, depth) => {
          const subs = (folder.children || []).filter((c) => !c.url);
          const disabled = inExcluded(folder.id);
          const isOpen = localExpanded.has(folder.id);
          const row = el('div', {
            class: `tree-row${picked === folder.id ? ' picked' : ''}`,
            'aria-disabled': disabled ? 'true' : null,
            style: `padding-left:${6 + depth * 14}px`,
          });
          const twist = el('button', { type: 'button', class: `twist${isOpen ? ' open' : ''}${subs.length ? '' : ' leaf'}`, html: svg('chevron', 13) });
          twist.addEventListener('click', (e) => {
            e.stopPropagation();
            if (localExpanded.has(folder.id)) localExpanded.delete(folder.id); else localExpanded.add(folder.id);
            render();
          });
          row.append(twist, el('span', { class: 'icn', html: svg('folder', 15) }), el('span', { class: 'label', text: folder.title || 'Sin nombre' }));
          row.addEventListener('click', () => {
            picked = folder.id;
            pickedRow?.classList.remove('picked');
            row.classList.add('picked');
            pickedRow = row;
          });
          pickWrap.append(row);
          if (isOpen) for (const s of subs) build(s, depth + 1);
        };
        for (const r of rootFolders) build(r, 0);
      };
      render();
      body.append(el('p', { class: 'msg', text: 'Elige la carpeta de destino:' }), pickWrap);
    },
    async onSubmit() {
      if (!picked) { toast('Elige una carpeta de destino', { kind: 'info', icon: 'info' }); return false; }
      await moveNodesTo(list, picked, null);
    },
  });
}

function modalConfirm({ title, msg, confirmLabel = 'Eliminar', danger = true }) {
  return new Promise((resolve) => {
    openModal({
      title, submitLabel: confirmLabel, danger,
      build(body) { if (msg) body.append(el('p', { class: 'msg', text: msg })); },
      onSubmit() { resolve(true); },
      onClose() { resolve(false); },
    });
  });
}

// ============ Toasts ============
function toast(msg, { icon: ic = 'check', kind = 'ok', actionLabel, onAction, duration } = {}) {
  const wrap = $('#toasts');
  const t = el('div', { class: 'toast' },
    el('span', { class: `icn ${kind}`, html: svg(ic, 17) }),
    el('span', { class: 'msg', text: msg }));
  const dismiss = () => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 160);
  };
  if (actionLabel) {
    const a = el('button', { class: 'action', text: actionLabel });
    a.addEventListener('click', () => { onAction?.(); dismiss(); });
    t.append(a);
  }
  wrap.append(t);
  while (wrap.children.length > 4) wrap.firstChild.remove();
  setTimeout(dismiss, duration ?? (actionLabel ? 7000 : 3200));
}

// ============ Eventos de contenido ============
content.addEventListener('click', (e) => {
  const item = e.target.closest('[data-id]');
  if (!item) {
    if (state.selection.size && !e.target.closest('button')) clearSelection();
    return;
  }
  const node = nodeById.get(item.dataset.id);
  if (!node) return;
  const menuBtn = e.target.closest('.card-menu, .row-menu');
  if (menuBtn) {
    const r = menuBtn.getBoundingClientRect();
    showMenu(r.right - 210, r.bottom + 4, itemMenuItems(node));
    return;
  }
  if (e.target.closest('.sel-check')) { toggleSelect(node.id); return; }
  if (e.shiftKey) { rangeSelect(node.id); return; }
  if (e.ctrlKey || e.metaKey) { toggleSelect(node.id); return; }
  if (state.selection.size) { toggleSelect(node.id); return; }
  openItem(node);
});

content.addEventListener('auxclick', (e) => {
  if (e.button !== 1) return;
  const item = e.target.closest('[data-id]');
  if (!item) return;
  const node = nodeById.get(item.dataset.id);
  if (node?.url) { e.preventDefault(); openUrl(node.url, { active: false }); }
});

content.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const item = e.target.closest('[data-id]');
  if (item) {
    const node = nodeById.get(item.dataset.id);
    if (node) showMenu(e.clientX, e.clientY, itemMenuItems(node));
  } else if (!searching() && state.view.type === 'folder') {
    showMenu(e.clientX, e.clientY, backgroundMenuItems());
  }
});

content.addEventListener('keydown', (e) => {
  const item = e.target.closest?.('[data-id]');
  if (!item) return;
  const node = nodeById.get(item.dataset.id);
  if (!node) return;
  if (e.key === 'Enter') { e.preventDefault(); openItem(node); }
  else if (e.key === ' ') { e.preventDefault(); toggleSelect(node.id); }
});

content.addEventListener('scroll', hideMenu, { passive: true });

// ============ Teclado global ============
function focusSearch() {
  searchInput.focus();
  searchInput.select();
}

function moveFocus(delta) {
  const els = itemEls();
  if (!els.length) return;
  const cur = els.indexOf(document.activeElement);
  let next = cur === -1 ? 0 : cur + delta;
  next = Math.max(0, Math.min(els.length - 1, next));
  els[next].focus();
  els[next].scrollIntoView({ block: 'nearest' });
}

function gridColumns() {
  if (state.layout !== 'grid') return 1;
  const els = itemEls();
  if (els.length < 2) return 1;
  const top = els[0].offsetTop;
  let c = 1;
  while (c < els.length && els[c].offsetTop === top) c++;
  return c;
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSearch(); return; }
  if (e.key === 'Escape') {
    if (menuOpen) { hideMenu(); return; }
    if (modalOpen()) { currentModalClose(); return; }
    if (document.activeElement === searchInput && searchInput.value) { setQuery(''); return; }
    if (state.selection.size) { clearSelection(); return; }
    if (searching()) { setQuery(''); return; }
    return;
  }
  if (modalOpen()) return;
  const inInput = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if (inInput) {
    if (e.target === searchInput && e.key === 'Enter' && state.items.length) {
      openItem(state.items[0]);
    }
    if (e.target === searchInput && e.key === 'ArrowDown' && state.items.length) {
      e.preventDefault();
      itemEls()[0]?.focus();
    }
    return;
  }
  if (e.key === '/') { e.preventDefault(); focusSearch(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
  if (e.key === 'Delete') {
    const focused = document.activeElement?.closest?.('[data-id]');
    const ids = state.selection.size ? [...state.selection] : (focused ? [focused.dataset.id] : []);
    if (ids.length) deleteNodes(ids);
    return;
  }
  if (e.key === 'F2') {
    const focused = document.activeElement?.closest?.('[data-id]');
    const id = state.selection.size === 1 ? [...state.selection][0] : focused?.dataset.id;
    const n = id && nodeById.get(id);
    if (n) { n.url ? modalBookmark(n) : modalFolder(n); }
    return;
  }
  if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
    if (!itemEls().length) return;
    e.preventDefault();
    const cols = gridColumns();
    moveFocus(e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? cols : -cols);
  }
});

// cierre del menú contextual
document.addEventListener('click', (e) => {
  if (menuOpen && !e.target.closest('#ctxMenu')) { e.preventDefault(); e.stopPropagation(); hideMenu(); }
}, true);
window.addEventListener('blur', hideMenu);
window.addEventListener('resize', hideMenu);

// ============ Topbar ============
function applyLayoutBtn() {
  $('#btnLayout').innerHTML = svg(state.layout === 'grid' ? 'list' : 'grid', 17);
  $('#btnLayout').title = state.layout === 'grid' ? 'Ver como lista' : 'Ver como cuadrícula';
}
function applyThemeBtn() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#btnTheme').innerHTML = svg(dark ? 'sun' : 'moon', 17);
  $('#btnTheme').title = dark ? 'Tema claro' : 'Tema oscuro';
}
function applySortBtn() {
  const cur = SORTS.find((s) => s.id === state.sort) || SORTS[0];
  const b = $('#btnSort');
  b.innerHTML = `${svg('sort', 15)}<span>${cur.label}</span>${svg('chevron', 12)}`;
  b.querySelector('svg:last-child').style.transform = 'rotate(90deg)';
}

$('#btnLayout').addEventListener('click', () => {
  state.layout = state.layout === 'grid' ? 'list' : 'grid';
  savePref('mp-layout', state.layout);
  applyLayoutBtn();
  renderContent();
});

$('#btnTheme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('mp-theme', next); } catch { /* */ }
  applyThemeBtn();
});

$('#btnSort').addEventListener('click', () => {
  const r = $('#btnSort').getBoundingClientRect();
  showMenu(r.left, r.bottom + 6, SORTS.map((s) => ({
    label: s.label,
    icon: s.id === state.sort ? 'check' : 'sort',
    checked: false,
    onClick: () => {
      state.sort = s.id;
      savePref('mp-sort', s.id);
      applySortBtn();
      renderContent();
    },
  })));
});

$('#btnAdd').addEventListener('click', () => {
  const r = $('#btnAdd').getBoundingClientRect();
  showMenu(r.right - 210, r.bottom + 6, [
    { label: 'Nuevo marcador', icon: 'plus', onClick: () => modalBookmark(null, {}) },
    { label: 'Nueva carpeta', icon: 'folderPlus', onClick: () => modalFolder(null, {}) },
  ]);
});

$('#btnTreeNewFolder').addEventListener('click', () => modalFolder(null, {}));

searchInput.addEventListener('input', debounce(() => setQuery(searchInput.value, { fromInput: true }), 120));
$('#btnClearSearch').addEventListener('click', () => { setQuery(''); searchInput.focus(); });

// sidebar móvil
function closeSidebarMobile() {
  $('#app').classList.remove('sidebar-open');
  $('#sidebarBackdrop').hidden = true;
}
$('#btnSidebar').addEventListener('click', () => {
  const open = $('#app').classList.toggle('sidebar-open');
  $('#sidebarBackdrop').hidden = !open;
});
$('#sidebarBackdrop').addEventListener('click', closeSidebarMobile);

// tip de bienvenida
function renderTip() {
  if (state.tipDismissed) return;
  const tip = $('#tipbar');
  tip.hidden = false;
  tip.append(
    el('span', { class: 'icn', html: svg('sparkles', 16) }),
    el('span', { html: 'Consejo: <kbd>Ctrl</kbd> <kbd>K</kbd> para buscar al instante, arrastra para organizar y clic derecho para ver todas las opciones.' }),
    el('button', { class: 'icon-btn', html: svg('x', 14), title: 'Cerrar', onClick: () => { tip.hidden = true; state.tipDismissed = true; savePref('mp-tip-dismissed', true); } }),
  );
}

// ============ Init ============
async function init() {
  $('#btnSidebar').innerHTML = svg('menu', 18);
  $('#btnTreeNewFolder').innerHTML = svg('plus', 14);
  $('#btnClearSearch').innerHTML = svg('x', 14);
  $('#searchWrap .search-icn').innerHTML = svg('search', 16);
  $('#btnAdd').innerHTML = `${svg('plus', 16)}<span>Agregar</span>`;
  applyLayoutBtn();
  applyThemeBtn();
  applySortBtn();
  renderTip();

  const params = new URLSearchParams(location.search);
  if (params.get('folder')) state.view = { type: 'folder', folderId: params.get('folder') };
  const q = params.get('q');

  await refresh();

  if (state.expanded.size === 0) {
    for (const f of rootFolders) state.expanded.add(f.id);
    savePref('mp-expanded', [...state.expanded]);
    renderTree();
  }
  if (q) { searchInput.value = q; setQuery(q); }

  bm.onAny(debounce(refresh, 250));

  if (IS_EXT && chrome.runtime?.sendMessage) {
    try { chrome.runtime.sendMessage({ type: 'manager-ready' }).catch(() => {}); } catch { /* */ }
  }
}

init();
