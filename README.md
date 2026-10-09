# 📚 Bitácora de lectura

Aplicación web para llevar el registro personal de lo que lees: biblioteca con filtros, progreso por libro, capítulos, personajes, conceptos, citas, estadísticas y respaldos. Es una app **100 % estática** (HTML + CSS + JavaScript con módulos ES) que usa **Firebase** (Authentication + Firestore) como backend, así que se puede publicar gratis en **GitHub Pages**.

> 👉 La puesta en marcha de Firebase (proyecto, reglas, primer administrador, despliegue) está en **[docs/FIREBASE.md](docs/FIREBASE.md)**.

---

## Características

- **Biblioteca**: búsqueda por título/autor/género/etiqueta, filtros por estado y etiqueta, orden (reciente, título, autor, % leído, calificación), portadas por URL.
- **Detalle de libro**: edición, progreso (página actual / total), y cuatro apartados: **capítulos** (con rango de páginas, resumen y puntos clave), **personajes** (con relevancia, alias y conexiones), **citas** (con página, etiqueta, favoritas y botón copiar) y **conceptos**.
- **Citas globales**: buscador de citas de todos tus libros.
- **Estadísticas**:
  - Libros por mes / año (según `creadoEn`).
  - Páginas por semana / mes (suma del rango de páginas de cada capítulo, según el `creadoEn` del capítulo).
  - Seguimiento semanal (página actual de los libros según su `actualizadoEn`).
  - Resumen general, terminados por mes, reparto por estado y lecturas en curso.
  - Si no hay datos se muestra `0` o "Sin datos", nunca un error.
- **Respaldos**: **Descargar respaldo** (`.json`) y **Cargar respaldo** (restaura desde ese `.json` con confirmación previa). Los administradores pueden descargar el respaldo de todos los usuarios.
- **Exportar guía**: genera un HTML autónomo de repaso de un libro.
- **Usuarios y roles**: login con correo/contraseña y con Google; autoregistro con aprobación de un administrador; panel de administración para crear usuarios, cambiar rol/estado y ver (solo lectura) la biblioteca de cualquiera.
- **Interfaz**: tema oscuro/claro, header y footer fijos, diseño responsivo (móvil y escritorio) y **PWA** instalable con service worker.

## Tecnología

| Parte | Qué se usa |
|---|---|
| Frontend | HTML, CSS y JavaScript (módulos ES nativos), sin *build* ni `npm` |
| Backend | Firebase Authentication + Cloud Firestore (SDK modular 12.19.0 cargado desde `gstatic.com`) |
| Hosting | GitHub Pages (o cualquier hosting estático) |
| Tipografías | Inter e IBM Plex Mono (Google Fonts) |

## Estructura del proyecto

```
.
├── index.html            # Login y registro
├── app.html              # Biblioteca, estadísticas, citas y alta de libros
├── detalle.html          # Detalle de un libro (capítulos, personajes, citas, conceptos)
├── admin.html            # Panel de administración (solo rol Admin)
├── manifest.json         # PWA
├── sw.js                 # Service worker (red primero, caché de respaldo)
├── firestore.rules       # Reglas de seguridad de Firestore
├── firebase.json         # Para desplegar las reglas con Firebase CLI (opcional)
├── css/
│   └── styles.css        # Estilos, temas, header/footer, responsivo
├── icons/                # Logo, favicon e iconos de la PWA
├── js/
│   ├── firebase-config.js          # TU configuración de Firebase (ver docs/FIREBASE.md)
│   ├── firebase-config.example.js  # Plantilla de la configuración
│   ├── firebase-init.js  # Inicializa Firebase (auth, db)
│   ├── auth.js           # Login, registro, Google, sesión
│   ├── roles.js          # Lectura/creación del perfil (rol y estado)
│   ├── db.js             # Acceso a Firestore (libros y subcolecciones)
│   ├── app.js            # Lógica de app.html (biblioteca, formulario, respaldos)
│   ├── detalle.js        # Lógica de detalle.html
│   ├── estadisticas.js   # Cálculo y render de estadísticas
│   ├── exportar.js       # Descargar respaldo y exportar guía
│   ├── importar.js       # Cargar respaldo (validación y restauración)
│   ├── admin.js / admin.page.js   # Gestión de usuarios
│   ├── theme.js          # Tema claro/oscuro
│   ├── pie.js            # Footer fijo (placeholders editables)
│   └── pwa.js            # Registro del service worker
└── .github/workflows/pages.yml    # Despliegue automático a GitHub Pages
```

