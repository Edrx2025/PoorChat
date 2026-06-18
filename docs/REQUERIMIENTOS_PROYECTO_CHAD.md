# Requerimientos del proyecto Chad

## 1. Propósito del documento

Este documento define el alcance completo del proyecto **Chad**, un prototipo
académico de comunicación tipo Zoom construido con arquitectura
cliente-servidor, sockets, concurrencia, base de datos y programación orientada
a objetos.

Los requerimientos fueron consolidados a partir de:

- La guía `Guia_alumno_programa_tipo_Zoom_sockets.docx`.
- La arquitectura actual del repositorio PoorChat/Chad.
- La decisión del equipo de usar TCP para control, mensajes y archivos.
- La decisión del equipo de usar UDP para llamadas de audio y videollamadas.
- El uso de Tailscale como red privada para las pruebas entre computadoras.

El objetivo no es reproducir Zoom a nivel comercial. El resultado esperado es
un prototipo funcional que demuestre comunicación de red, autenticación,
control de salas, persistencia, chat, archivos y transmisión multimedia básica.

## 2. Alcance general

El sistema debe permitir que varios usuarios:

1. Inicien sesión con credenciales válidas.
2. Creen una sala o soliciten ingresar a una sala existente.
3. Permanezcan en una sala de espera hasta recibir la aprobación del anfitrión.
4. Participen en el chat de la sala.
5. Compartan y descarguen archivos.
6. Consulten el historial de mensajes y archivos.
7. Realicen llamadas de audio y videollamadas básicas.
8. Salgan de la sala o se desconecten sin provocar la caída del servidor.

El sistema se divide en cuatro partes:

- **Cliente:** interfaz Electron y lógica de conexión.
- **Servidor:** aplicación Node.js que escucha conexiones y controla el sistema.
- **Base de datos:** almacenamiento de usuarios, salas, participantes, mensajes
  y metadatos de archivos.
- **Almacenamiento de archivos:** carpeta administrada por el servidor para
  conservar los archivos compartidos.

El cliente nunca debe conectarse directamente a la base de datos. Todas las
operaciones deben pasar por el servidor.

## 3. Prioridades del alcance

### 3.1 Obligatorio para el prototipo

- Servidor capaz de atender múltiples clientes.
- Login correcto e incorrecto.
- Base de datos relacional.
- Creación de salas.
- Solicitud de ingreso.
- Sala de espera.
- Aceptación y rechazo por parte del anfitrión.
- Chat grupal por sala.
- Persistencia de mensajes.
- Transferencia de archivos por bloques.
- Persistencia de metadatos de archivos.
- Descarga de archivos compartidos.
- Cámara básica o simulación mediante imágenes periódicas.
- Manejo de desconexiones.
- Documentación, UML y pruebas.

### 3.2 Extensión definida por el equipo

- Llamadas de audio por UDP.
- Videollamadas por UDP.
- Uso de Tailscale para pruebas remotas.

### 3.3 Opcional

- Registro público de usuarios desde la aplicación.
- Mensajes privados.
- Coanfitriones.
- Expulsar participantes.
- Silenciar micrófono.
- Pausar cámara.
- Compartir pantalla.
- Cifrado TLS.
- Notificaciones sonoras.
- Registro de asistencia.

Las funciones opcionales solo deben desarrollarse cuando todos los requisitos
obligatorios estén implementados y probados.

## 4. Actores

### 4.1 Usuario

Persona con una cuenta registrada. Puede iniciar sesión, crear salas, solicitar
acceso, participar en reuniones, chatear, compartir archivos y utilizar
audio/video.

### 4.2 Anfitrión

Usuario que crea una sala. Además de las funciones de usuario, puede:

- Ver solicitudes pendientes.
- Aceptar participantes.
- Rechazar participantes.
- Cerrar la sala.

### 4.3 Invitado

Usuario autenticado que solicita ingresar a una sala creada por otra persona.
No puede utilizar chat, archivos, audio ni video hasta ser aceptado.

### 4.4 Servidor

