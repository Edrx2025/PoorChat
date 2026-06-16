// src/ui/renderer.js

// --- ELEMENTOS DE LA ESTRUCTURA SEMÁNTICA (FORMULARIOS) ---
const formLogin = document.getElementById("form-login");
const formChatInput = document.getElementById("form-chat-input");

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

// Variable local para almacenar la identidad del usuario logueado
let miUsuario = "";

// --- 🔐 GESTIÓN DEL FORMULARIO DE AUTENTICACIÓN (FASE 4) ---

/**
 * Escucha el envío del formulario de login.
 * Se dispara tanto al hacer clic en el botón como al presionar 'Enter' en los inputs.
 */
formLogin.addEventListener("submit", (e) => {
  // ⚠️ CRÍTICO: Evita que la página web de Electron se recargue/refresque al enviar el formulario
  e.preventDefault();

  const ip = inputIp.value.trim();
  const puerto = inputPuerto.value.trim();
  const usuario = inputUsuario.value.trim();

  // El atributo 'required' de HTML5 ya hace el trabajo, pero mantenemos esto como un doble escudo de seguridad
  if (!ip || !puerto || !usuario) {
    lblEstado.innerText = "Error: Todos los campos son obligatorios";
    cambiarEstiloEstado("error");
    return;
  }

  miUsuario = usuario;
  lblEstado.innerText = "Estado: Conectando a la red...";
  cambiarEstiloEstado("conectando");
  btnConectar.disabled = true;

  // Invocación segura al puente del proceso principal (main.js)
  window.poorChatAPI.enviarLogin(ip, puerto, usuario);
});

// --- 💬 GESTIÓN DEL ENTRADA DE MENSAJES (FASE 5) ---

/**
 * Escucha el envío del formulario de redacción del chat.
 * Resuelve fluidamente el envío con la tecla Enter dentro del cuadro de texto.
 */
formChatInput.addEventListener("submit", (e) => {
  e.preventDefault();

  const texto = inputMensaje.value.trim();

  // Si el cuadro de mensaje está vacío, ignoramos la acción
  if (!texto) return;

  // Pinta inmediatamente tu propio mensaje en tu interfaz local en la columna derecha
  renderizarBurbujaTexto(miUsuario, texto, true);

  // Limpia el cuadro de texto para el próximo mensaje y le devuelve el foco del teclado
  inputMensaje.value = "";
  inputMensaje.focus();

  /* 🚀 NOTA PARA MAÑANA (Fase 5):
    Aquí añadirás la llamada a tu preload para empujar el texto al socket TCP:
    window.poorChatAPI.enviarMensajeTexto(texto);
  */
});

// --- 📡 RED Y SEÑALIZACIÓN TCP (ESCUCHA CENTRALIZADA) ---

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
        inputMensaje.focus(); // Coloca el cursor en el input del chat para mejorar la UX
      }, 800);
      break;

    case "LOGIN_ERROR":
      lblEstado.innerText = `Error: ${mensaje.payload.message || "Credenciales inválidas"}`;
      cambiarEstiloEstado("error");
      btnConectar.disabled = false;
      break;

    case "TEXT_MESSAGE":
      // Procesa y renderiza mensajes entrantes de otros compañeros en el chat room
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

// --- 🛠️ FUNCIONES AUXILIARES DE RENDERIZADO Y ESTILOS ---

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
