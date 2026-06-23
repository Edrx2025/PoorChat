# Chad

Chad es una aplicación de escritorio de comunicación inspirada en Discord y
WhatsApp. El proyecto demuestra sockets TCP/UDP, Electron, Node.js, SQLite,
programación orientada a objetos y patrones de diseño.

## Funcionalidades

- Registro e inicio de sesión con username único.
- Contraseñas protegidas con `crypto.scrypt`.
- Chats privados persistentes.
- Creación y actualización de grupos.
- Mensajes de texto en tiempo real mediante TCP.
- Respuestas, mensajes fijados y borrado lógico sincronizados.
- Notas de voz grabadas desde el compositor.
- Archivos por chunks mediante TCP.
- Imágenes, documentos, audio y video.
- Historial de mensajes y archivos en SQLite.
- Llamadas de audio y video con señalización TCP.
- Audio PCM de baja latencia y frames de video retransmitidos mediante UDP.
- Notificación flotante de llamada entrante.
- Indicador persistente de llamada con vista completa opcional.
- Historial de llamadas.
- Foto de perfil.
- Cambio de username, nombre, contraseña y estado.
- Modo claro y oscuro.
- Preferencias de sonidos, notificaciones y color de acento.
- Interfaz Electron moderna con animaciones CSS.

## Tecnologías

- Node.js 24
- Electron 42
- JavaScript
- HTML y CSS
- SQLite mediante `node:sqlite`
- TCP mediante `node:net`
- UDP mediante `node:dgram`
- Lucide para iconografía

## Instalación

```bash
npm install
```

No es necesario instalar SQLite por separado. El proyecto usa la implementación
incluida en Node.js.

## Ejecución

### Opción recomendada para exposición

Levanta servidor y cliente Electron juntos:

```bash
npm run demo
```

### Ejecución separada

Terminal 1:

```bash
npm run server
```

Terminal 2:

```bash
npm start
```

Para probar con varios usuarios, abre más instancias de Electron:

```bash
npm start
```

El servidor escucha de forma predeterminada en:

```text
TCP 0.0.0.0:5050
UDP 0.0.0.0:5051
```

En la misma computadora usa `127.0.0.1`. Para pruebas con Tailscale, usa en el
login la IP Tailscale de la computadora que ejecuta `npm run server`.

## Variables de configuración

| Variable | Valor por defecto |
|---|---|
| `CHAD_TCP_HOST` | `0.0.0.0` |
| `CHAD_TCP_PORT` | `5050` |
| `CHAD_UDP_HOST` | `0.0.0.0` |
| `CHAD_UDP_PORT` | `5051` |
| `CHAD_DATABASE_PATH` | `database/chad.sqlite` |
| `CHAD_STORAGE_PATH` | `storage/uploads` |
| `CHAD_MAX_FILE_SIZE` | 20 MB |

## Datos de prueba

La base se crea automáticamente en el primer inicio.

| Username | Contraseña |
|---|---|
| `user1` | `123456` |
| `user2` | `123456` |
| `user3` | `123456` |
| `user4` | `123456` |
| `admin` | `123456` |

Datos incluidos:

- Chat privado entre `user1` y `user2`.
- Chat privado entre `user1` y `user3`.
- Grupo `Grupo de Estudio`.
- Grupo `Proyecto Final`.
- Mensajes iniciales.
- Documento de ejemplo.
- Historial de llamada de audio.
- Historial de videollamada rechazada.

## Pruebas y verificación

```bash
npm run check
npm test
```

Las pruebas cubren:

- Registro.
- Login correcto e incorrecto.
- Username único.
- Cambio de contraseña.
- Cambio de username y nombre.
- Foto de perfil.
- Chat privado.
- Mensajes persistentes.
- Creación de grupos.
- Archivos por chunks.
- Descarga de archivos.
- Llamadas aceptadas y rechazadas.
- Tema claro.
- Comunicación TCP real entre dos clientes.

## Arquitectura

