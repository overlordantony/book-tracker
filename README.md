# Bitácora de lectura

Aplicación web para organizar una biblioteca personal y registrar el avance de lectura. Incluye búsqueda y filtros, seguimiento por libro, capítulos, personajes, citas, conceptos, estadísticas, respaldos y administración básica de usuarios.

El proyecto es una aplicación estática hecha con HTML, CSS y módulos JavaScript nativos. Firebase Authentication y Cloud Firestore proporcionan el inicio de sesión y la persistencia de datos. El sitio se publica en **Netlify**; no usa GitHub Pages.

> Para configurar Firebase, consulta [docs/FIREBASE.md](docs/FIREBASE.md). La hoja de ruta y las especificaciones propuestas para las próximas etapas están en [RoadMap.md](RoadMap.md).

## Funcionalidades actuales

- **Acceso y perfiles**: inicio de sesión con correo y contraseña o Google, recuperación de contraseña, autoregistro sujeto a aprobación y control de acceso por rol y estado.
- **Biblioteca**: alta de libros con título, autor, portada, enlace externo, géneros, etiquetas, formato, estado, progreso, fechas, calificación, notas y observaciones. Permite buscar por título, autor, género o etiqueta; combinar filtros de estado, género, etiqueta, formato, calificación y progreso (con chips para quitarlos); ordenar por fecha, título, autor, progreso o calificación; alternar entre vista de lista y de cuadrícula (se recuerda la preferencia) y cargar los libros por páginas de 24.
- **Detalle del libro**: resumen visual (estado, progreso, calificación, formato, fechas), notas y actividad reciente; edición de los datos del libro y gestión CRUD de capítulos, personajes, citas y conceptos. Las citas se pueden marcar como favoritas y copiar.
- **Papelera**: «Mover a la papelera» desde el detalle (reversible), restauración y eliminación definitiva con confirmación que explica qué se borra; la eliminación definitiva borra también capítulos, personajes, citas y conceptos.
- **Texto con formato**: notas, resúmenes, descripciones y notas de cita admiten negrita, cursiva, subrayado, tachado, resaltado, listas y enlaces, con barra de herramientas, atajos de teclado y vista previa. Se guarda como texto con marcas (no HTML) y se sanitiza al mostrarlo.
- **Citas globales**: búsqueda de citas entre los libros propios, con filtro por etiqueta y favoritas.
- **Estadísticas**: libros agregados por mes/año, páginas registradas mediante rangos de capítulos por semana/mes, seguimiento semanal del progreso, resumen por estado y lecturas en curso. Las semanas comienzan el lunes. Cada gráfica tiene descripción accesible, leyenda, rango de fechas, mensajes útiles cuando no hay datos y una tabla alternativa. Los libros de la papelera no se cuentan.
- **Respaldos**: descarga de la biblioteca propia como JSON e importación/restauración del respaldo con confirmación. Un administrador puede descargar un respaldo de todas las bibliotecas.
- **Guía exportable**: genera un documento HTML autónomo con los datos y apartados de un libro.
- **Administración**: el administrador puede crear usuarios, modificar su nombre, rol y estado, y consultar sus bibliotecas en modo de solo lectura. La interfaz explica cada estado, pide confirmación al desactivar y evita que alguien se bloquee a sí mismo o que quede la app sin administradores activos.
- **Lector integrado (EPUB y PDF)**: `lector.html`, con botón «Leer en la app» / «Continuar leyendo (N %)» en el detalle de cada libro. Índice, búsqueda, subrayados con nota, ajustes de lectura y atajos de teclado. La posición de lectura y las anotaciones se guardan en la colección independiente `lecturas` de Firestore: al abrir otro dispositivo se continúa donde se dejó. «Exportar datos» / «Importar» generan y restauran un `.json` desde/hacia esa colección. El archivo del libro **no** se sube: queda en cada dispositivo (ver límites).
- **Presentación**: tema oscuro/claro, diseño adaptable a móvil y escritorio, y PWA instalable con service worker.

## Límites conocidos