Componente que autentica usuarios, administra sesiones y salas, enruta
mensajes, controla permisos, persiste información y distribuye archivos y
multimedia.

## 5. Requerimientos funcionales

### RF-01. Autenticación

El sistema debe permitir iniciar sesión con correo o nombre de usuario y
contraseña.

El cliente debe validar que los campos no estén vacíos antes de enviar la
solicitud.

El servidor debe:

- Buscar al usuario en la base de datos.
- Verificar que la cuenta esté activa.
- Comparar la contraseña con su hash almacenado.
- Responder con éxito o error.
- Devolver, al autenticar correctamente, el identificador, nombre y rol del
  usuario.
- Mantener la aplicación abierta si las credenciales son incorrectas.
- Impedir que dos conexiones utilicen simultáneamente la misma sesión, salvo
  que el equipo documente una política diferente.

Las contraseñas no deben almacenarse en texto plano.

### RF-02. Administración de usuarios

Debe existir al menos una forma de crear usuarios:

- Script de datos iniciales.
- Herramienta administrativa.
- Registro desde el cliente.

El registro público desde la interfaz es opcional, pero la base de datos debe
incluir usuarios de prueba.

### RF-03. Creación de salas

Un usuario autenticado debe poder crear una sala.

Al crearla, el servidor debe:

- Generar un código único.
- Registrar nombre, anfitrión, estado y fecha de creación.
- Registrar al creador como participante aceptado.
- Devolver el código al cliente.

Una sala nueva debe iniciar con estado `Activa`.

### RF-04. Solicitud de ingreso

Un usuario autenticado debe poder escribir un código y solicitar ingreso a una
sala activa.

El servidor debe:

- Comprobar que el código exista.
- Comprobar que la sala esté activa.
- Evitar solicitudes duplicadas.
- Registrar la solicitud con estado `Pendiente`.
- Notificar al anfitrión.
- Informar al invitado que se encuentra esperando.

### RF-05. Sala de espera

Mientras la solicitud esté pendiente:

- El invitado debe permanecer en la pantalla de espera.
- El invitado debe poder cancelar su solicitud.
- El invitado no debe acceder al chat.
- El invitado no debe enviar ni descargar archivos.
- El invitado no debe transmitir audio ni video.

### RF-06. Admisión de participantes

El anfitrión debe ver la lista de solicitudes pendientes de su sala.

El anfitrión debe poder:

- Aceptar una solicitud.
- Rechazar una solicitud.

Al aceptar:

- La solicitud cambia a `Aceptada`.
- El usuario se registra como participante aceptado.
- Se registra la fecha de ingreso.
- El invitado recibe una notificación.
- La lista de participantes se actualiza para la sala.

Al rechazar:

- La solicitud cambia a `Rechazada`.
- El usuario recibe una notificación.
- El usuario no ingresa a la reunión.

Solo el anfitrión de la sala puede admitir o rechazar usuarios.

### RF-07. Lista y estado de participantes

Los usuarios aceptados deben poder ver una lista actualizada de participantes.

El servidor debe notificar:

- Ingreso de un participante.
- Salida voluntaria.
- Desconexión inesperada.
- Cierre de la sala.

### RF-08. Chat grupal

Un participante aceptado debe poder enviar mensajes de texto a su sala.

El servidor debe:

- Verificar que el usuario esté autenticado.
- Verificar que pertenezca a la sala.
- Verificar que su estado sea `Aceptado`.
- Rechazar mensajes vacíos.
- Registrar el mensaje en la base de datos.
- Reenviarlo a todos los participantes aceptados de la misma sala.

Un mensaje debe incluir como mínimo:

- Identificador de sala.
- Identificador del usuario.
- Nombre visible.
- Contenido.
- Fecha y hora del servidor.

La primera versión solo requiere chat grupal por sala. Los mensajes privados son
opcionales.

### RF-09. Historial de mensajes

Un participante aceptado debe poder consultar mensajes anteriores de la sala.

El servidor debe recuperar el historial desde la base de datos. El cliente no
debe consultar directamente la base de datos.

