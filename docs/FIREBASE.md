# Guía de Firebase para la Bitácora de lectura

Esta guía te lleva de cero a tener tu propia copia de la app funcionando con Firebase y publicada en GitHub Pages. Todo se puede hacer con el **plan gratuito (Spark)**; no necesitas tarjeta ni Cloud Functions.

**Qué vas a crear:** un proyecto de Firebase con *Authentication* (correo/contraseña y Google) y *Cloud Firestore* (base de datos), más las reglas de seguridad incluidas en `firestore.rules`.

Índice: [1 Proyecto](#1-crear-el-proyecto) · [2 App web](#2-registrar-la-app-web-y-copiar-la-configuración) · [3 Authentication](#3-activar-authentication) · [4 Firestore](#4-crear-firestore) · [5 Reglas](#5-publicar-las-reglas-de-seguridad) · [6 Primer admin](#6-crear-el-primer-administrador) · [7 Probar](#7-probar-en-local) · [8 GitHub Pages](#8-publicar-en-github-pages) · [9 Seguridad](#9-recomendaciones-de-seguridad-y-límites) · [10 Problemas](#10-problemas-frecuentes) · [Anexo: modelo de datos](#anexo-modelo-de-datos)

---

## 1. Crear el proyecto

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Agregar proyecto** → ponle nombre (p. ej. `bitacora-lectura`).
3. Google Analytics es opcional; puedes desactivarlo.
4. Espera a que termine y pulsa **Continuar**.

## 2. Registrar la app web y copiar la configuración

1. En la pantalla del proyecto, pulsa el icono **`</>` (Web)**.
2. Ponle un apodo (p. ej. `bitacora-web`). **No** marques "Firebase Hosting" (usaremos GitHub Pages).
3. Firebase te mostrará un bloque `firebaseConfig`. También lo encuentras luego en **⚙️ Configuración del proyecto → Tus apps**.
4. En tu copia del repositorio, **copia** `js/firebase-config.example.js` a `js/firebase-config.js` y pega tus valores:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "tu-proyecto.firebaseapp.com",
     projectId: "tu-proyecto",
     storageBucket: "tu-proyecto.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```

> La configuración web **no es secreta** (cualquier visitante la descarga con la página). Lo que protege tus datos son las **reglas de Firestore** (paso 5). Aun así, en el [§8](#8-publicar-en-github-pages) se explica cómo no subirla al repositorio si lo prefieres.

La app usa el SDK **modular 12.19.0 cargado por CDN** (`https://www.gstatic.com/firebasejs/12.19.0/...`), así que no hay que instalar nada con `npm`.

## 3. Activar Authentication

1. Menú **Compilación → Authentication → Comenzar**.
2. Pestaña **Sign-in method** y habilita:
   - **Correo electrónico/contraseña** (solo el primer interruptor; el *enlace por correo* no hace falta).
   - **Google** (elige un correo de asistencia del proyecto y guarda).
3. Pestaña **Settings → Authorized domains**: deben estar `localhost` (viene por defecto) y, cuando publiques, tu dominio de GitHub Pages: `tu-usuario.github.io`. Si falta, Google devolverá `auth/unauthorized-domain`.
4. (Opcional) En **Templates** puedes personalizar el correo de "restablecer contraseña", que usa el enlace "¿Olvidaste tu contraseña?".

## 4. Crear Firestore

1. **Compilación → Firestore Database → Crear base de datos**.
2. Elige la **ubicación** (no se puede cambiar después; escoge una cercana a tus usuarios).
3. Modo **producción** (las reglas del paso siguiente sustituyen el modo de prueba).

No hace falta crear colecciones a mano salvo el primer administrador (paso 6). La app crea `libros` y sus subcolecciones al usarla.

**Índices:** la app no necesita índices compuestos (las consultas filtran por un solo campo y el orden se hace en el cliente o con un `orderBy` simple), así que no tienes que crear ninguno.

## 5. Publicar las reglas de seguridad

Las reglas están en [`firestore.rules`](../firestore.rules). Resumen de lo que garantizan:

| Colección | Quién puede qué |
|---|---|
| `usuarios/{uid}` | Cada persona lee su perfil; solo un admin lista, edita o borra perfiles. Cualquiera puede **crear su propio perfil** únicamente como `rol: "lector"` y `estado: "pendiente"`. |
| `libros/{id}` | Solo cuentas `Activo`. Cada una lee/escribe **solo sus libros** (`propietarioUid == su uid`). Un `Admin` lee los de todos (solo lectura). |
| `libros/{id}/capitulos│personajes│citas│conceptos` | Mismo criterio que el libro padre (el dueño escribe; el dueño y el admin leen). |
| Cualquier otra ruta | Denegada. |

**Para publicarlas:**

- *Desde la consola:* **Firestore Database → Rules**, pega el contenido de `firestore.rules` y pulsa **Publicar**.
- *Con Firebase CLI* (opcional): `npm i -g firebase-tools && firebase login && firebase use --add && firebase deploy --only firestore:rules` (el repositorio ya trae `firebase.json`).

> ⚠️ Los valores distinguen mayúsculas: **`Admin`** y **`Activo`** con mayúscula inicial; `lector`, `pendiente` e `inactivo` en minúscula. Es como los escribe la app y como los comprueban las reglas.

> ℹ️ Las reglas usan `getAfter()`/`existsAfter()` para las subcolecciones: así **Cargar respaldo** puede crear un libro y sus capítulos/citas en el mismo lote de escritura.

## 6. Crear el primer administrador

La app no permite hacerse admin a sí misma (las reglas lo impiden a propósito), así que el **primer** admin se crea a mano desde la consola, que no está sujeta a las reglas:

1. **Authentication → Users → Add user**: correo y contraseña. Copia el **UID** que aparece en la lista.
2. **Firestore Database → Iniciar colección** → ID de colección `usuarios`.
3. **ID del documento = el UID** del paso 1 (pégalo exacto) y agrega estos campos:

   | Campo | Tipo | Valor |
   |---|---|---|
   | `email` | string | el correo del usuario |
   | `nombre` | string | tu nombre o apodo |
   | `rol` | string | `Admin` |
   | `estado` | string | `Activo` |
   | `creadoEn` | timestamp | la fecha/hora actual |

4. Guarda. Ya puedes iniciar sesión con ese usuario.

**A partir de aquí todo se hace desde la app:**

- **Autoregistro** (`index.html` → "Regístrate", o "Entrar con Google"): crea la cuenta con estado `pendiente`. En `admin.html` el admin la pasa a `Activo`.
- **Crear usuario desde el panel** (`admin.html`): el admin da correo, contraseña y rol, y el usuario nace `Activo`. (Internamente usa una segunda instancia de Firebase para no cerrar la sesión del admin.)
- **Editar** nombre, rol y estado de cualquier usuario, y **Ver biblioteca** ajena en modo solo lectura.

> Limitación del plan gratuito: un admin **no puede cambiar el correo ni la contraseña de otra persona** desde la app (eso requiere el Admin SDK/Cloud Functions). Cada usuario puede usar "¿Olvidaste tu contraseña?" para restablecerla por correo.

## 7. Probar en local

Los módulos ES requieren HTTP (no `file://`):

```bash
python3 -m http.server 8000      # o: npx serve .
```

Abre `http://localhost:8000` y comprueba:

1. Entras con el admin del paso 6.
2. Agregas un libro y aparece en la biblioteca.
3. Descargas un respaldo y lo cargas de nuevo (debe pedir confirmación).
4. En `admin.html` creas un usuario lector, cierras sesión y entras con él: solo ve sus libros.
5. (Opcional) En **Firestore → Rules → Rules Playground** simula lecturas como un usuario `Activo` frente a libros de otro dueño: deben denegarse.

## 8. Publicar en GitHub Pages

### Opción A — simple (se sube `js/firebase-config.js` al repositorio)

1. Crea un repositorio en GitHub y sube el proyecto (con tu `js/firebase-config.js` ya relleno).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Espera a que aparezca la URL `https://tu-usuario.github.io/tu-repo/`.
4. Vuelve a Firebase → **Authentication → Settings → Authorized domains** y agrega `tu-usuario.github.io`.

Las rutas de la app son relativas, así que funciona dentro de `/tu-repo/` sin cambios.

### Opción B — sin subir la configuración (GitHub Actions)

Útil si no quieres que tus valores aparezcan en el repositorio (recuerda: seguirán siendo visibles en el sitio publicado, porque son públicos por naturaleza).

1. En `.gitignore`, descomenta la línea `js/firebase-config.js`. Si ya lo habías subido, quítalo del índice: `git rm --cached js/firebase-config.js`.
2. **Settings → Secrets and variables → Actions → New repository secret**:
   - Nombre: `FIREBASE_CONFIG_JSON`
   - Valor: tu configuración como **JSON con claves entre comillas**, por ejemplo:

     ```json
     {"apiKey":"AIza...","authDomain":"tu-proyecto.firebaseapp.com","projectId":"tu-proyecto","storageBucket":"tu-proyecto.firebasestorage.app","messagingSenderId":"1234567890","appId":"1:1234567890:web:abcdef"}
     ```
3. **Settings → Pages → Source: GitHub Actions**.
4. Haz *push* a `main`: el flujo `.github/workflows/pages.yml` genera `js/firebase-config.js` a partir del secreto y publica el sitio.
5. Agrega `tu-usuario.github.io` a los dominios autorizados (paso 3.3).

## 9. Recomendaciones de seguridad y límites

- **Las reglas son tu seguridad real.** No cambies a "modo de prueba"/`allow read, write: if true`.
- **Restringe la API key** (recomendado): Google Cloud Console → *APIs y servicios → Credenciales* → tu *Browser key* → **Restricciones de aplicaciones: Sitios web (referentes HTTP)** y agrega `https://tu-usuario.github.io/*` y `http://localhost:*`.
- **Aprobación manual**: nadie usa la app hasta que un admin lo pone en `Activo`; mantén al menos un admin de respaldo.
- **Cuotas del plan Spark**: Firestore y Authentication tienen límites diarios/mensuales gratuitos. Para uso personal o de un grupo pequeño sobran, pero consulta los límites vigentes en la documentación de Firebase. Cada lectura de reglas con `get()` cuenta como lectura; la app está pensada para uso moderado.
- **Respaldos**: descarga respaldos periódicos (`Descargar respaldo`); es la única copia fuera de Firestore.
- Al borrar un libro, Firestore **no borra automáticamente sus subcolecciones**; la restauración de respaldos sí las limpia. (La app actual no incluye un botón de borrar libro.)

## 10. Problemas frecuentes

| Mensaje / síntoma | Qué revisar |
|---|---|
| `Missing or insufficient permissions` | ¿Publicaste las reglas? ¿Existe `usuarios/{uid}` con **el mismo UID** de Authentication? ¿`rol`/`estado` con la capitalización exacta (`Admin`, `Activo`)? |
| Mensaje "Tu cuenta está pendiente de aprobación" | El perfil está en `pendiente`: un admin debe activarlo. |
| "Tu cuenta está inactiva" | El admin la dejó en `inactivo`. |
| El usuario inicia sesión con Google y no entra | Primera vez: se crea `pendiente`; falta la aprobación. |
| `auth/unauthorized-domain` | Falta el dominio en *Authorized domains* (§3.3). |
| `auth/operation-not-allowed` | El método (correo o Google) no está habilitado (§3.2). |
| `auth/invalid-api-key` / config vacía | `js/firebase-config.js` sin rellenar o con valores equivocados. |
| `auth/popup-blocked` | El navegador bloqueó la ventana de Google; permite *pop-ups* para el sitio. |
| Estadísticas de páginas en 0 | Los capítulos necesitan rango de páginas (inicio y fin) para sumar. |
| El sitio publicado no refleja los cambios | Service worker/caché: recarga forzada (Ctrl+F5) o borra los datos del sitio. |
| "Cargar respaldo" falla con permisos | Revisa que tus reglas sean las de `firestore.rules` (incluyen `getAfter`). |

---

## Anexo: modelo de datos

### `usuarios/{uid}`  (el id es el UID de Firebase Authentication)

| Campo | Tipo | Notas |
|---|---|---|
| `email` | string | |
| `nombre` | string | Nombre o apodo |
| `rol` | string | `lector` \| `Admin` |
| `estado` | string | `pendiente` \| `Activo` \| `inactivo` |
| `creadoEn` | timestamp | |

### `libros/{libroId}`

| Campo | Tipo | Notas |
|---|---|---|
| `propietarioUid` | string | UID del dueño (lo exigen las reglas) |
| `titulo`, `autor` | string | Obligatorios en el formulario |
| `portadaUrl`, `url` | string | Portada y enlace de tienda |
| `generos`, `etiquetas` | array<string> | |
| `estado` | string | `pendiente` \| `leyendo` \| `pausado` \| `terminado` \| `descartado` |
| `formato` | string | `fisico` \| `digital` \| `audiolibro` |
| `totalPaginas`, `paginaActual` | number | |
| `fechaInicio`, `fechaFin` | string `AAAA-MM-DD` | |
| `calificacion` | number 1–5 | |
| `notas`, `observaciones` | string | |
| `creadoEn`, `actualizadoEn` | timestamp | Base de las estadísticas |

### Subcolecciones de `libros/{libroId}`

| Subcolección | Campos |
|---|---|
| `capitulos` | `numero` (number), `titulo`, `rangoPaginas` `{inicio, fin}` (numbers), `resumen`, `puntosClave` (array), `creadoEn` |
| `personajes` | `nombre`, `rol`, `relevancia` (`principal` \| `secundario` \| `menor` \| `mencionado`), `alias` (array), `descripcion`, `conexiones` (array), `creadoEn` |
| `citas` | `texto`, `pagina` (number\|null), `etiqueta`, `nota`, `favorita` (boolean), `creadoEn` |
| `conceptos` | `nombre`, `significado`, `creadoEn` |

### Formato del archivo de respaldo (`.json`)

```json
{
  "app": "bitacora-de-lectura",
  "version": 1,
  "exportadoEn": "2026-10-08T15:00:00.000Z",
  "libros": [
    {
      "id": "abc123",
      "titulo": "…", "autor": "…", "propietarioUid": "…",
      "creadoEn": "2026-09-01T10:00:00.000Z",
      "actualizadoEn": "2026-10-01T10:00:00.000Z",
      "capitulos":  [ { "id": "…", "numero": 1, "rangoPaginas": { "inicio": 1, "fin": 20 }, "creadoEn": "…" } ],
      "personajes": [],
      "citas":      [],
      "conceptos":  []
    }
  ]
}
```

Los timestamps se guardan como texto ISO y se convierten de nuevo a `Timestamp` al restaurar.
