# Bitácora de lectura

Aplicación web para organizar una biblioteca personal y registrar el avance de lectura. Incluye búsqueda y filtros, seguimiento por libro, capítulos, personajes, citas, conceptos, estadísticas, respaldos y administración básica de usuarios.

El proyecto es una aplicación estática hecha con HTML, CSS y módulos JavaScript nativos. Firebase Authentication y Cloud Firestore proporcionan el inicio de sesión y la persistencia de datos. El sitio se publica en **Netlify**; no usa GitHub Pages.

> Para configurar Firebase, consulta [docs/FIREBASE.md](docs/FIREBASE.md). La hoja de ruta y las especificaciones propuestas para las próximas etapas están en [RoadMap.md](RoadMap.md).

## Funcionalidades actuales

- **Acceso y perfiles**: inicio de sesión con correo y contraseña o Google, recuperación de contraseña, autoregistro sujeto a aprobación y control de acceso por rol y estado.
- **Biblioteca**: alta de libros con título, autor, portada, enlace externo, géneros, etiquetas, formato, estado, progreso, fechas, calificación, notas y observaciones. Permite buscar por título, autor, género o etiqueta; filtrar por estado y etiqueta; y ordenar por fecha, título, autor, progreso o calificación.
- **Detalle del libro**: edición de los datos del libro y gestión CRUD de capítulos, personajes, citas y conceptos. Los elementos de estas secciones se pueden crear, editar y eliminar. Las citas se pueden marcar como favoritas y copiar.
- **Citas globales**: búsqueda de citas entre los libros propios, con filtro por etiqueta y favoritas.
- **Estadísticas**: libros agregados por mes/año, páginas registradas mediante rangos de capítulos por semana/mes, seguimiento semanal del progreso, resumen por estado y lecturas en curso. Las semanas comienzan el lunes.
- **Respaldos**: descarga de la biblioteca propia como JSON e importación/restauración del respaldo con confirmación. Un administrador puede descargar un respaldo de todas las bibliotecas.
- **Guía exportable**: genera un documento HTML autónomo con los datos y apartados de un libro.
- **Administración**: el administrador puede crear usuarios, modificar su nombre, rol y estado, y consultar sus bibliotecas en modo de solo lectura.
- **Presentación**: tema oscuro/claro, diseño adaptable a móvil y escritorio, y PWA instalable con service worker.

## Límites conocidos

- La biblioteca permite **crear y editar libros**, pero todavía no ofrece una acción en pantalla para eliminarlos. Aunque existe una función de base de datos para borrar el documento de un libro, usarla por sí sola no borra las subcolecciones de Firestore; la eliminación completa debe implementarse con cuidado.
- La administración permite crear y editar perfiles, pero no eliminar usuarios. Borrar también la cuenta de Firebase Authentication y sus datos requiere una operación privilegiada segura; no se debe resolver desde el navegador con credenciales administrativas.
- El campo de URL del libro es un enlace externo (por ejemplo, a una tienda); **no** es todavía un enlace de documento que se abra en un lector.
- No hay lector de EPUB/PDF, carga local de documentos, anotaciones de texto enriquecido ni sincronización de posición de lectura entre dispositivos.
- La edición de notas y descripciones usa campos de texto sencillos: no hay herramientas de negrita, cursiva, resaltado, tachado u otros estilos.
- Este checkout no contiene `firestore.rules`, aunque `firebase.json` lo referencia. Antes de desplegar reglas con Firebase CLI o habilitar usuarios reales, hay que recuperar o definir y publicar reglas de Firestore adecuadas. No habilites reglas abiertas.

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
├── admin.html             # Administración básica de usuarios
├── manifest.json          # Metadatos de la PWA
├── sw.js                  # Service worker (red primero, caché de respaldo)
├── firebase.json          # Configuración para Firebase CLI; apunta a firestore.rules
├── css/styles.css         # Estilos, temas y diseño adaptable
├── icons/                 # Iconos de la app y de la PWA
├── docs/FIREBASE.md       # Configuración de Firebase y publicación
└── js/
    ├── firebase-config.js # Configuración web del proyecto Firebase
    ├── firebase-init.js   # Inicialización de Firebase
    ├── auth.js            # Autenticación
    ├── roles.js           # Perfiles, roles y estados
    ├── db.js              # Acceso a libros y subcolecciones de Firestore
    ├── app.js             # Biblioteca y flujo de app.html
    ├── detalle.js         # Flujo de detalle.html
    ├── estadisticas.js    # Cálculo y presentación de estadísticas
    ├── exportar.js        # Respaldos y guía exportable
    ├── importar.js        # Validación y restauración de respaldos
    ├── admin.js           # Operaciones del panel de administración
    ├── admin.page.js      # Interfaz del panel de administración
    ├── theme.js           # Tema claro/oscuro
    ├── pie.js             # Pie de página configurable
    └── pwa.js             # Registro del service worker
