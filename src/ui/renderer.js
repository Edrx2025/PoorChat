// --- ELEMENTOS DE LA ESTRUCTURA SEMÁNTICA (FORMULARIOS) ---
const formLogin = document.getElementById("form-login");
const formChatInput = document.getElementById("form-chat-input");

// --- ELEMENTOS DE LA PANTALLA DE LOGIN ---
const loginContainer = document.getElementById("login-container");
const chatContainer = document.getElementById("chat-container");
const btnConectar = document.getElementById("btn-conectar");
const lblEstado = document.getElementById("lbl-estado");

// Nota: Se eliminaron inputIp e inputPuerto ya que la red se gestiona en el backend
const inputUsuario = document.getElementById("input-usuario");

// --- ELEMENTOS DE LA PANTALLA DE CHAT ---
const userTag = document.getElementById("user-tag");
const boxMensajes = document.getElementById("box-mensajes");
const inputMensaje = document.getElementById("input-mensaje");

// Variable local para almacenar la identidad del usuario logueado
let miUsuario = "";

// --- GESTIÓN DEL FORMULARIO DE AUTENTICACIÓN ---

/**
 * Escucha el envío del formulario de login.
 * Se dispara tanto al hacer clic en el botón como al presionar 'Enter' en el input.
 */
formLogin.addEventListener("submit", (e) => {
  // Evita que la página web de Electron se recargue al enviar el formulario
  e.preventDefault();

  const usuario = inputUsuario.value.trim();

  // Validación de seguridad para confirmar que el campo no esté vacío
  if (!usuario) {
    lblEstado.innerText = "Error: El nombre de usuario es obligatorio";
    cambiarEstiloEstado("error");
    return;
  }

  miUsuario = usuario;
  lblEstado.innerText = "Estado: Conectando a la red...";
  cambiarEstiloEstado("conectando");
  btnConectar.disabled = true;

  // Invocación simplificada: El proceso principal ya conoce la IP y el Puerto
  window.poorChatAPI.enviarLogin(usuario);
});

// --- GESTIÓN DEL ENTRADA DE MENSAJES---

/**
 * Escucha el envío del formulario de redacción del chat.
 * Resuelve fluidamente el envío con la tecla Enter dentro del cuadro de texto.
 */
formChatInput.addEventListener("submit", (e) => {
  e.preventDefault();

  const texto = inputMensaje.value.trim();

  // Si el cuadro de mensaje está vacío, ignoramos la acción
  if (!texto) return;

  // 1. Pintamos inmediatamente tu propio mensaje en tu columna derecha (esMio = true)
  renderizarBurbujaTexto(miUsuario, texto, true);

  // 2. TRANSMISIÓN REAL: Enviamos el texto al proceso principal a través del puente seguro
  window.poorChatAPI.enviarMensajeTexto(texto);

  // 3. Limpieza del cuadro de texto y devolución del foco del teclado
  inputMensaje.value = "";
  inputMensaje.focus();
});

// -Red y señalización TCP ---

window.poorChatAPI.recibirRespuesta((mensaje) => {
  console.log("[Renderer] Datos recibidos desde la capa de red:", mensaje.type);

  switch (mensaje.type) {
    case "LOGIN_OK":
      lblEstado.innerText = "Estado: Autenticado correctamente";
      cambiarEstiloEstado("conectado");

      // Transición visual: Ocultamos la sección de login y desplegamos el área principal
      setTimeout(() => {
        loginContainer.style.display = "none";
        chatContainer.style.display = "flex";
        userTag.innerText = `@${miUsuario}`;
        inputMensaje.focus(); // Coloca el cursor directamente en el chat.
      }, 800);
      break;

    case "LOGIN_ERROR":
      lblEstado.innerText = `Error: ${mensaje.payload.message || "Credenciales inválidas"}`;
      cambiarEstiloEstado("error");
      btnConectar.disabled = false;
      break;

    case "TEXT_MESSAGE":
      /**
       * Escudo contra duplicación (UX de alta calidad):
       * Como tú ya pintas tu mensaje localmente al enviarlo, solo pintaremos en la izquierda
       * aquellos mensajes cuyo emisor sea un compañero diferente a ti.
       */
      if (mensaje.payload.emisor !== miUsuario) {
        renderizarBurbujaTexto(
          mensaje.payload.emisor,
          mensaje.payload.text,
          false,
        );
      }
      break;

    default:
      console.warn(
        "Tipo de paquete no controlado en esta fase de la interfaz:",
        mensaje.type,
      );
  }
});

// --- FUNCIONES AUXILIARES DE RENDERIZADO Y ESTILOS ---

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
 * @param {boolean} esMio - Si el mensaje fue originado por el usuario actual (true = derecha, false = izquierda)
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
