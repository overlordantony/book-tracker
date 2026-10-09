rules_version = '2';

// Reglas de seguridad de Firestore para la Bitácora de lectura.
// Pégalas en Firebase Console → Firestore Database → Rules → Publicar
// (o despliégalas con: firebase deploy --only firestore:rules).
//
// Importante: "Admin" y "Activo" van con mayúscula inicial, tal como los
// guarda la app. "lector", "pendiente" e "inactivo" van en minúscula.

service cloud.firestore {
  match /databases/{database}/documents {

    // ---------- Funciones auxiliares ----------
    function autenticado() {
      return request.auth != null;
    }
    function rutaPerfil(uid) {
      return /databases/$(database)/documents/usuarios/$(uid);
    }
    function tienePerfil() {
      return autenticado() && exists(rutaPerfil(request.auth.uid));
    }
    function perfilPropio() {
      return get(rutaPerfil(request.auth.uid)).data;
    }
    // Cuenta aprobada por un administrador
    function esActivo() {
      return tienePerfil() && perfilPropio().estado == 'Activo';
    }
    function esAdmin() {
      return esActivo() && perfilPropio().rol == 'Admin';
    }

    function rutaLibro(libroId) {
      return /databases/$(database)/documents/libros/$(libroId);
    }
    // ¿El libro (tal como está ahora) es mío?
    function esDuenoLibro(libroId) {
      return exists(rutaLibro(libroId)) &&
             get(rutaLibro(libroId)).data.propietarioUid == request.auth.uid;
    }
    // ¿El libro (tal como quedará tras el lote de escrituras) es mío?
    // Hace falta para restaurar respaldos: el libro y sus ítems se crean en el mismo lote.
    function esDuenoLibroDespues(libroId) {
      return existsAfter(rutaLibro(libroId)) &&
             getAfter(rutaLibro(libroId)).data.propietarioUid == request.auth.uid;
    }
    function subcoleccionValida(sub) {
      return sub in ['capitulos', 'personajes', 'citas', 'conceptos'];
    }

    // ---------- Perfiles de usuario ----------
    match /usuarios/{uid} {
      // Cada quien lee su perfil; el admin lee todos
      allow get: if autenticado() && (request.auth.uid == uid || esAdmin());
      allow list: if esAdmin();

      // Autoregistro: solo tu propio perfil, siempre como lector y pendiente de aprobación.
      // El admin puede crear perfiles ya activos (panel de administración).
      allow create: if esAdmin() || (
        autenticado() &&
        request.auth.uid == uid &&
        request.resource.data.keys().hasOnly(['email', 'nombre', 'rol', 'estado', 'creadoEn']) &&
        request.resource.data.rol == 'lector' &&
        request.resource.data.estado == 'pendiente'
      );

      // Solo un admin cambia roles/estados o elimina perfiles
      allow update, delete: if esAdmin();
    }

    // ---------- Libros ----------
    match /libros/{libroId} {
      // Lees tus libros; el admin lee los de todos (solo lectura)
      allow read: if esActivo() &&
                     (resource.data.propietarioUid == request.auth.uid || esAdmin());

      allow create: if esActivo() &&
                       request.resource.data.propietarioUid == request.auth.uid;

      allow update: if esActivo() &&
                       resource.data.propietarioUid == request.auth.uid &&
                       request.resource.data.propietarioUid == request.auth.uid;

      allow delete: if esActivo() &&
                       resource.data.propietarioUid == request.auth.uid;

      // ---------- Capítulos, personajes, citas y conceptos ----------
      match /{sub}/{itemId} {
        allow read: if esActivo() && subcoleccionValida(sub) &&
                       (esAdmin() || esDuenoLibro(libroId));

        allow create, update: if esActivo() && subcoleccionValida(sub) &&
                                 esDuenoLibroDespues(libroId);

        // Se evalúa contra el estado previo: así se pueden borrar ítems y libro en un mismo lote.
        allow delete: if esActivo() && subcoleccionValida(sub) &&
                         esDuenoLibro(libroId);
      }
    }
  }
}
