import { $, el, svg, faviconEl, domainOf, bm, IS_EXT } from '../common/utils.js';

const params = new URLSearchParams(location.search);
const pageUrl = params.get('url') || 'https://ejemplo.dev/articulo';
const pageTitle = params.get('title') || '';
const tabId = Number(params.get('tabId')) || null;

const nameI = $('#name');
const folderS = $('#folder');

let existing = null;
let rootFolders = [];

function findByUrl(node, url) {
  if (node.url === url) return node;
  for (const c of node.children || []) {
    const r = findByUrl(c, url);
    if (r) return r;
  }
  return null;
}

function fillFolders(selectedId) {
  folderS.innerHTML = '';
  (function walk(nodes, depth) {
    for (const n of nodes) {
      if (n.url) continue;
      folderS.append(el('option', { value: n.id, text: '   '.repeat(depth) + (n.title || 'Sin nombre') }));
      walk(n.children || [], depth + 1);
    }
  })(rootFolders, 0);
  if (selectedId && folderS.querySelector(`option[value="${CSS.escape(selectedId)}"]`)) {
    folderS.value = selectedId;
  }
}

function notifyBadge(kind) {
  if (!IS_EXT || tabId == null || !chrome.runtime?.sendMessage) return;
  try { chrome.runtime.sendMessage({ type: 'flash-badge', tabId, kind }).catch(() => {}); } catch { /* */ }
}

function done() {
  window.close();
}

async function init() {
  $('#btnNewFolder').innerHTML = svg('folderPlus', 16);
  $('#pageFav').append(faviconEl(pageUrl, 20));
  $('#pageUrl').textContent = pageUrl;
  $('#pageUrl').title = pageUrl;

  const [root] = await bm.getTree();
  rootFolders = root.children || [];
  existing = findByUrl(root, pageUrl);

  let selected;
  if (existing) {
    document.title = 'Editar marcador';
    $('#dlgTitle').textContent = 'Editar marcador';
    $('#btnRemove').hidden = false;
    nameI.value = existing.title || '';
    selected = existing.parentId;
  } else {
    nameI.value = pageTitle || domainOf(pageUrl);
    if (IS_EXT && chrome.storage?.local) {
      selected = (await chrome.storage.local.get('lastSaveFolder')).lastSaveFolder;
    }
    selected = selected ?? rootFolders[0]?.id;
  }
  fillFolders(selected);

  nameI.focus();
  nameI.select();
}

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = nameI.value.trim() || domainOf(pageUrl);
  try {
    if (existing) {
      await bm.update(existing.id, { title });
      if (folderS.value !== existing.parentId) await bm.move(existing.id, { parentId: folderS.value });
    } else {
      await bm.create({ parentId: folderS.value, title, url: pageUrl });
    }
    if (IS_EXT && chrome.storage?.local) chrome.storage.local.set({ lastSaveFolder: folderS.value });
    notifyBadge('saved');
  } catch { /* la ventana se cierra igual */ }
  done();
});

// crear carpeta nueva dentro de la carpeta seleccionada
const newFolderRow = $('#newFolderRow');
const newFolderName = $('#newFolderName');

$('#btnNewFolder').addEventListener('click', () => {
  newFolderRow.hidden = !newFolderRow.hidden;
  if (!newFolderRow.hidden) { newFolderName.value = ''; newFolderName.focus(); }
});

async function createFolder() {
  const title = newFolderName.value.trim();
  if (!title) { newFolderName.focus(); return; }
  try {
    const created = await bm.create({ parentId: folderS.value, title });
    const [root] = await bm.getTree();
    rootFolders = root.children || [];
    fillFolders(created.id);
    newFolderRow.hidden = true;
    nameI.focus();
  } catch { /* */ }
}
$('#btnCreateFolder').addEventListener('click', createFolder);

$('#form').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  e.preventDefault();
  if (e.target === newFolderName) createFolder();
  else $('#form').requestSubmit();
});

$('#btnRemove').addEventListener('click', async () => {
  try {
    if (existing) await bm.remove(existing.id);
    notifyBadge('removed');
  } catch { /* */ }
  done();
});

$('#btnCancel').addEventListener('click', done);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!newFolderRow.hidden) { newFolderRow.hidden = true; nameI.focus(); }
  else done();
});

init();
