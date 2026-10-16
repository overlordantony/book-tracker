# Guía de Firebase para la Bitácora de lectura

Esta guía te lleva de cero a tener tu propia copia de la app funcionando con Firebase y publicada como sitio estático en **Netlify**. La app no tiene un proceso de build; para la configuración actual no se requieren Cloud Functions.

**Qué vas a crear:** un proyecto de Firebase con *Authentication* (correo/contraseña y Google) y *Cloud Firestore* (base de datos). Las reglas de seguridad están versionadas en `firestore.rules` (el paso 5 explica cómo publicarlas).

Índice: [1 Proyecto](#1-crear-el-proyecto) · [2 App web](#2-registrar-la-app-web-y-copiar-la-configuración) · [3 Authentication](#3-activar-authentication) · [4 Firestore](#4-crear-firestore) · [5 Reglas](#5-publicar-las-reglas-de-seguridad) · [6 Primer admin](#6-crear-el-primer-administrador) · [7 Probar](#7-probar-en-local) · [8 Netlify](#8-publicar-en-netlify) · [9 Seguridad](#9-recomendaciones-de-seguridad-y-límites) · [10 Problemas](#10-problemas-frecuentes) · [Anexo: modelo de datos](#anexo-modelo-de-datos)

---

## 1. Crear el proyecto

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Agregar proyecto** → ponle nombre (p. ej. `bitacora-lectura`).
3. Google Analytics es opcional; puedes desactivarlo.
4. Espera a que termine y pulsa **Continuar**.

## 2. Registrar la app web y copiar la configuración

1. En la pantalla del proyecto, pulsa el icono **`</>` (Web)**.
2. Ponle un apodo (p. ej. `bitacora-web`). No necesitas marcar Firebase Hosting; el sitio se publica en Netlify.
3. Firebase te mostrará un bloque `firebaseConfig`. También lo encuentras luego en **⚙️ Configuración del proyecto → Tus apps**.
4. En tu copia del repositorio, configura `js/firebase-config.js` con los valores de tu app web (este checkout no incluye `js/firebase-config.example.js`):

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

> La configuración web **no es secreta** (cualquier visitante la descarga con la página). Lo que protege tus datos son las **reglas de Firestore** (paso 5) y las restricciones de API recomendadas (§9).

La app usa el SDK **modular 12.19.0 cargado por CDN** (`https://www.gstatic.com/firebasejs/12.19.0/...`), así que no hay que instalar nada con `npm`.

## 3. Activar Authentication

1. Menú **Compilación → Authentication → Comenzar**.
2. Pestaña **Sign-in method** y habilita:
   - **Correo electrónico/contraseña** (solo el primer interruptor; el *enlace por correo* no hace falta).
   - **Google** (elige un correo de asistencia del proyecto y guarda).
3. Pestaña **Settings → Authorized domains**: deben estar `localhost` (viene por defecto) y el dominio de Netlify (por ejemplo, `nombre-del-sitio.netlify.app`), además de cualquier dominio personalizado. Si falta, Google devolverá `auth/unauthorized-domain`.
4. (Opcional) En **Templates** puedes personalizar el correo de "restablecer contraseña", que usa el enlace "¿Olvidaste tu contraseña?".

## 4. Crear Firestore

1. **Compilación → Firestore Database → Crear base de datos**.
2. Elige la **ubicación** (no se puede cambiar después; escoge una cercana a tus usuarios).
3. Modo **producción** (las reglas del paso siguiente sustituyen el modo de prueba).

No hace falta crear colecciones a mano salvo el primer administrador (paso 6). La app crea `libros` y sus subcolecciones al usarla.

**Índices:** la app no necesita índices compuestos (las consultas filtran por un solo campo y el orden se hace en el cliente o con un `orderBy` simple), así que no tienes que crear ninguno.

## 5. Publicar las reglas de seguridad

El archivo [`firestore.rules`](../firestore.rules) de la raíz es la **fuente versionada** de las reglas (es copia literal de las publicadas en la consola el 2026-10-13; la lógica no se ha modificado). `firebase.json` ya apunta a él. No uses reglas abiertas como `allow read, write: if true`.

Las reglas garantizan:

| Colección | Quién puede qué |
|---|---|
| `usuarios/{uid}` | Cada persona lee su perfil; solo un admin lista, edita o borra perfiles. Cualquiera puede **crear su propio perfil** únicamente como `rol: "Lector"` y `estado: "Pendiente"`. |
| `libros/{id}` | Solo cuentas `Activo`. Cada una lee/escribe **solo sus libros** (`propietarioUid == su uid`). Un `Admin` lee los de todos (solo lectura). |
| `libros/{id}/capitulos│personajes│citas│conceptos` | Mismo criterio que el libro padre (el dueño escribe; el dueño y el admin leen). |
| `lecturas/{uid}_{huella}` | Solo cuentas `Activo`, y solo el **dueño** (`propietarioUid`) lee, crea, edita y borra; el id debe empezar por su uid y `ann` ≤ 3000 elementos. **Ni un `Admin` puede leerlas** (notas personales). |
| Cualquier otra ruta | Denegada. |

**Para publicarlas:**

- *Desde la consola:* **Firestore Database → Rules**, pega el contenido de `firestore.rules` y pulsa **Publicar**.
- *Con Firebase CLI:* `firebase login`, `firebase use --add` y `firebase deploy --only firestore:rules`.

Después de cambiar reglas, ejecuta la tabla de «Rules Playground» y la lista manual de [PRUEBAS.md](PRUEBAS.md).

**Cómo encajan las reglas con la app (sin cambios en las reglas):**

- **Papelera:** mover un libro a la papelera es un `update` normal del libro (campo `eliminadoEn`), que el dueño activo ya puede hacer.
- **Eliminar definitivamente:** las subcolecciones se comprueban leyendo el libro padre (`get()`), así que la app borra **primero** capítulos, personajes, citas y conceptos (en lotes de 400) y **al final** el libro. Si se interrumpe, el libro sigue en la papelera y se puede repetir.
- **Restaurar respaldo:** usa lotes de hasta 400 operaciones; cada operación evalúa dos `get()` (perfil y libro), dentro de los límites de Firestore.

**Observaciones sobre las reglas actuales (no modificadas a propósito, por si decides endurecerlas más adelante):**

- La regla de subcolecciones usa un comodín (`/{subcoleccion}/{docId}`): el dueño activo podría crear subcolecciones con otros nombres. Limitarlo a `capitulos|personajes|citas|conceptos` sería más estricto.
- Las reglas **no validan campos** (el dueño puede escribir cualquier campo en sus libros) ni impiden que un admin se cambie su propio rol/estado o deje la app sin administradores. Esas protecciones existen solo en la interfaz de `admin.html`; no son una barrera de seguridad frente a quien llame a Firestore directamente.

> ⚠️ Los valores distinguen mayúsculas: **`Admin`**, **`Lector`**, **`Activo`**, **`Pendiente`** e **`Inactivo`**. Usa estos valores al configurar perfiles y reglas.


## 6. Crear el primer administrador

El autorregistro crea perfiles con rol `Lector` y estado `Pendiente`. Para crear el **primer** administrador, crea la cuenta y su perfil manualmente desde las consolas de Authentication y Firestore:

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

- **Autoregistro** (`index.html` → "Regístrate", o el primer acceso con Google): crea la cuenta con estado `Pendiente`. En `admin.html` el admin la pasa a `Activo`.
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

## 8. Publicar en Netlify

El repositorio contiene páginas estáticas y módulos ES, sin comando de build. Para el despliegue actual:

1. En Netlify, crea un sitio conectado al repositorio o publica manualmente la carpeta del proyecto.
2. Configura la raíz del repositorio como directorio de publicación y deja vacío el comando de build.
3. Comprueba que el despliegue publicado tenga el archivo `js/firebase-config.js` con la configuración web del proyecto Firebase. Las variables de entorno de Netlify no se insertan automáticamente en archivos estáticos.
4. Agrega el dominio `*.netlify.app` concreto del sitio y cualquier dominio personalizado en **Firebase → Authentication → Settings → Authorized domains**.
5. Prueba acceso, lectura/escritura y permisos en el dominio publicado. La aplicación no incluye actualmente un archivo de configuración de despliegue Netlify versionado.

## 9. Recomendaciones de seguridad y límites

- **Las reglas son tu seguridad real.** No cambies a "modo de prueba"/`allow read, write: if true`.
- **Restringe la API key** (recomendado): Google Cloud Console → *APIs y servicios → Credenciales* → tu *Browser key* → **Restricciones de aplicaciones: Sitios web (referentes HTTP)** y agrega el dominio de producción (por ejemplo, `https://nombre-del-sitio.netlify.app/*`), cualquier dominio personalizado y `http://localhost:*`.
- **Aprobación manual**: nadie usa la app hasta que un admin lo pone en `Activo`; mantén al menos un admin de respaldo.
- **Cuotas del plan Spark**: Firestore y Authentication tienen límites diarios/mensuales gratuitos. Para uso personal o de un grupo pequeño sobran, pero consulta los límites vigentes en la documentación de Firebase. Cada lectura de reglas con `get()` cuenta como lectura; la app está pensada para uso moderado.
- **Respaldos**: descarga respaldos periódicos (`Descargar respaldo`); es la única copia fuera de Firestore.
- **Eliminar libros:** se hace en dos pasos (papelera → eliminar definitivamente) y la app borra también las subcolecciones, que Firestore no borra solo. Ver [RESPALDOS.md](RESPALDOS.md).
- **Eliminar cuentas de usuario** (acceso en Authentication + datos) no se puede hacer desde el navegador con el plan gratuito: requiere una Cloud Function con el Admin SDK. Mientras tanto se usa el estado `Inactivo`; si hace falta borrar del todo, se hace a mano en la consola de Firebase.

## 10. Problemas frecuentes

| Mensaje / síntoma | Qué revisar |
|---|---|
| `Missing or insufficient permissions` | ¿Publicaste las reglas? ¿Existe `usuarios/{uid}` con **el mismo UID** de Authentication? ¿`rol`/`estado` con la capitalización exacta (`Admin`, `Activo`)? |
| Mensaje "Tu cuenta está pendiente de aprobación" | El perfil está en `Pendiente`: un admin debe activarlo. |
| "Tu cuenta está inactiva" | El admin la dejó en `Inactivo`. |
| El usuario inicia sesión con Google y no entra | Primera vez: se crea `Pendiente`; falta la aprobación. |
| `auth/unauthorized-domain` | Falta el dominio en *Authorized domains* (§3.3). |
| `auth/operation-not-allowed` | El método (correo o Google) no está habilitado (§3.2). |
| `auth/invalid-api-key` / config vacía | `js/firebase-config.js` sin rellenar o con valores equivocados. |
| `auth/popup-blocked` | El navegador bloqueó la ventana de Google; permite *pop-ups* para el sitio. |
| Estadísticas de páginas en 0 | Los capítulos necesitan rango de páginas (inicio y fin) para sumar. |
| El sitio publicado no refleja los cambios | Service worker/caché: recarga forzada (Ctrl+F5) o borra los datos del sitio. |
| "Cargar respaldo" falla con permisos | Compara las reglas publicadas con `firestore.rules`; deben coincidir. |
| "No se pudo completar … Reintentar" al eliminar definitivamente | Se interrumpió a medias (red/permisos). El libro sigue en la papelera: pulsa «Reintentar» o vuelve a intentarlo. |

---

## Anexo: modelo de datos

### `usuarios/{uid}`  (el id es el UID de Firebase Authentication)

| Campo | Tipo | Notas |
|---|---|---|
| `email` | string | |
| `nombre` | string | Nombre o apodo |
| `rol` | string | `Lector` \| `Admin` |
| `estado` | string | `Pendiente` \| `Activo` \| `Inactivo` |
| `creadoEn` | timestamp | |

### `libros/{libroId}`

| Campo | Tipo | Notas |
|---|---|---|
| `propietarioUid` | string | UID del dueño (lo exigen las reglas) |
| `titulo`, `autor` | string | Obligatorios en el formulario |
| `portadaUrl`, `url` | string | Portada y enlace de tienda |
| `generos`, `etiquetas` | array<string> | |
| `estado` | string | `Pendiente` \| `leyendo` \| `pausado` \| `terminado` \| `descartado` |
| `formato` | string | `fisico` \| `digital` \| `audiolibro` |
| `totalPaginas`, `paginaActual` | number | |
| `fechaInicio`, `fechaFin` | string `AAAA-MM-DD` | |
| `calificacion` | number 1–5 | |
| `notas`, `observaciones` | string | Texto con marcas de formato (ver abajo) |
| `eliminadoEn` | timestamp (opcional) | Si existe, el libro está en la papelera. No altera `actualizadoEn` |
| `creadoEn`, `actualizadoEn` | timestamp | Base de las estadísticas |

### Subcolecciones de `libros/{libroId}`

| Subcolección | Campos |
|---|---|
| `capitulos` | `numero` (number), `titulo`, `rangoPaginas` `{inicio, fin}` (numbers), `resumen`, `puntosClave` (array), `creadoEn` |
| `personajes` | `nombre`, `rol`, `relevancia` (`principal` \| `secundario` \| `menor` \| `mencionado`), `alias` (array), `descripcion`, `conexiones` (array), `creadoEn` |
| `citas` | `texto`, `pagina` (number\|null), `etiqueta`, `nota`, `favorita` (boolean), `creadoEn` |
| `conceptos` | `nombre`, `significado`, `creadoEn` |

### Texto con formato

`notas`, `observaciones`, `capitulos.resumen`, `personajes.descripcion`, `citas.nota` y `conceptos.significado` se guardan como **texto normal con marcas** (subconjunto de Markdown): `**negrita**`, `*cursiva*`, `++subrayado++`, `~~tachado~~`, `==resaltado==`, listas con `- ` o `1. ` y enlaces `[texto](https://…)`. No se guarda HTML; el texto se escapa al mostrarlo y solo se generan etiquetas permitidas (`js/formato.js`). Los textos antiguos siguen siendo válidos sin migración.

### `lecturas/{uid}_{huella}`  (lector integrado; colección independiente)

| Campo | Tipo | Notas |
|---|---|---|
| `propietarioUid`, `huella` | string | Dueño y SHA-256 (32 hex) del archivo: identifica el mismo libro en cualquier dispositivo |
| `titulo`, `autor`, `formato` (`epub`\|`pdf`), `tamano`, `nombreArchivo` | | Metadatos del archivo |
| `libroId` | string \| null | Libro de la bitácora vinculado (`libros/{id}`) |
| `pos` `{cap, frac}`, `pct`, `posTs` | map, number, number (ms) | Posición (capítulo/página y fracción), porcentaje y marca de tiempo del cliente |
| `ann` (array), `annTs` | array<map>, number (ms) | Anotaciones `{id, cap, ini, fin, texto, color, nota, fecha}` |
| `portadaMini` | string (dataURL JPEG) | Miniatura para el estante en otros dispositivos |
| `version`, `creadoEn`, `ultimaLecturaEn` | | Esquema y fechas del servidor |

No se guarda el archivo del libro. Para continuidad real del archivo entre dispositivos habría que añadir Firebase Storage (requiere plan Blaze y sus propias reglas).

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

Los timestamps (`creadoEn`, `actualizadoEn` y, si existe, `eliminadoEn`) se guardan como texto ISO y se convierten de nuevo a `Timestamp` al restaurar. Más detalles en [RESPALDOS.md](RESPALDOS.md).
