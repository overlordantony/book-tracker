import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase-init.js";

// Devuelve el perfil completo { rol, estado, nombre, email } o null si
// todavía no existe documento (no debería pasar salvo justo después de
// un login de Google por primera vez, antes de asegurarPerfil()).
export async function obtenerPerfil(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? snap.data() : null;
}

// Si el usuario (recién logueado, típicamente por Google) todavía no
// tiene documento en "usuarios", se lo crea en estado "pendiente" para
// que un admin lo active. Si ya existe, no hace nada.
export async function asegurarPerfil(user) {
  const ref = doc(db, "usuarios", user.uid);
  const existente = await getDoc(ref);
  if (existente.exists()) return existente.data();

  const perfil = {
    email: user.email || "",
    nombre: user.displayName || "",
    rol: "lector",
    estado: "pendiente",
    creadoEn: serverTimestamp()
  };
  await setDoc(ref, perfil);
  return perfil;
}