- **Eliminar cuentas de usuario** no es posible desde la app: borrar la cuenta de Firebase Authentication y sus datos requiere una operación privilegiada (Cloud Function con Admin SDK), que no se debe resolver desde el navegador. El administrador puede dejar la cuenta en estado `Inactivo`. Tampoco hay todavía una opción para que cada usuario solicite eliminar su cuenta.
- Las protecciones de administración (no cambiar el propio rol, conservar un administrador activo) están en la interfaz; las reglas de Firestore no las imponen. Ver las observaciones en [docs/FIREBASE.md](docs/FIREBASE.md#5-publicar-las-reglas-de-seguridad).
- El campo de URL del libro es un enlace externo (por ejemplo, a una tienda); **no** es todavía un enlace de documento que se abra en un lector.
- **Lector**: el archivo del libro (EPUB/PDF) no se guarda en la nube (Firestore no es un almacén de archivos; subirlo requeriría Firebase Storage). En un dispositivo nuevo se ve el libro y la posición, y hay que seleccionar el mismo archivo para continuar; se reconoce por su huella SHA-256, no por el nombre. Dos dispositivos que anoten a la vez sin conexión: gana la lista de anotaciones más reciente (una copia local que nunca se sincronizó se une en vez de perderse). Máximo 3000 anotaciones por libro. Los PDF escaneados no tienen texto seleccionable. El lector necesita HTTPS o `localhost` (usa `crypto.subtle`).
- Las notas del lector son privadas: las reglas no permiten que un `Admin` lea `lecturas`, y esas colecciones no entran en el respaldo administrativo.
- El formato de texto es un subconjunto fijo (sin encabezados, imágenes ni tablas). Un texto antiguo que contuviera marcas como `**así**` pasará a verse con ese formato.

## Tecnología

| Área | Tecnología |
|---|---|
| Interfaz | HTML, CSS y módulos ES nativos; sin proceso de build ni dependencias npm |
| Autenticación | Firebase Authentication: correo/contraseña y Google |
| Datos | Cloud Firestore |
| SDK | Firebase JS SDK modular 12.19.0, cargado desde `gstatic.com` |
| Hosting | Netlify, como sitio estático |
| Tipografías | Inter e IBM Plex Mono (Google Fonts) |

## Estructura

```text
.
├── index.html             # Acceso, registro y recuperación de contraseña
├── app.html               # Biblioteca, citas, estadísticas y formulario de libro
├── detalle.html           # Detalle, edición y apartados de un libro
├── lector.html            # Lector EPUB/PDF integrado (requiere sesión)
├── admin.html             # Administración básica de usuarios
├── manifest.json          # Metadatos de la PWA
├── sw.js                  # Service worker (red primero, caché de respaldo)
├── firebase.json          # Configuración para Firebase CLI; apunta a firestore.rules
├── firestore.rules        # Reglas de seguridad de Firestore (fuente versionada)
├── RoadMap.md             # Hoja de ruta y estado de avance
├── tests/formato.test.mjs # Prueba automática del formato de texto (node, sin dependencias)
├── tests/sincronia.test.mjs # Pruebas de la lógica de sincronización del lector (node)
├── css/styles.css         # Estilos, temas y diseño adaptable
├── css/lector/            # Estilos del lector (propios: no se mezclan con styles.css)
├── icons/                 # Iconos de la app y de la PWA
├── docs/FIREBASE.md       # Configuración de Firebase y publicación
├── docs/PRUEBAS.md        # Pruebas de regresión y comprobación de reglas
├── docs/RESPALDOS.md      # Estrategia de respaldo y recuperación
└── js/
    ├── firebase-config.js # Configuración web del proyecto Firebase
    ├── firebase-init.js   # Inicialización de Firebase
    ├── auth.js            # Autenticación
    ├── roles.js           # Perfiles, roles y estados
    ├── db.js              # Acceso a libros, subcolecciones y papelera de Firestore
    ├── formato.js         # Texto con formato: render seguro y editor con barra de herramientas
    ├── modal.js           # Cuadro de confirmación accesible reutilizable
    ├── app.js             # Biblioteca y flujo de app.html
    ├── detalle.js         # Flujo de detalle.html
    ├── estadisticas.js    # Cálculo y presentación de estadísticas
    ├── exportar.js        # Respaldos y guía exportable
    ├── importar.js        # Validación y restauración de respaldos
    ├── admin.js           # Operaciones del panel de administración
    ├── admin.page.js      # Interfaz del panel de administración
    ├── theme.js           # Tema claro/oscuro
    ├── lecturas.js        # Acceso a la colección `lecturas` (posición y anotaciones del lector)
    ├── lector/            # Lector: utils, epub-parser, pdf-reader, annotations, reader, navigation, settings,
    │                      #   nube.js (sincronización), sincronia.js (lógica pura), arranque.js, PDF.js local
    ├── pie.js             # Pie de página configurable
    └── pwa.js             # Registro del service worker
```

## Configuración y ejecución local

1. Clona o descarga el repositorio.
2. Configura Firebase siguiendo [docs/FIREBASE.md](docs/FIREBASE.md): Authentication, Firestore, perfiles y dominios autorizados.
3. Configura la aplicación web de Firebase en `js/firebase-config.js`. El archivo contiene la configuración cliente de Firebase; no hay una plantilla `firebase-config.example.js` en este checkout. La configuración web es visible desde el navegador: la protección depende de reglas de Firestore correctamente configuradas y de las restricciones de API correspondientes.
4. Sirve la carpeta por HTTP con un servidor local (por ejemplo, **Live Server** en VS Code). No abras las páginas con `file://`, porque los módulos ES no funcionarán correctamente.
5. Comprueba el inicio de sesión, la lectura/escritura de datos y los respaldos antes de compartir la aplicación. La lista completa está en [docs/PRUEBAS.md](docs/PRUEBAS.md); la prueba automática del formato se ejecuta con `node tests/formato.test.mjs`.

## Publicación en Netlify

Este repositorio no incluye un build ni una configuración versionada de Netlify. Para desplegar la aplicación estática, conecta el repositorio con Netlify y configura la raíz del proyecto como directorio de publicación; deja vacío el comando de build. También se puede publicar manualmente la carpeta del proyecto.

Después de publicar:

1. Añade el dominio asignado por Netlify (y el dominio personalizado, si existe) en **Firebase Authentication → Settings → Authorized domains**.
2. Si restringes la clave web de Firebase por referentes HTTP, permite el dominio de producción de Netlify y `localhost` para desarrollo.
3. Verifica en Netlify que la versión publicada incluya la configuración cliente correcta en `js/firebase-config.js`. No uses variables de entorno de Netlify esperando que cambien por sí solas un archivo estático: haría falta un paso de build que las inyecte.
4. Comprueba que las reglas publicadas coincidan con `firestore.rules` y que no permitan acceso general a los datos.

## Roles y estados

| Campo | Valores usados por la app | Descripción |
|---|---|---|
| `rol` | `Lector`, `Admin` | Un lector administra sus propios libros. El administrador puede gestionar perfiles y consultar bibliotecas ajenas en modo de solo lectura. |
| `estado` | `Pendiente`, `Activo`, `Inactivo` | Solo los perfiles `Activo` pueden usar las pantallas protegidas. |

El autorregistro y el primer acceso con Google crean perfiles `Pendiente`. Un administrador los activa desde `admin.html`. Los usuarios creados desde el panel nacen `Activo`. El panel no cambia el correo ni la contraseña de otras personas.

## Respaldos

- **Descargar respaldo** crea un archivo `respaldo-bitacora-AAAA-MM-DD.json` con los libros propios y sus capítulos, personajes, citas y conceptos.
- Los libros de la papelera se incluyen en el respaldo y vuelven a la papelera al restaurar. Ver [docs/RESPALDOS.md](docs/RESPALDOS.md).
- **Cargar respaldo** valida el JSON, muestra un resumen y solicita confirmación antes de restaurar. La restauración escribe los elementos del archivo y elimina los elementos propios que no estén incluidos; permite descargar primero una copia de los datos actuales.
- Un respaldo administrativo puede contener libros de varios usuarios. Al cargarlo en una cuenta, se restauran solamente los libros que pertenecían a esa cuenta.

## Personalización

- El objeto `PIE` de `js/pie.js` contiene los enlaces y el texto del pie de página.
- Los iconos de la aplicación están en `icons/` y se referencian desde las páginas HTML y `manifest.json`.
- Las variables de color y los temas están al comienzo de `css/styles.css`.
- `--alto-barra` y `--alto-pie` en `css/styles.css` controlan las dimensiones generales del encabezado y pie.
