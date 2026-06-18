// server.js
const net = require("net");

const PORT = 5001;

const HOST = "100.106.194.21"; //Colocas aquí la ip de tailscale de carlos.

// Estructura de datos en memoria para almacenar las sesiones activas
// Guardaremos los sockets indexados por su nombre de usuario
const clientesActivos = new Map();

/**
 * Servidor Central TCP - PoorChat
 */
const server = net.createServer((socket) => {
  // Guardamos temporalmente una referencia al usuario de este cable TCP
  let usuarioDelSocket = null;

  console.log(
    `[Servidor] Nueva conexión TCP detectada desde: ${socket.remoteAddress}:${socket.remotePort}`,
  );

  // Hilo de escucha de datos entrantes desde los clientes de Electron
  socket.on("data", (data) => {
    // El protocolo exige separar los paquetes por saltos de línea \n
    const lineas = data.toString().split("\n");

    for (let linea of lineas) {
      if (!linea.trim()) continue; // Ignoramos líneas vacías

      try {
        const paquete = JSON.parse(linea.trim());
        console.log(`[Servidor] Paquete recibido de tipo: [${paquete.type}]`);

        // --- ENRUTADOR DE PROTOCOLO ---
        switch (paquete.type) {
          case "LOGIN":
            const { username } = paquete.payload;

            if (!username) {
              enviarPaquete(socket, {
                type: "LOGIN_ERROR",
                payload: {
                  message: "El nombre de usuario no puede estar vacío.",
                },
              });
              return;
            }

            // Guardamos la sesión en el mapa de activos
            usuarioDelSocket = username;
            clientesActivos.set(username, socket);
            console.log(
              `[Servidor] Usuario @${username} autenticado y registrado con éxito.`,
            );

            // Respondemos el LOGIN_OK oficial para desbloquear la UI de Electron
            enviarPaquete(socket, {
              type: "LOGIN_OK",
              payload: {},
            });
            break;

          case "TEXT_MESSAGE":
            // Si el cliente intenta mandar texto sin haberse logueado antes, lo rebotamos
            if (!usuarioDelSocket) {
              enviarPaquete(socket, {
                type: "LOGIN_ERROR",
                payload: {
                  message: "No autorizado. Debes iniciar sesión primero.",
                },
              });
              return;
            }

            console.log(
              `[Chat] @${paquete.payload.emisor} dice: "${paquete.payload.text}"`,
            );

            // RETRANSMISIÓN (Broadcast): Le enviamos el mensaje a TODOS los demás usuarios conectados
            retransmitirMensaje(paquete, usuarioDelSocket);
            break;

          default:
            console.warn(
              `[Servidor] Tipo de paquete desconocido: ${paquete.type}`,
            );
        }
      } catch (error) {
        console.error(
          "[Servidor] Error al parsear el JSON entrante:",
          error.message,
        );
      }
    }
  });

  // Control cuando un usuario cierra su app de Electron de golpe o escribe "salir"
  socket.on("end", () => {
    removerCliente(usuarioDelSocket);
  });

  // Control de errores de infraestructura (Cierre forzado de red)
  socket.on("error", (err) => {
    console.error(
      `[Servidor] Error en el socket de @${usuarioDelSocket || "Desconocido"}:`,
      err.message,
    );
    removerCliente(usuarioDelSocket);
  });
});

// --- FUNCIONES AUXILIARES DE ARQUITECTURA ---

/**
 * Empuja un objeto javascript convertido a string con el salto de línea obligatorio \n
 */
function enviarPaquete(socket, objetoMensaje) {
  if (socket && !socket.destroyed) {
    socket.write(JSON.stringify(objetoMensaje) + "\n");
  }
}

/**
 * Envía el mensaje a todos los usuarios activos en la red excepto al que lo originó
 */
function retransmitirMensaje(paqueteJson, emisorOriginal) {
  clientesActivos.forEach((socketCliente, username) => {
    // No se lo enviamos al emisor original porque su UI ya lo pintó localmente
    if (username !== emisorOriginal) {
      enviarPaquete(socketCliente, paqueteJson);
    }
  });
}

/**
 * Limpia el mapa de memoria cuando alguien se desconecta
 */
function removerCliente(username) {
  if (username && clientesActivos.has(username)) {
    clientesActivos.delete(username);
    console.log(
      `[Servidor] Usuario @${username} se ha desconectado de la sala.`,
    );
  }
}

// --- ACTIVACIÓN DEL MOTOR ---
server.listen(PORT, HOST, () => {
  console.log("======================================================");
  console.log(`🚀 SERVIDOR POORCHAT ABIERTO Y ESCUCHANDO`);
  console.log(`   Dirección de Red: ${HOST}`);
  console.log(`   Puerto de Escucha TCP: ${PORT}`);
  console.log("======================================================");
  console.log("Esperando conexiones de los clientes de Electron...");
});