El equipo puede limitar la consulta a los mensajes más recientes para evitar
cargar todo el historial de una sola vez.

### RF-10. Envío de archivos

Un participante aceptado debe poder seleccionar y compartir un archivo pequeño.

El sistema debe soportar, como mínimo:

- Documentos.
- Imágenes.
- Audio.
- Video pequeño.

Antes de transferir bytes, el cliente debe enviar:

- Nombre.
- Extensión o tipo MIME.
- Tamaño.
- Sala destino.
- Identificador único de transferencia.

El archivo debe dividirse en bloques. No debe enviarse completo en una sola
operación.

El servidor debe:

- Validar que el usuario pertenezca a la sala.
- Validar tipo y tamaño permitido.
- Reconstruir el archivo.
- Guardarlo en una carpeta controlada por el servidor.
- Guardar sus metadatos y ruta en la base de datos.
- Notificar a los participantes cuando esté disponible.

El límite inicial recomendado es 20 MB y debe poder configurarse.

### RF-11. Descarga e historial de archivos

Los participantes aceptados deben poder consultar la lista de archivos
compartidos en la sala.

El sistema debe mostrar:

- Nombre.
- Tipo.
- Tamaño.
- Usuario que lo compartió.
- Fecha de envío.

El servidor debe verificar que el archivo exista antes de iniciar una descarga.

### RF-12. Inicio y control de llamadas

Un participante aceptado debe poder solicitar una llamada de audio o
videollamada.

La señalización debe viajar por TCP:

- Solicitud de llamada.
- Notificación de llamada entrante.
- Aceptación.
- Rechazo.
- Fin de llamada.
- Intercambio de dirección y puertos UDP.

La sesión multimedia no debe comenzar hasta que el receptor acepte.

### RF-13. Audio por UDP

Durante una llamada aceptada, los clientes deben poder enviar y recibir audio
por UDP.

Cada paquete debe incluir información suficiente para identificar:

- Llamada.
- Emisor.
- Número de secuencia.
- Marca de tiempo.
- Tipo de contenido.

La pérdida ocasional de paquetes no debe detener la sesión.

### RF-14. Video o cámara

Los clientes deben poder capturar y mostrar cámara de forma básica.

Para mantener el alcance académico:

- Resolución recomendada: `320x240`.
- Frecuencia recomendada: entre 3 y 10 frames por segundo.
- Cada frame debe comprimirse, preferentemente como JPG o WebP.
- Los frames grandes deben dividirse en paquetes.

La implementación objetivo del equipo debe distribuir video por UDP.

Si la transmisión UDP completa no se termina, la guía permite como alternativa
académica:

- Enviar imágenes fijas.
- Enviar capturas periódicas.
- Enviar frames comprimidos por TCP.

La alternativa debe estar documentada como limitación.

### RF-15. Salida y desconexión

Un usuario debe poder salir de la sala sin cerrar necesariamente la aplicación.

El servidor debe detectar:

- Salida voluntaria.
- Cierre del socket.
- Error de red.

Debe actualizar el estado del participante y notificar a la sala sin detener el
servidor.

### RF-16. Cierre de sala

El anfitrión debe poder cerrar su sala.

Al cerrarla:

- La sala cambia a estado `Finalizada`.
- Se rechazan nuevos ingresos.
- Los participantes son notificados.
- Se detienen las transmisiones asociadas.
- Se conserva el historial.

## 6. Reglas de negocio

- RN-01: solo usuarios autenticados pueden crear o solicitar ingreso a salas.
- RN-02: el creador de la sala se convierte en anfitrión.
- RN-03: el código de sala debe ser único.
- RN-04: solo se puede solicitar ingreso a una sala activa.
- RN-05: solo el anfitrión puede admitir o rechazar solicitudes.
- RN-06: un usuario pendiente no puede usar funciones de reunión.
- RN-07: solo participantes aceptados reciben chat, archivos y multimedia.
- RN-08: el servidor debe obtener la identidad desde la sesión autenticada y no
  confiar ciegamente en un `userId` enviado por el cliente.
