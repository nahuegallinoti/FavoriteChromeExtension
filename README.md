# Marcadores Pro

Administrador de marcadores para Chrome: rápido, elegante y fácil de usar. Reemplaza al administrador nativo con búsqueda instantánea, organización con arrastrar y soltar, detección de duplicados y modo oscuro.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue) ![Sin dependencias](https://img.shields.io/badge/dependencias-0-green)

## Instalación

1. Abre `chrome://extensions` en Chrome.
2. Activa el **Modo de desarrollador** (arriba a la derecha).
3. Haz clic en **Cargar descomprimida** y elige esta carpeta.
4. Listo: se abre el administrador automáticamente. Fija el ícono en la barra para tener el buscador rápido a mano.

## Funciones

### Administrador (página completa)
- **Búsqueda instantánea** sobre títulos y URLs, tolerante a acentos (`diseno` encuentra «Diseño»), con resaltado de coincidencias y ruta de carpeta en cada resultado.
- **Árbol de carpetas** con contadores, expandir/contraer y menú contextual (renombrar, mover, eliminar, abrir todos…).
- **Vistas**: carpeta actual, Todos los marcadores, Recientes (agrupados por fecha) y **Duplicados** con limpieza en un clic.
- **Cuadrícula o lista**, orden personalizado, por nombre o por fecha.
- **Arrastrar y soltar**: reordena dentro de una carpeta o suelta sobre cualquier carpeta del árbol (con expansión automática al mantener).
- **Selección múltiple** (Ctrl+clic, Shift+clic, Ctrl+A) con barra de acciones: abrir, mover, copiar enlaces, eliminar.
- **Deshacer** cualquier eliminación o movimiento desde el aviso.
- **Tema claro/oscuro** (detecta el del sistema, se puede alternar).
- Todo editable: crear/editar marcadores y carpetas, con validación de URL.

### Popup (clic en el ícono)
- **Árbol de carpetas explorable**: expande y navega tus carpetas sin salir del popup; recuerda qué carpetas dejaste abiertas y hasta dónde habías scrolleado.
- Buscador con navegación completa por teclado: `↑ ↓` moverse, `→ ←` expandir/contraer carpetas, `Enter` abrir.
- Guardar/quitar la página actual con un clic en la estrella.
- Botón para contraer todas las carpetas y acceso directo al administrador.

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `Alt+B` | Abrir el administrador desde cualquier pestaña |
| `Alt+M` | Guardar la pestaña actual en marcadores (o quitarla si ya estaba); el ícono muestra ✓/✕ |
| `Ctrl+K` o `/` | Enfocar el buscador |
| `↑ ↓ ← →` | Navegar entre elementos |
| `Enter` | Abrir el elemento enfocado |
| `Espacio` | Seleccionar/deseleccionar |
| `Ctrl+A` | Seleccionar todo |
| `F2` | Editar el elemento enfocado |
| `Supr` | Eliminar (con opción de deshacer) |
| `Esc` | Cerrar menú/modal, limpiar selección o búsqueda |

> Si `Alt+B` o `Alt+M` no funcionan, otro programa puede estar usándolos: cámbialos en `chrome://extensions/shortcuts`.

## Desarrollo

No hay build ni dependencias: JavaScript vanilla + Manifest V3.

```
manifest.json        configuración de la extensión
background.js        service worker (atajo Alt+B, pestaña única del administrador)
manager/             la app principal (HTML/CSS/JS)
popup/               buscador rápido del ícono
common/              utilidades compartidas, tema y datos simulados
icons/               íconos generados
tools/dev-server.js  servidor estático para previsualizar la UI
```

Para trabajar en la interfaz sin recargar la extensión:

```bash
node tools/dev-server.js
```

y abre `http://localhost:5173`. Fuera de Chrome-extensión, la app usa datos simulados (`common/mock.js`) que imitan la API `chrome.bookmarks`, así que toda la UI es navegable.

## Permisos

- `bookmarks` — leer y administrar tus marcadores (es el propósito de la extensión).
- `favicon` — mostrar los favicons que Chrome ya tiene en caché.
- `storage` — recordar la pestaña del administrador para no duplicarla.
- `activeTab` — leer título y URL de la pestaña activa solo cuando usas la extensión (atajo `Alt+M` o el popup).

Nada sale de tu navegador: sin analytics, sin servidores, sin cuentas.