## Puesta en marcha rápida

1. **Clona o descarga** el repositorio.
2. **Crea y configura Firebase** siguiendo **[docs/FIREBASE.md](docs/FIREBASE.md)** (proyecto, Authentication, Firestore, reglas y primer administrador).
3. **Configura la conexión**: copia `js/firebase-config.example.js` a `js/firebase-config.js` y pega los valores de tu app web de Firebase.
4. **Ejecútalo en local** con cualquier servidor estático (los módulos ES no funcionan abriendo el archivo con `file://`):

   ```bash
   # con Python
   python3 -m http.server 8000
   # o con Node
   npx serve .
   ```

   Abre `http://localhost:8000`.
5. **Publícalo** en GitHub Pages (ver [docs/FIREBASE.md §8](docs/FIREBASE.md#8-publicar-en-github-pages)).

## Cómo se usa

### Roles y estados

| Campo | Valores | Significado |
|---|---|---|
| `rol` | `lector`, `Admin` | Un lector solo ve y edita lo suyo. El admin además ve las bibliotecas ajenas (solo lectura) y gestiona usuarios. |
| `estado` | `pendiente`, `Activo`, `inactivo` | Solo las cuentas `Activo` pueden usar la app. |

Flujo de alta: la persona se registra (o entra con Google) → su cuenta queda **pendiente** → un admin la pone **Activo** en `admin.html`. Un admin también puede crear usuarios ya activos.

### Respaldos

- **Descargar respaldo** guarda `respaldo-bitacora-AAAA-MM-DD.json` con todos tus libros y sus capítulos, personajes, citas y conceptos.
- **Cargar respaldo** pide seleccionar ese mismo `.json`, muestra un resumen y exige confirmar antes de **sobrescribir** tus datos: los libros del archivo se escriben (mismo id → se reemplazan) y los que no estén en el archivo se eliminan. El modal ofrece descargar una copia de lo actual antes de continuar. Si se interrumpe a medias, repite la restauración con el mismo archivo.
- Un respaldo completo (admin) con libros de varios usuarios solo restaura los del usuario que lo carga.

### Estadísticas: de dónde sale cada dato

| Métrica | Períodos | Fuente |
|---|---|---|
| Libros | Mensual / Anual | `creadoEn` del libro |
| Páginas | Semanal / Mensual | `rangoPaginas` (fin − inicio + 1) de cada capítulo, en el `creadoEn` del capítulo. Capítulos sin rango válido no suman. |
| Páginas (seguimiento) | Semanal | `paginaActual` de cada libro, en su `actualizadoEn` |

Las semanas empiezan en lunes. El selector de año afecta a las vistas mensuales.

## Personalización

- **Footer**: edita el objeto `PIE` al inicio de `js/pie.js` (descripción, enlace a GitHub y hasta 2 enlaces extra). Los valores `#` son placeholders.
- **Logo / favicon**: están en `icons/` (`icon-192.png`); se referencian en el `<head>` de cada HTML y en `manifest.json`.
- **Colores y tema**: variables CSS al inicio de `css/styles.css` (`:root[data-theme="dark"]` y `"light"`).
- **Alturas de header/footer**: `--alto-barra` y `--alto-pie` en `css/styles.css`.

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| Pantalla en blanco / errores de módulos | Abriste el HTML con `file://`; usa un servidor local. |
| `Missing or insufficient permissions` | Reglas sin publicar, perfil inexistente en `usuarios`, o `rol`/`estado` mal escritos (distinguen mayúsculas: `Admin`, `Activo`). |
| "Tu cuenta está pendiente de aprobación" | Un admin debe poner el estado en `Activo`. |
| Google: `auth/unauthorized-domain` | Añade tu dominio (`usuario.github.io`) en Authentication → Settings → Authorized domains. |
| No se ven cambios tras desplegar | El service worker sirve caché; recarga forzada o limpia datos del sitio. |

Más detalles en [docs/FIREBASE.md §10](docs/FIREBASE.md#10-problemas-frecuentes).

## Licencia

Añade aquí la licencia de tu preferencia (por ejemplo MIT) y un archivo `LICENSE` en la raíz.