- RN-09: los mensajes de chat deben guardarse antes o al mismo tiempo que se
  distribuyen.
- RN-10: la base de datos almacena metadatos de archivos; los bytes se guardan
  en el sistema de archivos.
- RN-11: las contraseñas solo se almacenan mediante hash.
- RN-12: una sala finalizada no acepta nuevas acciones de reunión.
- RN-13: los puertos, límites de archivo y rutas deben ser configurables.

## 7. Arquitectura requerida

```text
Clientes Electron 1..N
        |
        | TCP: autenticación, salas, espera, chat,
        |      archivos, historial y señalización
        v
Servidor Node.js
        |
        +---- Base de datos relacional
        |
        +---- Carpeta de archivos compartidos

Clientes aceptados
        |
        +---- UDP: audio y video en tiempo real
```

### 7.1 Cliente

Responsabilidades:

- Mostrar las pantallas.
- Validar entradas básicas.
- Mantener una conexión TCP con el servidor.
- Interpretar mensajes del protocolo.
- Seleccionar y reconstruir archivos.
- Capturar y reproducir multimedia.
- No contener credenciales de base de datos.

### 7.2 Servidor

Responsabilidades:

- Escuchar conexiones TCP.
- Atender varios clientes mediante el modelo asíncrono/eventos de Node.js.
- Autenticar usuarios.
- Mantener sesiones activas.
- Administrar salas y solicitudes.
- Validar permisos.
- Enrutar mensajes.
- Persistir información.
- Almacenar archivos.
- Coordinar llamadas.
- Manejar errores y desconexiones.

El requisito de concurrencia de la guía puede cumplirse en Node.js mediante su
modelo de eventos y operaciones asíncronas. No es obligatorio crear un hilo por
cliente. Los `Worker Threads` solo serían necesarios para tareas pesadas que
bloqueen el proceso principal.

### 7.3 Base de datos

Para este repositorio se recomienda SQLite por su facilidad de instalación y
uso con Node.js. También son válidos MySQL, PostgreSQL o SQL Server si el equipo
los configura y documenta.

Debe entregarse un script de creación y datos de prueba.

### 7.4 Almacenamiento de archivos

Los archivos deben guardarse fuera de la carpeta pública de la interfaz.

El nombre físico debe evitar colisiones, por ejemplo usando:

```text
<transferId>_<nombre-sanitizado>
```

La ruta debe almacenarse en la base de datos.

## 8. Modelo de datos mínimo

### 8.1 Usuarios

- `IdUsuario`: clave primaria.
- `Nombres`: nombre visible.
- `Correo`: único.
- `Username`: único, si el sistema permite login por usuario.
- `PasswordHash`: hash de contraseña.
- `Rol`: rol global si se necesita.
- `Activo`: indica si puede iniciar sesión.
- `FechaCreacion`.

### 8.2 Salas

- `IdSala`: clave primaria.
- `CodigoSala`: único.
- `Nombre`.
- `IdHost`: clave foránea a Usuarios.
- `Estado`: `Activa` o `Finalizada`.
- `FechaCreacion`.
- `FechaFinalizacion`: opcional.

### 8.3 SolicitudesSala

- `IdSolicitud`: clave primaria.
- `IdSala`: clave foránea.
- `IdUsuario`: clave foránea.
- `Estado`: `Pendiente`, `Aceptada`, `Rechazada` o `Cancelada`.
- `FechaSolicitud`.
- `FechaRespuesta`.

### 8.4 ParticipantesSala

- `IdParticipante`: clave primaria.
- `IdSala`: clave foránea.
- `IdUsuario`: clave foránea.
- `Estado`: `Aceptado`, `Conectado`, `Desconectado` o `Salio`.
- `FechaIngreso`.
- `FechaSalida`.

### 8.5 Mensajes

- `IdMensaje`: clave primaria.
- `IdSala`: clave foránea.
- `IdUsuario`: clave foránea.
- `Contenido`.
- `FechaEnvio`.

### 8.6 ArchivosCompartidos

