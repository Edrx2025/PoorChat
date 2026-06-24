# Protocolo de Chad

## TCP

Cada mensaje es un objeto JSON terminado en `\n`.

```json
{
  "kind": "request",
  "requestId": "uuid",
  "type": "chat:send",
  "payload": {
    "contextType": "private",
    "contextId": 1,
    "content": "Hola"
  },
  "timestamp": "2026-06-17T12:00:00.000Z"
}
```

Respuesta:

```json
{
  "kind": "response",
  "requestId": "uuid",
  "ok": true,
  "data": {},
  "timestamp": "2026-06-17T12:00:00.100Z"
}
```

Evento:

```json
{
  "kind": "event",
  "event": "message:new",
  "data": {},
  "timestamp": "2026-06-17T12:00:00.100Z"
}
```

## Operaciones TCP

- `auth:register`
- `auth:login`
- `auth:logout`
- `app:bootstrap`
- `chat:open`
- `chat:get-messages`
- `chat:send`
- `chat:delete-message`
- `chat:pin-message`
- `chat:clear`
- `chat:remove`
- `group:create`
- `group:update`
- `file:upload-start`
- `file:upload-chunk`
- `file:upload-end`
- `file:list`
- `file:download`
- `call:start`
- `call:accept`
- `call:reject`
- `call:end`
- `settings:update`
- `user:update-profile`
- `user:update-avatar`
- `user:change-password`

## Eventos TCP

- `message:new`
- `message:updated`
- `group:created`
- `group:updated`
- `call:incoming`
- `call:updated`
- `settings:updated`
- `user:updated`
- `presence:changed`

## UDP

Registro de endpoint:

```json
{
  "kind": "register",
  "userId": 1
}
```

Chunk de media:

```json
{
  "kind": "media",
  "callId": 10,
  "senderId": 1,
  "mediaType": "audio",
  "encoding": "pcm_s16le",
  "sampleRate": 16000,
  "channels": 1,
  "frameId": "uuid",
  "sequence": 12,
  "chunkIndex": 0,
  "totalChunks": 4,
  "timestamp": 1781700000000,
  "payload": "base64"
}
```

Los chunks son de aproximadamente 700 bytes antes de Base64 para evitar
fragmentación IP excesiva.

## Participantes de llamadas grupales

Cada llamada incluye una colección `participants`. Cada elemento mantiene un
estado independiente:

- `invited`: recibió la invitación, pero todavía no participa.
- `joined`: aceptó o pulsó `Unirse`; puede enviar y recibir UDP.
- `rejected`: rechazó la invitación.
- `missed`: no respondió antes del tiempo límite.
- `left`: salió de la llamada.

El relay UDP envía medios únicamente a usuarios con estado `joined`.
