import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

// Intenta iniciar sesión. Lanza un error con mensaje legible si falla.
export async function login(email, password) {
  try {
    const credenciales = await signInWithEmailAndPassword(auth, email, password);
    return credenciales.user;
  } catch (error) {
    throw new Error(mensajeDeError(error.code));
  }
}

// Autoregistro público: crea la cuenta de Auth y su perfil en Firestore
// en estado "pendiente" — las reglas de Firestore exigen que un
// documento creado por el propio usuario nazca así (rol lector,
// estado pendiente); solo un admin puede luego activarlo o subirle
// el rol, desde el panel de administración.
export async function registrarse(email, password, nombre) {
  try {
    const credenciales = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credenciales.user.uid;
    await setDoc(doc(db, "usuarios", uid), {
      email,
      nombre: nombre || "",
      rol: "lector",
      estado: "pendiente",
      creadoEn: serverTimestamp()
    });
    // createUserWithEmailAndPassword deja la sesión iniciada automáticamente;
    // la cerramos para que la persona vea el aviso de "pendiente de
    // aprobación" en vez de que la redirección a la app gane la carrera.
    await signOut(auth);
  } catch (error) {
    throw new Error(mensajeDeError(error.code));
  }
}

export async function enviarRestablecimiento(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    throw new Error(mensajeDeError(error.code));
  }
}

export async function loginConGoogle() {
  try {
    const proveedor = new GoogleAuthProvider();
    const credenciales = await signInWithPopup(auth, proveedor);
    return credenciales.user;
  } catch (error) {
    throw new Error(mensajeDeError(error.code));
  }
}

export function logout() {
  return signOut(auth);
}

// Ejecuta callback(usuario) cada vez que cambia el estado de sesión.
// usuario es null si no hay nadie logueado.
export function vigilarSesion(callback) {
  return onAuthStateChanged(auth, callback);
}

function mensajeDeError(code) {
  const mensajes = {
    "auth/invalid-email": "El correo no es válido.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "No existe un usuario con ese correo.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar.",
    "auth/unauthorized-domain": "Este dominio no está autorizado para iniciar sesión con Google. Agrégalo en Firebase → Authentication → Settings → Authorized domains."
  };
  return mensajes[code] || "No se pudo completar la operación. Inténtalo de nuevo.";
}