- `IdArchivo`: clave primaria.
- `TransferId`: identificador único.
- `IdSala`: clave foránea.
- `IdUsuario`: clave foránea.
- `NombreOriginal`.
- `NombreGuardado`.
- `TipoMime`.
- `TamanoBytes`.
- `RutaArchivo`.
- `FechaEnvio`.

### 8.7 Sesiones de llamada

Esta entidad puede guardarse en memoria o persistirse si el equipo necesita
historial:

- `CallId`.
- `IdSala` o participantes de la llamada.
- `Tipo`: audio o video.
- `Estado`.
- `FechaInicio`.
- `FechaFin`.

## 9. Protocolo de comunicación

### 9.1 Formato general de control

Los mensajes de control TCP deben serializarse como JSON.

Formato recomendado:

```json
{
  "type": "CHAT_MESSAGE",
  "requestId": "uuid-o-identificador",
  "timestamp": "2026-06-17T10:30:00.000Z",
  "payload": {
    "roomCode": "AULA123",
    "text": "Buenos días"
  }
}
```

El servidor debe completar la identidad del usuario usando la sesión
autenticada.

Para separar mensajes sobre TCP se debe documentar un framing. Para los
mensajes JSON de control se recomienda JSON Lines:

```text
JSON.stringify(mensaje) + "\n"
```

El receptor debe mantener un buffer porque TCP puede entregar:

- Un mensaje dividido en varios eventos.
- Varios mensajes juntos en un solo evento.

### 9.2 Tipos mínimos de mensaje

#### Autenticación

- `LOGIN_REQUEST`
- `LOGIN_RESPONSE`
- `LOGOUT`

#### Salas

- `CREATE_ROOM`
- `CREATE_ROOM_RESPONSE`
- `JOIN_ROOM_REQUEST`
- `JOIN_ROOM_RESPONSE`
- `WAITING_ROOM_UPDATE`
- `ADMIT_USER`
- `ADMIT_USER_RESPONSE`
- `PARTICIPANT_LIST`
- `LEAVE_ROOM`
- `CLOSE_ROOM`

#### Chat e historial

- `CHAT_MESSAGE`
- `CHAT_HISTORY_REQUEST`
- `CHAT_HISTORY_RESPONSE`

#### Archivos

- `FILE_START`
- `FILE_CHUNK`
- `FILE_END`
- `FILE_AVAILABLE`
- `FILE_LIST_REQUEST`
- `FILE_LIST_RESPONSE`
- `FILE_DOWNLOAD_REQUEST`

#### Llamadas

- `CALL_REQUEST`
- `CALL_ACCEPT`
- `CALL_REJECT`
- `CALL_END`
- `MEDIA_ENDPOINT`

#### Estado y errores

- `SUCCESS`
- `ERROR`
- `USER_LIST` o `PARTICIPANT_LIST`

### 9.3 Transferencia de archivos

La transferencia debe ocurrir en este orden:

1. `FILE_START` envía metadatos.
2. Uno o varios `FILE_CHUNK` envían bloques.
3. `FILE_END` confirma que ya no quedan bloques.
4. El servidor valida tamaño e integridad.
5. El servidor guarda el archivo y metadatos.
6. `FILE_AVAILABLE` notifica a la sala.

Para el primer prototipo, los chunks pueden viajar codificados como Base64
dentro de JSON. Esto simplifica el aprendizaje, pero aumenta el tamaño. Una
versión posterior puede utilizar cabecera JSON seguida de bytes binarios.

La estrategia elegida debe ser la misma en cliente y servidor.

### 9.4 Paquetes UDP de multimedia

Cada datagrama debe incluir, como mínimo:

- `callId`.
- `senderId`.
- `mediaType`: `audio` o `video`.
- `sequence`.
- `timestamp`.
- `chunkIndex`.
- `totalChunks`.
- Payload binario.

Los datagramas deben mantenerse pequeños; se recomienda un tamaño cercano o
inferior a 1200 bytes para reducir fragmentación.

## 10. Estados principales

### 10.1 Estado de sesión

```text
DESCONECTADO -> CONECTANDO -> AUTENTICADO -> DESCONECTADO
```

