# Arquitectura y patrones de Chad

## Componentes

```mermaid
flowchart LR
  UI[Renderer Electron] -->|IPC| MAIN[Proceso principal]
  MAIN -->|TCP JSON Lines| SERVER[ChatServer]
  MAIN -->|UDP media| UDP[UdpRelayServer]
  SERVER --> SERVICES[Service Layer]
  SERVICES --> REPOS[Repositories]
  REPOS --> DB[(SQLite)]
  SERVICES --> FILES[Storage de archivos]
  SERVER --> BUS[EventBus]
  BUS --> SERVER
  UDP --> MAIN
```

## Capas

### Presentación

`src/renderer`

Renderiza autenticación, chats, grupos, llamadas y ajustes. No tiene acceso a
Node, sockets o SQLite.

### Puente Electron

`src/main`

Expone una API limitada mediante `contextBridge`. Gestiona diálogos de archivos,
TCP y UDP.

### Red

`src/backend/network` y `src/backend/server`

Implementa el framing JSON Lines, solicitudes/respuestas, eventos, sesiones TCP
y retransmisión UDP.

### Negocio

`src/backend/services`

Contiene autenticación, reglas de conversaciones, permisos de grupos,
transferencias, llamadas y ajustes.

### Datos

`src/backend/repositories` y `src/backend/database`

Los repositorios son la única capa que ejecuta SQL.

## Diagrama de clases resumido

```mermaid
classDiagram
  class ChatServer
  class ClientConnection
  class AuthService
  class ChatService
  class GroupService
  class FileService
  class CallService
  class UserRepository
  class ChatRepository
  class GroupRepository
  class FileRepository
  class CallRepository
  class DatabaseConnection
  class EventBus
  class MessageFactory
  class CallFactory

  ChatServer --> ClientConnection
  ChatServer --> AuthService
  ChatServer --> ChatService
  ChatServer --> GroupService
  ChatServer --> FileService
  ChatServer --> CallService
  AuthService --> UserRepository
  ChatService --> ChatRepository
  GroupService --> GroupRepository
  FileService --> FileRepository
  CallService --> CallRepository
  UserRepository --> DatabaseConnection
  ChatRepository --> DatabaseConnection
  GroupRepository --> DatabaseConnection
  ChatService --> MessageFactory
  CallService --> CallFactory
  ChatServer --> EventBus
```

## Patrones

### Singleton

Una única instancia de:

- `DatabaseConnection`
- `AppConfig`
- `EventBus`

### Factory Method

`MessageFactory.create` selecciona `Message` o `FileMessage`.

`CallFactory.create` selecciona `AudioCall` o `VideoCall`.

### Observer

Los servicios publican eventos en `EventBus`. `ChatServer` observa esos eventos
y notifica las sesiones conectadas. El renderer observa los eventos del proceso
principal.

### Repository

Cada repositorio encapsula SQL de una entidad o agregado. Los servicios no
conocen detalles de tablas.

### Service Layer

Los servicios contienen casos de uso y permisos. Por ejemplo, `ChatService`
verifica pertenencia antes de crear un mensaje.

## Secuencia de mensaje

```mermaid
sequenceDiagram
  participant UI as Renderer
  participant Main as Electron Main
  participant TCP as TcpClient
  participant Server as ChatServer
  participant Service as ChatService
  participant Repo as ChatRepository
  participant DB as SQLite

  UI->>Main: chat:send
  Main->>TCP: request
  TCP->>Server: JSON Lines por TCP
  Server->>Service: sendText
  Service->>Repo: createMessage
  Repo->>DB: INSERT
  Service-->>Server: message:new
  Server-->>TCP: evento para destinatarios
  TCP-->>Main: server:event
  Main-->>UI: IPC
```

## Secuencia de llamada

```mermaid
sequenceDiagram
  participant A as Cliente A
  participant S as Servidor TCP
  participant B as Cliente B
  participant U as Relay UDP

  A->>S: call:start
  S-->>B: call:incoming
  B->>S: call:accept
  S-->>A: call:updated
  S-->>B: call:updated
  A->>U: audio/video UDP
  U-->>B: audio/video UDP
  B->>U: audio/video UDP
  U-->>A: audio/video UDP
  A->>S: call:end
  S-->>B: call:updated
```
