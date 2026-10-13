# Respaldos y recuperación

**Qué cubre un respaldo.** Un archivo `.json` con tus libros (incluidos los de la papelera) y sus capítulos, personajes, citas y conceptos. El texto con formato se guarda tal cual (con sus marcas `**negrita**`, etc.), así que no se pierde nada al restaurar. No incluye cuentas de acceso, contraseñas ni perfiles de usuario.

**Cuándo hacerlo.** Antes de: restaurar otro respaldo, eliminar libros definitivamente, desplegar cambios de la app o de las reglas. Recomendado además de forma periódica (p. ej. una vez al mes); es la única copia fuera de Firestore.

**Dónde guardarlo.** Fuera del navegador: carpeta sincronizada, disco externo o correo propio. Conserva al menos los últimos 3.

**Cómo recuperar**
1. En la biblioteca: **Cargar respaldo** → elige el archivo.
2. Revisa el resumen y, si quieres, pulsa «Descargar una copia de lo actual».
3. Confirma. La restauración escribe todo lo del archivo y después elimina lo propio que no esté en él; si se corta a medias basta con repetirla con el mismo archivo (es idempotente).

**Compatibilidad del formato.** `version: 1`. Esta versión añade un campo opcional `eliminadoEn` en los libros enviados a la papelera; los respaldos anteriores se restauran sin cambios y los nuevos funcionan con la misma estructura. Si un día se cambia el formato de forma incompatible, se subirá `version` y la restauración rechazará archivos más nuevos con un mensaje claro.

**Eliminar definitivamente no tiene vuelta atrás.** Si hay duda, descarga un respaldo antes.