### 10.2 Estado de solicitud

```text
PENDIENTE -> ACEPTADA
PENDIENTE -> RECHAZADA
PENDIENTE -> CANCELADA
```

### 10.3 Estado de sala

```text
ACTIVA -> FINALIZADA
```

### 10.4 Estado de llamada

```text
SOLICITADA -> ACEPTADA -> EN_CURSO -> FINALIZADA
SOLICITADA -> RECHAZADA
SOLICITADA -> CANCELADA
```

## 11. Pantallas mínimas

### 11.1 Login

- Correo o usuario.
- Contraseña.
- IP del servidor.
- Puerto TCP.
- Botón de ingreso.
- Mensaje de conexión o error.

### 11.2 Inicio

- Datos del usuario autenticado.
- Crear sala.
- Ingresar código de sala.
- Cerrar sesión.

### 11.3 Sala de espera

- Nombre o código de sala.
- Estado de la solicitud.
- Botón para cancelar.

No debe mostrar controles activos de reunión.

### 11.4 Panel del anfitrión

- Lista de pendientes.
- Botón aceptar.
- Botón rechazar.
- Lista de participantes.
- Botón cerrar sala.

### 11.5 Reunión

- Nombre y código de sala.
- Lista de participantes.
- Historial de chat.
- Entrada de mensaje.
- Botón para compartir archivo.
- Lista de archivos.
- Controles de audio y cámara.
- Panel de video.
- Botón salir.

## 12. Requerimientos no funcionales

### RNF-01. Concurrencia

El servidor debe atender como mínimo dos clientes simultáneos sin bloquearse.

### RNF-02. Confiabilidad TCP

Login, salas, chat, archivos e historial deben usar TCP para conservar orden y
entrega.

### RNF-03. Baja latencia multimedia

Audio y video deben usar UDP en la implementación objetivo para evitar que la
pérdida de un paquete detenga la transmisión.

### RNF-04. Seguridad básica

- Contraseñas con hash seguro, por ejemplo bcrypt o Argon2.
- Consultas parametrizadas.
- Validación de entradas.
- Sanitización de nombres de archivos.
- El cliente no debe recibir rutas internas del servidor.
- No confiar en identificadores de usuario enviados por el cliente.

TLS es una mejora opcional, pero la ausencia de cifrado debe documentarse como
limitación.

### RNF-05. Persistencia

Los usuarios, salas, solicitudes, participantes, mensajes y archivos deben
permanecer disponibles después de reiniciar el servidor.

Las sesiones TCP activas y buffers multimedia pueden mantenerse solo en memoria.

### RNF-06. Configuración

No deben estar dispersos valores fijos por el código. Deben poder configurarse:

- Host.
- Puerto TCP.
- Puertos UDP.
- Ruta de base de datos.
- Ruta de archivos.
- Tamaño máximo.
- Resolución y FPS.

### RNF-07. Manejo de errores

Un error provocado por un cliente no debe cerrar el servidor.

El sistema debe manejar:

- JSON inválido.
- Tipo de mensaje desconocido.
- Credenciales incorrectas.
- Código de sala inexistente.
- Acción sin permisos.
- Archivo demasiado grande.
- Desconexión inesperada.
- Paquete multimedia incompleto.

### RNF-08. Usabilidad

El cliente debe mostrar estados comprensibles: conectando, autenticado,
esperando, aceptado, rechazado, enviando archivo y error.

### RNF-09. Registro

El servidor debe registrar:

- Inicio y cierre.
- Conexiones.
- Logins exitosos y fallidos sin imprimir contraseñas.
- Creación y cierre de salas.
- Errores de protocolo.
- Desconexiones.
- Transferencias de archivos.

### RNF-10. Compatibilidad de red

El servidor debe poder escuchar en `0.0.0.0`. El cliente debe aceptar una IP
configurable para permitir pruebas locales, en LAN o mediante Tailscale.

### RNF-11. Mantenibilidad

El código debe separar responsabilidades en módulos o clases:

