# Respaldos y recuperación

**Qué cubre un respaldo.** Un archivo `.json` con tus libros (incluidos los de la papelera) y sus capítulos, personajes, citas y conceptos. El texto con formato se guarda tal cual (con sus marcas `**negrita**`, etc.), así que no se pierde nada al restaurar. No incluye cuentas de acceso, contraseñas ni perfiles de usuario.

**Cuándo hacerlo.** Antes de: restaurar otro respaldo, eliminar libros definitivamente, desplegar cambios de la app o de las reglas. Recomendado además de forma periódica (p. ej. una vez al mes); es la única copia fuera de Firestore.

**Dónde guardarlo.** Fuera del navegador: carpeta sincronizada, disco externo o correo propio. Conserva al menos los últimos 3.

**Cómo recuperar**
1. En la biblioteca: **Cargar respaldo** → elige el archivo.
2. Revisa el resumen y, si quieres, pulsa «Descargar una copia de lo actual».
3. Confirma. La restauración escribe todo lo del archivo y después elimina lo propio que no esté en él; si se corta a medias basta con repetirla con el mismo archivo (es idempotente).

**Respaldo de un solo libro.** Además del respaldo general, cada libro se puede exportar solo: en el detalle del libro, **Exportar libro (.json)**. El archivo trae el libro con sus capítulos, personajes, citas y conceptos, **sin ids ni el identificador del dueño** (no revela quién lo exportó), así que sirve como respaldo puntual y para compartirlo con otra persona.
- **Importar libro** (en la biblioteca) solo **añade**: siempre crea un libro **nuevo**, con ids nuevos y a nombre de quien importa; no modifica ni borra nada de lo existente. Si el libro ya estaba en tu biblioteca, queda una copia (elimina la que no quieras). Se conservan las fechas de creación y actualización del archivo, así que las estadísticas no se distorsionan.
- Es distinto de **Cargar respaldo**, que **reemplaza** toda la biblioteca. Para evitar accidentes, «Cargar respaldo» rechaza los archivos de un solo libro y «Importar libro» rechaza los de varios libros.
- Un archivo compartido se trata como entrada no confiable: solo se conservan los campos conocidos, con tipos y tamaños acotados (máx. 2000 elementos por apartado), enlaces solo `http(s)` y fechas no futuras; el dueño siempre es quien importa. El texto no se interpreta como HTML al mostrarse.
- La importación crea primero el libro oculto en la papelera, luego sus elementos y por último lo hace visible; si algo falla a medias, el libro incompleto se elimina solo y se puede **Reintentar**.
- No incluye la lectura del lector integrado (posición y anotaciones): son privadas y tienen su propio «Exportar datos».

**Compatibilidad del formato.** `version: 1` (el archivo de un libro suma `tipo: "libro"` y lleva un solo libro). Esta versión añade un campo opcional `eliminadoEn` en los libros enviados a la papelera; los respaldos anteriores se restauran sin cambios y los nuevos funcionan con la misma estructura. Si un día se cambia el formato de forma incompatible, se subirá `version` y la restauración rechazará archivos más nuevos con un mensaje claro.

**Eliminar definitivamente no tiene vuelta atrás.** Si hay duda, descarga un respaldo antes.