```

## Configuración y ejecución local

1. Clona o descarga el repositorio.
2. Configura Firebase siguiendo [docs/FIREBASE.md](docs/FIREBASE.md): Authentication, Firestore, perfiles y dominios autorizados.
3. Configura la aplicación web de Firebase en `js/firebase-config.js`. El archivo contiene la configuración cliente de Firebase; no hay una plantilla `firebase-config.example.js` en este checkout. La configuración web es visible desde el navegador: la protección depende de reglas de Firestore correctamente configuradas y de las restricciones de API correspondientes.
4. Sirve la carpeta por HTTP con un servidor local (por ejemplo, **Live Server** en VS Code). No abras las páginas con `file://`, porque los módulos ES no funcionarán correctamente.
5. Comprueba el inicio de sesión, la lectura/escritura de datos y los respaldos antes de compartir la aplicación.

## Publicación en Netlify

Este repositorio no incluye un build ni una configuración versionada de Netlify. Para desplegar la aplicación estática, conecta el repositorio con Netlify y configura la raíz del proyecto como directorio de publicación; deja vacío el comando de build. También se puede publicar manualmente la carpeta del proyecto.

Después de publicar:

1. Añade el dominio asignado por Netlify (y el dominio personalizado, si existe) en **Firebase Authentication → Settings → Authorized domains**.
2. Si restringes la clave web de Firebase por referentes HTTP, permite el dominio de producción de Netlify y `localhost` para desarrollo.
3. Verifica en Netlify que la versión publicada incluya la configuración cliente correcta en `js/firebase-config.js`. No uses variables de entorno de Netlify esperando que cambien por sí solas un archivo estático: haría falta un paso de build que las inyecte.
4. Comprueba que las reglas de Firestore estén publicadas y que no permitan acceso general a los datos.

## Roles y estados

| Campo | Valores usados por la app | Descripción |
|---|---|---|
| `rol` | `Lector`, `Admin` | Un lector administra sus propios libros. El administrador puede gestionar perfiles y consultar bibliotecas ajenas en modo de solo lectura. |
| `estado` | `Pendiente`, `Activo`, `Inactivo` | Solo los perfiles `Activo` pueden usar las pantallas protegidas. |

El autorregistro y el primer acceso con Google crean perfiles `Pendiente`. Un administrador los activa desde `admin.html`. Los usuarios creados desde el panel nacen `Activo`. El panel no cambia el correo ni la contraseña de otras personas.

## Respaldos

- **Descargar respaldo** crea un archivo `respaldo-bitacora-AAAA-MM-DD.json` con los libros propios y sus capítulos, personajes, citas y conceptos.
- **Cargar respaldo** valida el JSON, muestra un resumen y solicita confirmación antes de restaurar. La restauración escribe los elementos del archivo y elimina los elementos propios que no estén incluidos; permite descargar primero una copia de los datos actuales.
- Un respaldo administrativo puede contener libros de varios usuarios. Al cargarlo en una cuenta, se restauran solamente los libros que pertenecían a esa cuenta.

## Personalización

- El objeto `PIE` de `js/pie.js` contiene los enlaces y el texto del pie de página.
- Los iconos de la aplicación están en `icons/` y se referencian desde las páginas HTML y `manifest.json`.
- Las variables de color y los temas están al comienzo de `css/styles.css`.
- `--alto-barra` y `--alto-pie` en `css/styles.css` controlan las dimensiones generales del encabezado y pie.