- Protocolo.
- Cliente TCP.
- Servidor.
- Sesiones.
- Autenticación.
- Salas.
- Chat.
- Archivos.
- Multimedia.
- Persistencia.
- Interfaz.

### RNF-12. Alcance multimedia

No se exige calidad comercial, WebRTC, adaptación automática de bitrate ni
alta definición. Se prioriza que la comunicación básica funcione de extremo a
extremo.

## 13. Casos de prueba de aceptación

| ID | Caso | Resultado esperado |
|---|---|---|
| CP-01 | Login con usuario válido | Acceso concedido y sesión creada |
| CP-02 | Login con contraseña incorrecta | Error visible y acceso denegado |
| CP-03 | Dos clientes simultáneos | Ambos permanecen conectados |
| CP-04 | Host crea sala | Código único y registro en BD |
| CP-05 | Invitado solicita ingreso | Solicitud pendiente y host notificado |
| CP-06 | Host acepta invitado | Invitado entra y aparece como participante |
| CP-07 | Host rechaza invitado | Invitado recibe rechazo y no entra |
| CP-08 | Usuario pendiente intenta chatear | Servidor rechaza la acción |
| CP-09 | Participante envía mensaje | La sala lo recibe y queda en BD |
| CP-10 | Consultar historial | Se recuperan mensajes guardados |
| CP-11 | Enviar archivo pequeño | Se guarda y se notifica a la sala |
| CP-12 | Descargar archivo | Otro participante recupera el archivo correcto |
| CP-13 | Enviar archivo demasiado grande | Servidor rechaza la transferencia |
| CP-14 | Activar cámara | Otros participantes ven frames o simulación |
| CP-15 | Iniciar llamada | Receptor puede aceptar o rechazar |
| CP-16 | Audio/video UDP | Paquetes llegan sin bloquear el canal TCP |
| CP-17 | Desconectar un cliente | Servidor actualiza participantes y continúa |
| CP-18 | Host cierra sala | Sala finalizada y participantes notificados |
| CP-19 | Reiniciar servidor | Historial persistente sigue disponible |
| CP-20 | Enviar JSON inválido | Cliente recibe error y servidor sigue activo |

## 14. Secuencia de desarrollo recomendada

### Fase 1. Análisis y contratos

1. Confirmar tecnologías.
2. Definir estructura de carpetas.
3. Crear diagramas de arquitectura y clases.
4. Definir protocolo JSON.
5. Definir estados y permisos.

### Fase 2. Base de datos

1. Crear modelo relacional.
2. Crear script SQL.
3. Insertar usuarios de prueba con contraseña hasheada.
4. Crear repositorios o capa de acceso.

### Fase 3. Servidor y login

1. Crear servidor TCP.
2. Aceptar múltiples clientes.
3. Implementar framing JSON.
4. Implementar autenticación.
5. Manejar errores y desconexiones.

### Fase 4. Salas

1. Crear sala.
2. Solicitar ingreso.
3. Implementar sala de espera.
4. Aceptar o rechazar.
5. Mantener participantes.
6. Cerrar sala.

### Fase 5. Chat

1. Enviar mensajes.
2. Validar pertenencia.
3. Persistir mensajes.
4. Distribuir por sala.
5. Consultar historial.

### Fase 6. Archivos

1. Enviar metadatos.
2. Dividir en bloques.
3. Reconstruir en servidor.
4. Guardar archivo y metadatos.
5. Listar y descargar.

### Fase 7. Señalización de llamadas

1. Solicitar llamada por TCP.
2. Aceptar o rechazar.
3. Intercambiar endpoints UDP.
4. Finalizar sesión.

### Fase 8. Audio y video

1. Probar datagramas UDP simples.
2. Implementar audio.
3. Implementar frames comprimidos.
4. Fragmentar y reconstruir frames.
5. Ajustar FPS y resolución.

### Fase 9. Integración y pruebas

1. Probar en una computadora.
2. Probar con dos o más clientes.
3. Probar desconexiones.
4. Probar por Tailscale.
5. Registrar capturas y resultados.

