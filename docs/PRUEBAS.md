# Pruebas de regresión y operación

La app no tiene proceso de build ni dependencias npm, así que las pruebas son de dos tipos:
una **automática** (formato de texto) y una **lista manual** para lo que depende de Firebase.

## 1. Prueba automática (sin dependencias)

```bash
node tests/formato.test.mjs
```

Comprueba el módulo `js/formato.js`: marcas de formato, listas, enlaces, que el texto antiguo
(sin formato) no cambie y que ninguna entrada maliciosa (`<script>`, `javascript:`, atributos
de evento…) genere HTML peligroso. Hay que ejecutarla cada vez que se toque ese archivo.

## 2. Lista manual (antes de publicar un cambio)

Usa una cuenta de prueba **o** haz antes un respaldo (`Descargar respaldo`).

**Acceso y permisos**
- [ ] Un usuario `Activo` entra y ve solo sus libros.
- [ ] Un usuario `Pendiente` e `Inactivo` ven el aviso y no pueden usar la app.
- [ ] Un `Admin` abre `admin.html`, ve la lista de usuarios y puede abrir «Ver biblioteca» de otro (solo lectura: sin editar, sin papelera).
- [ ] Un `Lector` que abre `admin.html` ve «No tienes permisos».
- [ ] Autoregistro: la cuenta nueva queda `Pendiente`.

**Libros y subcolecciones**
- [ ] Crear un libro; editarlo (aparece actualizado en el resumen y en la biblioteca).
- [ ] Crear, editar y eliminar un capítulo, un personaje, una cita y un concepto.
- [ ] Fallo simulado: con la red cortada, guardar muestra un mensaje de error (no falla en silencio).

**Papelera (Fase 1)**
- [ ] «Mover a la papelera» (desde el detalle) pide confirmación y el libro desaparece de la biblioteca, de las estadísticas y de las citas.
- [ ] En la pestaña **Papelera** aparece con su fecha; «Restaurar» lo devuelve con todo su contenido.
- [ ] Un libro en la papelera, abierto desde un enlace, se ve en solo lectura con el aviso.
- [ ] «Eliminar definitivamente» muestra cuántos capítulos/personajes/citas/conceptos se borrarán; tras confirmar, el libro **y** sus subcolecciones desaparecen (revisa en Firestore Console que no quedan documentos huérfanos en `libros/{id}/…`).
- [ ] El botón de eliminar definitivamente nunca aparece fuera de la papelera.

**Administración (Fase 1)**
- [ ] El admin no puede cambiar su propio rol/estado (los campos están deshabilitados).
- [ ] No se puede quitar el último administrador activo (aparece un mensaje).
- [ ] Desactivar a un usuario pide confirmación; el usuario desactivado ve «Tu cuenta está inactiva».

**Biblioteca (Fase 2)**
- [ ] Filtros por estado, género, etiqueta, formato, calificación y progreso, combinados; aparecen como chips y se pueden quitar uno a uno o con «Limpiar filtros».
- [ ] Cambiar entre Lista y Cuadrícula; al recargar se recuerda la elección y el orden.
- [ ] Con más de 24 libros, «Mostrar más» agrega otros 24 sin perder filtros ni orden.
- [ ] Todo se puede usar solo con teclado (tarjetas, filtros, botones, modales); los modales atrapan el foco y se cierran con Esc.
- [ ] Probar en móvil (≈ 360 px) y en escritorio, en tema claro y oscuro.
- [ ] Estadísticas: sin libros / sin capítulos muestran mensajes que explican qué hacer; «Ver datos como tabla» muestra los mismos números que la gráfica.

**Texto con formato (Fase 3)**
- [ ] Notas del libro, resumen de capítulo, descripción de personaje, nota de cita y significado de concepto: la barra aplica negrita, cursiva, subrayado, tachado, resaltado, listas y enlaces; «Vista previa» muestra el resultado.
- [ ] Un texto antiguo (sin formato) se ve igual que antes.
- [ ] Escribir `<script>alert(1)</script>` en una nota se muestra como texto, nunca se ejecuta; un enlace `javascript:` no se vuelve enlace.
- [ ] «Exportar guía» conserva el formato y no deja `\n` literales entre notas y observaciones.
- [ ] El respaldo guarda el texto con marcas y al restaurarlo se ve igual.
- [ ] Si intentas salir del detalle con un formulario a medias, el navegador avisa.

**Respaldos**
- [ ] «Descargar respaldo» → «Cargar respaldo» con el mismo archivo: mismos libros y contenido (incluidos los de la papelera, que siguen en la papelera).
- [ ] Un respaldo tomado **antes** de esta versión (sin `eliminadoEn`) se restaura sin errores.

## 2a. Respaldo de un solo libro

- `node tests/respaldo-libro.test.mjs` pasa.
- Detalle de un libro → **Exportar libro (.json)**: baja `libro-<título>-<fecha>.json`; el archivo no contiene ids ni tu uid.
- Biblioteca → **Importar libro** → elige ese archivo: aparece la confirmación con título y conteos; al aceptar se añade un libro nuevo y el original queda intacto.
- Con otra cuenta, importa el mismo archivo: queda como libro propio de esa cuenta.
- **Cargar respaldo** con un archivo de un libro se rechaza (no cambia nada); **Importar libro** con un respaldo general (varios libros) se rechaza.
- Un `.json` manipulado (enlaces `javascript:`, estado inválido, `propietarioUid` ajeno) se importa saneado y a tu nombre.
- Admin viendo otra biblioteca: sin «Importar libro»; sí puede exportar un libro ajeno.

## 2b. Lector integrado (`lector.html`)

- `node tests/sincronia.test.mjs` pasa.
- Con la cuenta A, abre un EPUB y un PDF, avanza, subraya con nota y comprueba en Firestore `lecturas/<uid>_<huella>` (`pos`, `ann`, `propietarioUid`).
- En otro dispositivo/navegador con la misma cuenta: el estante muestra el libro con «Falta el archivo»; al elegir el mismo archivo continúa en la misma posición y con las anotaciones.
- Abrir un libro sin navegar **no** cambia `posTs` en Firestore.
- Sin conexión: el indicador dice «Sin conexión»; al reconectar vuelve a «Sincronizado» con la última posición.
- Exportar → quitar el libro → Importar restaura posición y anotaciones.
- Rules Playground: otra cuenta no puede leer ni escribir `lecturas/<uidA>_*`; un `Admin` tampoco puede leerlas; una cuenta `Pendiente` no accede.
- Detalle del libro: «Leer en la app» → «Continuar leyendo (N %)» tras vincular un archivo.

## 3. Reglas de Firestore (Rules Playground)

Con `firestore.rules` publicadas, en **Firestore → Rules → Rules Playground** (cuentas de ejemplo):

| Simulación | Esperado |
|---|---|
| `get /libros/{libro de otro}` como Lector `Activo` | Denegado |
| `get /libros/{libro de otro}` como `Admin` | Permitido |
| `update /libros/{propio}` con `{eliminadoEn: …}` como Lector `Activo` | Permitido (papelera) |
| `delete /libros/{propio}/capitulos/{id}` mientras el libro existe | Permitido |
| `delete /libros/{propio}/capitulos/{id}` **después** de borrar el libro | Denegado (por eso se borra en ese orden) |
| `create /usuarios/{mi uid}` con `rol: 'Admin'` | Denegado |
| `update /usuarios/{otro}` como Lector | Denegado |
| Cualquier operación sin sesión | Denegado |
