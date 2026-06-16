// src/ui/renderer.js

// --- ELEMENTOS DE LA PANTALLA DE LOGIN ---
const loginContainer = document.getElementById("login-container");
const chatContainer = document.getElementById("chat-container");
const btnConectar = document.getElementById("btn-conectar");
const lblEstado = document.getElementById("lbl-estado");

const inputIp = document.getElementById("input-ip");
const inputPuerto = document.getElementById("input-puerto");
const inputUsuario = document.getElementById("input-usuario");

// --- ELEMENTOS DE LA PANTALLA DE CHAT ---
const userTag = document.getElementById("user-tag");
const boxMensajes = document.getElementById("box-mensajes");
const inputMensaje = document.getElementById("input-mensaje");
const btnEnviar = document.getElementById("btn-enviar");

// Variable local para almacenar la identidad del usuario logueado
let miUsuario = "";

/**
 * Evento que dispara el intento de conexión de red local o remota
 */
btnConectar.addEventListener("click", () => {
  const ip = inputIp.value.trim();
  const puerto = inputPuerto.value.trim();
  const usuario = inputUsuario.value.trim();

  // Validación elemental de datos en el cliente
  if (!ip || !puerto || !usuario) {
    lblEstado.innerText = "Error: Todos los campos son obligatorios";
    cambiarEstiloEstado("error");
    return;
  }

  miUsuario = usuario;
  lblEstado.innerText = "Estado: Conectando a la red...";
  cambiarEstiloEstado("conectando");
  btnConectar.disabled = true;

  // Ejecución segura de la conexión invocando al puente (preload.js)
  window.poorChatAPI.enviarLogin(ip, puerto, usuario);
});

/**
 * Escucha centralizada de respuestas de datos del Servidor (Señalización TCP)
 */
window.poorChatAPI.recibirRespuesta((mensaje) => {
  console.log("[Renderer] Datos recibidos desde la capa de red:", mensaje.type);

  switch (mensaje.type) {
    case "LOGIN_OK":
      lblEstado.innerText = "Estado: Autenticado correctamente";
      cambiarEstiloEstado("conectado");

      // Transición visual: Ocultamos el Login y desplegamos el Chat room
      setTimeout(() => {
        loginContainer.style.display = "none";
        chatContainer.style.display = "flex";
        userTag.innerText = `@${miUsuario}`;
      }, 800);
      break;

    case "LOGIN_ERROR":
      lblEstado.innerText = `Error: ${mensaje.payload.message || "Credenciales inválidas"}`;
      cambiarEstiloEstado("error");
      btnConectar.disabled = false;
      break;

    case "TEXT_MESSAGE":
      // Gestión futura: Manejo automatizado de llegada de textos de terceros (Fase 5)
      renderizarBurbujaTexto(
        mensaje.payload.emisor,
        mensaje.payload.text,
        false,
      );
      break;

    default:
      console.warn(
        "Tipo de paquete no controlado en esta fase de la interfaz:",
        mensaje.type,
      );
  }
});

/**
 * Modifica las clases CSS del texto de estado para actualizar los colores dinámicamente
 * @param {string} estado - Tipo de estado ("desconectado" | "conectando" | "conectado" | "error")
 */
function cambiarEstiloEstado(estado) {
  lblEstado.className = "status-text " + estado;
}

/**
 * Genera de forma dinámica nodos HTML para pintar mensajes en pantalla
 * @param {string} emisor - Quién envía el mensaje
 * @param {string} texto - Cuerpo del mensaje
 * @param {boolean} esMio - Si el mensaje fue originado por el usuario actual
 */
function renderizarBurbujaTexto(emisor, texto, esMio) {
  const contenedorBurbuja = document.createElement("div");
  contenedorBurbuja.className = esMio
    ? "message-row mine"
    : "message-row theirs";

  const burbuja = document.createElement("div");
  burbuja.className = "message-bubble";
  burbuja.innerHTML = `<strong>${emisor}</strong><p>${texto}</p>`;

  contenedorBurbuja.appendChild(burbuja);
  boxMensajes.appendChild(contenedorBurbuja);

  // Auto-scroll automático hacia abajo para leer el último mensaje recibido
  boxMensajes.scrollTop = boxMensajes.scrollHeight;
}
