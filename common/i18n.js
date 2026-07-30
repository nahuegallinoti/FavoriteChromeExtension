const LANG_KEY = 'mmt-language';

const STATIC = {
  en: {
    appTitle: 'Mark My Tabs',
    views: 'Views',
    folders: 'Folders',
    newFolder: 'New folder',
    showFolders: 'Show folders',
    searchBookmarks: 'Search your bookmarks…',
    sort: 'Sort',
    clearSearch: 'Clear (Esc)',
    collapseFolders: 'Collapse folders',
    saveBookmark: 'Save bookmark',
    newBookmark: 'New bookmark',
    name: 'Name',
    folder: 'Folder',
    folderNamePlaceholder: 'New folder name',
    create: 'Create',
    remove: 'Remove',
    cancel: 'Cancel',
    save: 'Save',
  },
  es: {
    appTitle: 'Mark My Tabs',
    views: 'Vistas',
    folders: 'Carpetas',
    newFolder: 'Nueva carpeta',
    showFolders: 'Mostrar carpetas',
    searchBookmarks: 'Buscar en tus marcadores…',
    sort: 'Ordenar',
    clearSearch: 'Limpiar (Esc)',
    collapseFolders: 'Contraer carpetas',
    saveBookmark: 'Guardar marcador',
    newBookmark: 'Nuevo marcador',
    name: 'Nombre',
    folder: 'Carpeta',
    folderNamePlaceholder: 'Nombre de la nueva carpeta',
    create: 'Crear',
    remove: 'Quitar',
    cancel: 'Cancelar',
    save: 'Guardar',
  },
};

export function getLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* localStorage may be unavailable */ }
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function getLocale() {
  return getLang() === 'es' ? 'es-ES' : 'en-US';
}

export function tr(en, es) {
  return getLang() === 'es' ? es : en;
}

export function setLang(lang) {
  const next = lang === 'es' ? 'es' : 'en';
  try { localStorage.setItem(LANG_KEY, next); } catch { /* */ }
  document.documentElement.lang = next;
  window.dispatchEvent(new CustomEvent('mmt-language-change', { detail: next }));
}

export function toggleLang() {
  setLang(getLang() === 'en' ? 'es' : 'en');
}

export function applyI18n(root = document) {
  const lang = getLang();
  const values = STATIC[lang];
  document.documentElement.lang = lang;
  for (const node of root.querySelectorAll('[data-i18n]')) {
    const value = values[node.dataset.i18n];
    if (value != null) node.textContent = value;
  }
  for (const node of root.querySelectorAll('[data-i18n-placeholder]')) {
    const value = values[node.dataset.i18nPlaceholder];
    if (value != null) node.setAttribute('placeholder', value);
  }
  for (const node of root.querySelectorAll('[data-i18n-title]')) {
    const value = values[node.dataset.i18nTitle];
    if (value != null) node.setAttribute('title', value);
  }
  for (const node of root.querySelectorAll('[data-i18n-aria-label]')) {
    const value = values[node.dataset.i18nAriaLabel];
    if (value != null) node.setAttribute('aria-label', value);
  }
  document.title = values.appTitle;
}

export function languageButtonText() {
  return getLang() === 'en' ? 'ES' : 'EN';
}

export function languageButtonTitle() {
  return getLang() === 'en' ? 'Cambiar a español' : 'Switch to English';
}
