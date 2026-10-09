import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { firebaseConfig } from "./firebase-config.js";

// Crea un usuario de Firebase Auth usando una instancia SECUNDARIA y
// temporal de la app. Esto es necesario porque createUserWithEmailAndPassword
// inicia sesión automáticamente como el usuario recién creado — si lo
// hiciéramos con la instancia principal, te sacaría a ti (el admin) de tu
// propia sesión. La instancia secundaria se descarta al terminar.
export async function crearUsuario(email, password, rol, nombre) {
  const nombreTemporal = "secundaria-" + Date.now();
  const appSecundaria = initializeApp(firebaseConfig, nombreTemporal);
  const authSecundaria = getAuth(appSecundaria);

  try {
    const credenciales = await createUserWithEmailAndPassword(authSecundaria, email, password);
    const uid = credenciales.user.uid;

    // Los usuarios creados desde el panel por un admin entran ya
    // "Activo" — el flujo de "Pendiente" es solo para quien se
    // autoregistra desde index.html.
    await setDoc(doc(db, "usuarios", uid), {
      email,
      nombre: nombre || "",
      rol,
      estado: "Activo",
      creadoEn: serverTimestamp()
    });

    return uid;
  } finally {
    await deleteApp(appSecundaria);
  }
}

export async function obtenerUsuarios() {
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Edita los datos del PERFIL en Firestore (nombre, rol). No puede tocar
// el correo ni la contraseña de otro usuario: eso solo lo puede cambiar
// Firebase Admin SDK (Cloud Functions de pago) o el propio usuario desde
// su sesión — con el plan gratuito, desde aquí no es posible.
export function actualizarUsuario(uid, cambios) {
  return updateDoc(doc(db, "usuarios", uid), cambios);
}