```text
Renderer Electron
        |
        | IPC seguro
        v
Proceso principal Electron
        |
        | TCP: auth, chats, grupos, archivos y llamadas
        v
Servidor Node.js ---------------- SQLite
        |
        +------------------------- almacenamiento de archivos

Clientes en llamada
        |
        +---- UDP ----> Relay UDP ----> otros participantes
```

La interfaz nunca consulta SQLite directamente. Todas las operaciones pasan por
el servidor.

## Patrones de diseño utilizados

### Singleton

- `AppConfig`
- `DatabaseConnection`
- `EventBus`

Garantizan una única configuración, conexión SQL y canal de eventos compartido.

### Factory Method

- `MessageFactory`
- `CallFactory`

Crean mensajes de texto/archivo y llamadas de audio/video sin duplicar la lógica
de construcción.

### Observer

- `EventBus`
- `NotificationService`
- Suscripciones del servidor y renderer

Cuando llega un mensaje, cambia una llamada o se actualiza un usuario, el evento
se publica y las partes interesadas reaccionan.

### Repository

- `UserRepository`
- `ChatRepository`
- `GroupRepository`
- `FileRepository`
- `CallRepository`
- `SettingsRepository`

Separan las consultas SQL de las reglas del sistema.

### Service Layer

- `AuthService`
- `ChatService`
- `GroupService`
- `FileService`
- `CallService`
- `SettingsService`
- `NotificationService`

Concentran validaciones y reglas de negocio. La interfaz y los sockets no
contienen consultas SQL.

## Programación orientada a objetos

Las entidades principales están representadas mediante clases:

- `User`
- `Chat` y `PrivateChat`
- `Message` y `FileMessage`
- `Group`
- `Call`, `AudioCall` y `VideoCall`
- `Settings`
- `ChatServer`
- `ClientConnection`
- `TcpClient`
- `UdpMediaClient`

La herencia se observa en los diferentes tipos de mensaje, chat y llamada.

## Base de datos

El esquema está en:

[001_initial.sql](src/backend/database/migrations/001_initial.sql)

Tablas:

- `users`
- `private_chats`
- `messages`
- `groups`
- `group_members`
- `files`
- `calls`
- `settings`

La base generada se guarda en `database/chad.sqlite` y no se sube al repositorio.

## Archivos

Los archivos se envían por TCP en este orden:

1. `file:upload-start`
2. varios `file:upload-chunk`
3. `file:upload-end`

El servidor reconstruye el archivo, lo guarda en `storage/uploads` y registra
sus metadatos en SQLite.

Las notas de voz se graban con `MediaRecorder` en Electron y reutilizan este
mismo flujo TCP, por lo que quedan disponibles en el historial como mensajes de
audio.

## Llamadas y videollamadas

La solicitud, aceptación, rechazo y finalización viajan por TCP. Al aceptar:

- El micrófono se procesa con Web Audio y se convierte a PCM mono de 16 kHz.
- La cámara se reduce a `320x240`.
- El video se comprime como JPEG.
- Audio y video se fragmentan en datagramas UDP.
- El servidor UDP retransmite los paquetes a los participantes.
- La llamada permanece en un indicador no bloqueante hasta que el usuario abre
  voluntariamente la vista completa.

La calidad está limitada intencionalmente para mantener un alcance académico.

## Limitaciones conocidas

- El canal UDP académico identifica usuarios por ID, sin token criptográfico.
- No hay cifrado TLS ni cifrado de extremo a extremo.
- La videollamada prioriza simplicidad sobre calidad.
- Los archivos están limitados a 20 MB por defecto.
- Solo se permite una sesión activa por usuario.
- Las llamadas de grupo comienzan cuando un miembro acepta.

## Documentación adicional

- [Requerimientos completos](docs/REQUERIMIENTOS_PROYECTO_CHAD.md)
- [Arquitectura y patrones](docs/ARQUITECTURA_Y_PATRONES.md)
- [Protocolo TCP/UDP](docs/PROTOCOLO.md)

## Activo visual

El emblema de Chad fue generado como activo raster propio para el proyecto y se
encuentra en `src/renderer/assets/chad-mark.png`.
