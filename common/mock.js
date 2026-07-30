import { tr } from './i18n.js';

// Simulated chrome.bookmarks API for local UI development.
// Implementa la misma interfaz que el wrapper real (promesas + eventos).

export function createMockBookmarks() {
  let nextId = 100;
  const DAY = 86400000;
  const now = Date.now();

  const bk = (title, url, days) => ({ id: String(nextId++), title, url, dateAdded: now - days * DAY });
  const fd = (title, days, children = []) => ({ id: String(nextId++), title, dateAdded: now - days * DAY, children });

  const root = {
    id: '0', title: '',
    children: [
      fd(tr('Bookmarks bar', 'Barra de marcadores'), 900, [
        bk('GitHub', 'https://github.com', 400),
        bk('YouTube', 'https://www.youtube.com', 380),
        bk('Gmail', 'https://mail.google.com', 500),
        fd('Dev', 300, [
          bk('MDN Web Docs — JavaScript', 'https://developer.mozilla.org/es/docs/Web/JavaScript', 200),
          bk('Stack Overflow', 'https://stackoverflow.com', 290),
          bk('Can I use…', 'https://caniuse.com', 150),
          bk('npm', 'https://www.npmjs.com', 140),
          bk(tr('TypeScript: Documentation', 'TypeScript: Documentación'), 'https://www.typescriptlang.org/docs/', 90),
          bk('CSS-Tricks', 'https://css-tricks.com', 60),
          bk('Regex101', 'https://regex101.com', 30),
        ]),
        fd(tr('Design', 'Diseño'), 250, [
          bk(tr('Dribbble — Inspiration', 'Dribbble — Inspiración'), 'https://dribbble.com', 220),
          bk('Figma', 'https://www.figma.com', 210),
          bk('Coolors — Paletas de colores', 'https://coolors.co', 100),
          bk('Google Fonts', 'https://fonts.google.com', 95),
        ]),
        fd(tr('News', 'Noticias'), 200, [
          bk('Hacker News', 'https://news.ycombinator.com', 190),
          bk('Reddit — r/programming', 'https://www.reddit.com/r/programming/', 120),
        ]),
      ]),
      fd(tr('Other bookmarks', 'Otros marcadores'), 900, [
        bk('Netflix', 'https://www.netflix.com', 320),
        bk('Spotify Web', 'https://open.spotify.com', 280),
        bk('Wikipedia', 'https://es.wikipedia.org', 260),
        bk('GitHub', 'https://github.com', 45),
        bk(tr('Google Translate', 'Traductor de Google'), 'https://translate.google.com', 15),
        bk('ChatGPT', 'https://chatgpt.com', 10),
        bk('Claude', 'https://claude.ai', 8),
        fd(tr('Recipes', 'Recetas'), 180, [
          bk(tr('Paulina Cocina — Homemade gnocchi', 'Paulina Cocina — Ñoquis caseros'), 'https://www.paulinacocina.net/noquis-caseros', 170),
          bk(tr('Baked milanesa recipes', 'Recetas de milanesas al horno'), 'https://cookpad.com/ar/buscar/milanesas', 160),
          bk('MDN Web Docs — JavaScript', 'https://developer.mozilla.org/es/docs/Web/JavaScript', 5),
        ]),
        fd(tr('Travel', 'Viajes'), 150, [
          bk('Google Maps', 'https://maps.google.com', 140),
          bk('Booking.com', 'https://www.booking.com', 130),
          fd('Bariloche 2026', 20, [
            bk('Cerro Catedral', 'https://www.catedralaltapatagonia.com', 18),
          ]),
        ]),
        bk('Hacker News', 'https://news.ycombinator.com', 2),
      ]),
    ],
  };

  const listeners = [];
  let emitTimer = null;
  function emit() {
    clearTimeout(emitTimer);
    emitTimer = setTimeout(() => listeners.forEach((cb) => cb()), 10);
  }

  function findNode(id, node = root, parent = null) {
    if (node.id === id) return { node, parent };
    for (const c of node.children || []) {
      const r = findNode(id, c, node);
      if (r) return r;
    }
    return null;
  }

  function toResult(node, parent, index) {
    const out = { id: node.id, title: node.title, dateAdded: node.dateAdded };
    if (parent) out.parentId = parent.id;
    if (index != null) out.index = index;
    if (node.url) out.url = node.url;
    return out;
  }

  function cloneTree(node, parent = null, index = null) {
    const out = toResult(node, parent, index);
    if (!node.url) out.children = (node.children || []).map((c, i) => cloneTree(c, node, i));
    return out;
  }

  function flatten(node, acc = []) {
    for (const c of node.children || []) {
      if (c.url) acc.push(c);
      else flatten(c, acc);
    }
    return acc;
  }

  return {
    isMock: true,
    getTree: async () => [cloneTree(root)],
    getSubTree: async (id) => {
      const r = findNode(id);
      if (!r) throw new Error(tr('Not found', 'No encontrado'));
      const { parent } = r;
      const idx = parent ? parent.children.indexOf(r.node) : null;
      return [cloneTree(r.node, parent, idx)];
    },
    getChildren: async (id) => {
      const r = findNode(id);
      if (!r || r.node.url) throw new Error(tr('Not found', 'No encontrado'));
      return (r.node.children || []).map((c, i) => toResult(c, r.node, i));
    },
    getRecent: async (n) => {
      return flatten(root)
        .slice()
        .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
        .slice(0, n)
        .map((c) => {
          const { parent } = findNode(c.id);
          return toResult(c, parent, parent.children.indexOf(c));
        });
    },
    create: async ({ parentId, index, title = '', url }) => {
      const r = findNode(parentId || '2');
      if (!r || r.node.url) throw new Error(tr('Invalid folder', 'Carpeta inválida'));
      const node = { id: String(nextId++), title, dateAdded: Date.now() };
      if (url) node.url = url; else node.children = [];
      const arr = r.node.children;
      const i = index == null ? arr.length : Math.max(0, Math.min(index, arr.length));
      arr.splice(i, 0, node);
      emit();
      return toResult(node, r.node, i);
    },
    update: async (id, changes) => {
      const r = findNode(id);
      if (!r) throw new Error(tr('Not found', 'No encontrado'));
      if (changes.title != null) r.node.title = changes.title;
      if (changes.url != null && r.node.url) r.node.url = changes.url;
      emit();
      return toResult(r.node, r.parent, r.parent?.children.indexOf(r.node));
    },
    move: async (id, { parentId, index }) => {
      const r = findNode(id);
      if (!r || !r.parent) throw new Error(tr('Not found', 'No encontrado'));
      const destId = parentId || r.parent.id;
      const dest = findNode(destId);
      if (!dest || dest.node.url) throw new Error(tr('Invalid destination', 'Destino inválido'));
      // evitar mover una carpeta dentro de sí misma
      let p = dest.node;
      while (p) {
        if (p.id === id) throw new Error(tr('Circular move', 'Movimiento circular'));
        p = findNode(p.id)?.parent;
      }
      const oldArr = r.parent.children;
      oldArr.splice(oldArr.indexOf(r.node), 1);
      const arr = dest.node.children;
      const i = index == null ? arr.length : Math.max(0, Math.min(index, arr.length));
      arr.splice(i, 0, r.node);
      emit();
      return toResult(r.node, dest.node, i);
    },
    remove: async (id) => {
      const r = findNode(id);
      if (!r || !r.parent) throw new Error(tr('Not found', 'No encontrado'));
      if (r.node.children?.length) throw new Error(tr('The folder is not empty', 'La carpeta no está vacía'));
      r.parent.children.splice(r.parent.children.indexOf(r.node), 1);
      emit();
    },
    removeTree: async (id) => {
      const r = findNode(id);
      if (!r || !r.parent) throw new Error(tr('Not found', 'No encontrado'));
      r.parent.children.splice(r.parent.children.indexOf(r.node), 1);
      emit();
    },
    onAny(cb) { listeners.push(cb); },
  };
}
