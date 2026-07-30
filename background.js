const MANAGER_URL = chrome.runtime.getURL('manager/manager.html');

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.tabs.create({ url: MANAGER_URL });
});

// Reutiliza la pestaña del administrador si ya está abierta, si no crea una nueva
async function openManager() {
  try {
    const { managerTabId } = await chrome.storage.session.get('managerTabId');
    if (managerTabId != null) {
      const tab = await chrome.tabs.get(managerTabId);
      if (tab && tab.url && tab.url.startsWith(MANAGER_URL)) {
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return;
      }
    }
  } catch (e) { /* la pestaña ya no existe */ }
  chrome.tabs.create({ url: MANAGER_URL });
}

// Abre el diálogo de guardar/editar marcador para la pestaña actual,
// centrado sobre la ventana del navegador. Si ya había uno abierto, lo reemplaza.
async function openSaveDialog() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  const { saveWinId } = await chrome.storage.session.get('saveWinId');
  if (saveWinId != null) {
    try { await chrome.windows.remove(saveWinId); } catch (e) { /* ya cerrada */ }
  }
  const params = new URLSearchParams({ url: tab.url, title: tab.title || '', tabId: String(tab.id ?? '') });
  const cur = await chrome.windows.getCurrent();
  const width = 420, height = 390;
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('save/save.html') + '?' + params.toString(),
    type: 'popup',
    width, height,
    left: Math.max(0, Math.round((cur.left ?? 0) + ((cur.width ?? width) - width) / 2)),
    top: Math.max(0, Math.round((cur.top ?? 0) + ((cur.height ?? height) - height) / 3)),
  });
  chrome.storage.session.set({ saveWinId: win.id });
}

function flashBadge(tabId, text, color) {
  chrome.action.setBadgeBackgroundColor({ color, tabId }).catch(() => {});
  chrome.action.setBadgeTextColor({ color: '#ffffff', tabId }).catch(() => {});
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }).catch(() => {}), 1800);
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-manager') openManager();
  if (command === 'save-current') openSaveDialog();
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'manager-ready' && sender.tab) {
    chrome.storage.session.set({ managerTabId: sender.tab.id });
  }
  if (msg?.type === 'open-manager') openManager();
  if (msg?.type === 'flash-badge' && msg.tabId != null) {
    if (msg.kind === 'saved') flashBadge(msg.tabId, '✓', '#22c55e');
    if (msg.kind === 'removed') flashBadge(msg.tabId, '✕', '#6b7280');
  }
});