### Fase 10. Documentación

1. Actualizar UML.
2. Crear manual de instalación.
3. Crear manual de ejecución.
4. Documentar limitaciones.
5. Preparar demostración completa.

## 15. Diagramas requeridos

- Diagrama de arquitectura o componentes.
- Diagrama de clases.
- Diagrama entidad-relación.
- Diagrama de secuencia de login.
- Diagrama de secuencia de creación e ingreso a sala.
- Diagrama de secuencia de sala de espera.
- Diagrama de secuencia de chat.
- Diagrama de secuencia de archivo.
- Diagrama de secuencia de llamada y videollamada.
- Diagrama de estados de solicitud o sala.

## 16. Entregables

- Código fuente del cliente.
- Código fuente del servidor.
- Script de base de datos.
- Datos de prueba.
- Diagrama de arquitectura.
- Diagramas UML.
- Modelo entidad-relación.
- Documento del protocolo.
- Manual de instalación.
- Manual de ejecución.
- Casos de prueba con resultados.
- Capturas o video con mínimo dos usuarios.
- Informe de errores y limitaciones.
- Repositorio organizado.

## 17. Formato mínimo del informe final

1. Portada.
2. Introducción.
3. Requerimientos.
4. Arquitectura.
5. Base de datos.
6. Protocolo de sockets.
7. Implementación por módulos.
8. Pruebas.
9. Conclusiones.
10. Anexos.

## 18. Fuera de alcance

No se exige:

- Escalabilidad para cientos o miles de usuarios.
- Calidad de video comercial.
- Alta disponibilidad.
- Infraestructura en la nube.
- WebRTC.
- Grabación profesional.
- Compartir pantalla.
- Cifrado de extremo a extremo.
- Recuperación avanzada ante pérdida de paquetes.
- Aplicaciones móviles.

## 19. Definición de proyecto terminado

El proyecto se considera funcional cuando puede demostrarse este recorrido:

1. Se inicia el servidor.
2. Dos usuarios inician sesión con cuentas de base de datos.
3. Un usuario crea una sala.
4. El segundo solicita ingresar.
5. El anfitrión acepta al invitado.
6. Ambos ven la lista de participantes.
7. Ambos intercambian mensajes persistidos.
8. Uno comparte un archivo y el otro lo descarga.
9. Se transmite cámara real o una simulación aceptada.
10. Se demuestra la señalización de llamada y, como objetivo del equipo, audio
    o video por UDP.
11. Un cliente se desconecta y el servidor continúa activo.
12. El anfitrión cierra la sala.
13. El historial sigue disponible desde la base de datos.
14. Se presentan diagramas, manuales, pruebas y limitaciones.

La prioridad es completar este flujo de extremo a extremo antes de desarrollar
funciones opcionales.

## 20. Criterios de evaluación de referencia

La guía propone la siguiente distribución de 20 puntos:

| Criterio | Puntaje | Evidencia esperada |
|---|---:|---|
| Análisis y diseño | 3 | Arquitectura, modelo de datos, protocolo y alcance coherente |
| Base de datos | 3 | Tablas, relaciones, datos de prueba y consultas del servidor |
| Sockets y servidor | 4 | Múltiples conexiones, errores y distribución por sala |
| Login y sala de espera | 3 | Autenticación, salas, solicitudes y aprobación del host |
| Chat y archivos | 3 | Tiempo real, persistencia y transferencia por bloques |
| Cámara | 2 | Captura o simulación visible en otros clientes |
| Pruebas y documentación | 2 | Manuales, evidencias y limitaciones |

La mayor prioridad técnica está en sockets y servidor. La mayor prioridad
funcional está en completar el recorrido login, sala, espera, chat, archivo y
cámara.

## 21. Registro de avance

El equipo debe mantener un registro breve durante el desarrollo:

| Fecha | Actividad realizada | Problema encontrado | Solución aplicada | Responsable |
|---|---|---|---|---|
| | | | | |

Este registro debe actualizarse por fase y puede incluir enlaces a commits,
capturas o casos de prueba relacionados.
