const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DatabaseConnection = require("../src/backend/database/DatabaseConnection");
const EventBus = require("../src/backend/observers/EventBus");
const UserRepository = require("../src/backend/repositories/UserRepository");
const ChatRepository = require("../src/backend/repositories/ChatRepository");
const GroupRepository = require("../src/backend/repositories/GroupRepository");
const FileRepository = require("../src/backend/repositories/FileRepository");
const CallRepository = require("../src/backend/repositories/CallRepository");
const SettingsRepository = require("../src/backend/repositories/SettingsRepository");
const NotificationService = require("../src/backend/services/NotificationService");
const AuthService = require("../src/backend/services/AuthService");
const ChatService = require("../src/backend/services/ChatService");
const GroupService = require("../src/backend/services/GroupService");
const FileService = require("../src/backend/services/FileService");
const CallService = require("../src/backend/services/CallService");
const SettingsService = require("../src/backend/services/SettingsService");
const seedDatabase = require("../src/backend/database/seed");
const ChatServer = require("../src/backend/server/ChatServer");
const TcpClient = require("../src/backend/network/TcpClient");
const UdpMediaClient = require("../src/backend/network/UdpMediaClient");
const MessageTypes = require("../src/backend/network/MessageTypes");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chad-tests-"));
const config = {
  databasePath: path.join(tempRoot, "test.sqlite"),
  storagePath: path.join(tempRoot, "uploads"),
  tcpHost: "127.0.0.1",
  tcpPort: 0,
  udpHost: "127.0.0.1",
  udpPort: 0,
  maxFileSize: 2 * 1024 * 1024,
  fileChunkSize: 1024,
  mediaChunkSize: 700,
  callTimeoutMs: 2000,
};

DatabaseConnection.resetForTests();
const database = DatabaseConnection.getInstance(config.databasePath);
database.initialize();

const userRepository = new UserRepository(database);
const chatRepository = new ChatRepository(database);
const groupRepository = new GroupRepository(database);
const fileRepository = new FileRepository(database);
const callRepository = new CallRepository(database);
const settingsRepository = new SettingsRepository(database);
const eventBus = EventBus.getInstance();
const notificationService = new NotificationService(eventBus);
const authService = new AuthService(userRepository);
const chatService = new ChatService(
  chatRepository,
  groupRepository,
  notificationService,
);
const groupService = new GroupService(
  groupRepository,
  userRepository,
  chatService,
  notificationService,
);
const settingsService = new SettingsService(
  userRepository,
  settingsRepository,
  config,
  notificationService,
);
const fileService = new FileService(fileRepository, chatService, config);
const callService = new CallService(
  callRepository,
  groupRepository,
  userRepository,
  notificationService,
  config,
);

test.before(async () => {
  await seedDatabase({ database, config });
});

test.after(() => {
  DatabaseConnection.resetForTests();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("registro, login y validación de username único", async () => {
  const user = await authService.register({
    username: "tester",
    displayName: "Test User",
    password: "123456",
  });

  assert.equal(user.username, "tester");

  const loggedIn = await authService.login({
    username: "tester",
    password: "123456",
  });
  assert.equal(loggedIn.id, user.id);

  await assert.rejects(
    authService.register({
      username: "tester",
      displayName: "Duplicated",
      password: "123456",
    }),
    /ya está registrado/,
  );
  await assert.rejects(
    authService.login({ username: "tester", password: "incorrecta" }),
    /incorrecta/,
  );
});

test("cambio de contraseña y foto de perfil", async () => {
  const user = userRepository.findByUsername("tester");

  await settingsService.changePassword(user.id, {
    currentPassword: "123456",
    newPassword: "abcdef",
  });

  await assert.rejects(
    authService.login({ username: "tester", password: "123456" }),
    /incorrecta/,
  );
  const loggedIn = await authService.login({
    username: "tester",
    password: "abcdef",
  });
  assert.equal(loggedIn.id, user.id);

  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const updated = settingsService.updateAvatar(user.id, {
    originalName: "avatar.png",
    mimeType: "image/png",
    dataBase64: pngBase64,
  });
  assert.match(updated.avatarData, /^data:image\/png;base64,/);

  const renamed = settingsService.updateProfile(user.id, {
    username: "tester_updated",
    displayName: "Updated Tester",
    status: "busy",
  });
  assert.equal(renamed.username, "tester_updated");
  assert.equal(renamed.displayName, "Updated Tester");
});

test("chat privado y persistencia de mensajes", () => {
  const user1 = userRepository.findByUsername("user1");
  const tester = userRepository.findByUsername("tester_updated");
  const chat = chatService.openPrivateChat(user1.id, tester.id);
  const message = chatService.sendText(user1.id, {
    contextType: "private",
    contextId: chat.id,
    content: "Mensaje de prueba",
  });
  const history = chatService.getMessages(tester.id, {
    contextType: "private",
    contextId: chat.id,
  });

  assert.equal(message.content, "Mensaje de prueba");
  assert.ok(history.some((item) => item.id === message.id));
});

test("historial pagina hacia atrás y sincroniza mensajes nuevos por ID", async () => {
  const tester = userRepository.findByUsername("tester_updated");
  const paginationUser = await authService.register({
    username: "pagination_user",
    displayName: "Pagination User",
    password: "123456",
  });
  const chat = chatService.openPrivateChat(tester.id, paginationUser.id);
  const sent = [];

  for (let index = 1; index <= 125; index += 1) {
    sent.push(
      chatService.sendText(tester.id, {
        contextType: "private",
        contextId: chat.id,
        content: `Mensaje paginado ${index}`,
      }),
    );
  }

  const latest = chatService.getMessages(paginationUser.id, {
    contextType: "private",
    contextId: chat.id,
  });
  assert.equal(latest.length, 100);
  assert.equal(latest[0].id, sent[25].id);
  assert.equal(latest.at(-1).id, sent.at(-1).id);

  const older = chatService.getMessages(paginationUser.id, {
    contextType: "private",
    contextId: chat.id,
    beforeMessageId: latest[0].id,
  });
  assert.equal(older.length, 25);
  assert.equal(older[0].id, sent[0].id);

  const synchronized = chatService.syncMessages(paginationUser.id, {
    contextType: "private",
    contextId: chat.id,
    afterMessageId: sent[119].id,
  });
  assert.equal(synchronized.messages.length, 5);
  assert.equal(synchronized.messages[0].id, sent[120].id);
  assert.equal(synchronized.latestMessageId, sent.at(-1).id);
  assert.equal(synchronized.resetRequired, false);
});

test("vaciar y eliminar chat son acciones locales del usuario", () => {
  const user1 = userRepository.findByUsername("user1");
  const tester = userRepository.findByUsername("tester_updated");
  const chat = chatService.openPrivateChat(user1.id, tester.id);
  chatService.sendText(user1.id, {
    contextType: "private",
    contextId: chat.id,
    content: "Historial anterior al vaciado",
  });

  chatService.clearPrivateChat(tester.id, chat.id);
  const clearedHistory = chatService.getMessages(tester.id, {
    contextType: "private",
    contextId: chat.id,
  });
  const otherUserHistory = chatService.getMessages(user1.id, {
    contextType: "private",
    contextId: chat.id,
  });
  assert.equal(clearedHistory.length, 0);
  assert.ok(
    otherUserHistory.some(
      (message) => message.content === "Historial anterior al vaciado",
    ),
  );

  const newMessage = chatService.sendText(user1.id, {
    contextType: "private",
    contextId: chat.id,
    content: "Mensaje posterior al vaciado",
  });
  assert.deepEqual(
    chatService
      .getMessages(tester.id, {
        contextType: "private",
        contextId: chat.id,
      })
      .map((message) => message.id),
    [newMessage.id],
  );

  chatService.removePrivateChat(tester.id, chat.id);
  assert.equal(
    chatService
      .listPrivateChats(tester.id)
      .some((listedChat) => listedChat.id === chat.id),
    false,
  );

  chatService.sendText(user1.id, {
    contextType: "private",
    contextId: chat.id,
    content: "Mensaje que vuelve a mostrar el chat",
  });
  assert.equal(
    chatService
      .listPrivateChats(tester.id)
      .some((listedChat) => listedChat.id === chat.id),
    true,
  );
});

test("respuestas, mensajes fijados y borrado lógico", () => {
  const user1 = userRepository.findByUsername("user1");
  const tester = userRepository.findByUsername("tester_updated");
  const chat = chatService.openPrivateChat(user1.id, tester.id);
  const original = chatService.sendText(user1.id, {
    contextType: "private",
    contextId: chat.id,
    content: "Mensaje para responder",
  });
  const reply = chatService.sendText(tester.id, {
    contextType: "private",
    contextId: chat.id,
    content: "Esta es una respuesta",
    replyToId: original.id,
  });

  assert.equal(reply.reply.id, original.id);
  assert.equal(reply.reply.content, original.content);

  const pinned = chatService.setMessagePinned(tester.id, original.id, true);
  assert.equal(pinned.isPinned, true);

  assert.throws(
    () => chatService.deleteMessage(tester.id, original.id),
    /propios mensajes/,
  );
  const deleted = chatService.deleteMessage(user1.id, original.id);
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.isPinned, false);
  assert.equal(deleted.content, "");

  const history = chatService.getMessages(tester.id, {
    contextType: "private",
    contextId: chat.id,
  });
  const persistedReply = history.find((message) => message.id === reply.id);
  assert.equal(persistedReply.reply.deleted, true);
});

test("creación de grupo y mensaje grupal", () => {
  const user1 = userRepository.findByUsername("user1");
  const tester = userRepository.findByUsername("tester_updated");
  const group = groupService.create(user1.id, {
    name: "Grupo Test",
    description: "Pruebas automatizadas",
    memberIds: [tester.id],
  });
  const message = chatService.sendText(tester.id, {
    contextType: "group",
    contextId: group.id,
    content: "Hola al grupo",
  });

  assert.equal(group.name, "Grupo Test");
  assert.equal(
    group.members.find((member) => member.id === user1.id).role,
    "owner",
  );
  assert.equal(message.groupId, group.id);
});

test("jerarquías, expulsión, salida y mensajes de sistema del grupo", () => {
  const owner = userRepository.findByUsername("user1");
  const admin = userRepository.findByUsername("user2");
  const member = userRepository.findByUsername("user3");
  const user4 = userRepository.findByUsername("user4");
  const group = groupService.create(owner.id, {
    name: "Grupo con jerarquías",
    memberIds: [admin.id, member.id],
  });

  const promoted = groupService.promoteToAdmin(owner.id, group.id, admin.id);
  assert.equal(
    promoted.members.find((item) => item.id === admin.id).role,
    "admin",
  );
  const promotedByAdmin = groupService.promoteToAdmin(
    admin.id,
    group.id,
    member.id,
  );
  assert.equal(
    promotedByAdmin.members.find((item) => item.id === member.id).role,
    "admin",
  );
  assert.throws(
    () => groupService.removeMember(admin.id, group.id, owner.id),
    /dueño no puede ser expulsado/,
  );

  groupService.update(owner.id, group.id, { memberIds: [user4.id] });
  let messages = chatService.getMessages(owner.id, {
    contextType: "group",
    contextId: group.id,
  });
  assert.ok(
    messages.some(
      (message) =>
        message.messageType === "system" &&
        message.content === `${user4.displayName} se unió al grupo.`,
    ),
  );

  groupService.removeMember(admin.id, group.id, member.id);
  assert.equal(groupRepository.isMember(group.id, member.id), false);
  messages = chatService.getMessages(owner.id, {
    contextType: "group",
    contextId: group.id,
  });
  assert.ok(
    messages.some(
      (message) =>
        message.messageType === "system" &&
        message.content === `${member.displayName} fue expulsado.`,
    ),
  );

  groupService.leave(user4.id, group.id);
  assert.equal(groupRepository.isMember(group.id, user4.id), false);
  messages = chatService.getMessages(owner.id, {
    contextType: "group",
    contextId: group.id,
  });
  assert.ok(
    messages.some(
      (message) =>
        message.messageType === "system" &&
        message.content === `${user4.displayName} abandonó el grupo.`,
    ),
  );

  const afterOwnerLeaves = groupService.leave(owner.id, group.id);
  assert.equal(groupRepository.isMember(group.id, owner.id), false);
  assert.equal(
    afterOwnerLeaves.members.find((item) => item.id === admin.id).role,
    "owner",
  );
});

test("moderadores borran mensajes y vacían el chat grupal", () => {
  const owner = userRepository.findByUsername("user1");
  const admin = userRepository.findByUsername("user2");
  const member = userRepository.findByUsername("user3");
  const group = groupService.create(owner.id, {
    name: "Moderación de mensajes",
    memberIds: [admin.id, member.id],
  });
  groupService.promoteToAdmin(owner.id, group.id, admin.id);

  const memberMessage = chatService.sendText(member.id, {
    contextType: "group",
    contextId: group.id,
    content: "Mensaje que será moderado",
  });
  const deleted = chatService.deleteMessage(admin.id, memberMessage.id);
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.deletionReason, "admin");

  chatService.sendText(member.id, {
    contextType: "group",
    contextId: group.id,
    content: "Mensaje antes de vaciar",
  });
  assert.throws(
    () => chatService.clearGroupChat(member.id, group.id),
    /dueño o un admin/,
  );
  const cleared = chatService.clearGroupChat(owner.id, group.id);
  assert.ok(cleared.deletedMessages >= 1);
  assert.equal(
    chatService.getMessages(owner.id, {
      contextType: "group",
      contextId: group.id,
    }).length,
    0,
  );
});

test("transferencia de archivo por chunks", () => {
  const user1 = userRepository.findByUsername("user1");
  const user2 = userRepository.findByUsername("user2");
  const chat = chatService.openPrivateChat(user1.id, user2.id);
  const content = Buffer.from("Documento enviado en varios bloques");
  const transfer = fileService.beginUpload(user1.id, {
    contextType: "private",
    contextId: chat.id,
    originalName: "prueba.txt",
    mimeType: "text/plain",
    size: content.length,
  });

  fileService.appendChunk(user1.id, {
    transferId: transfer.transferId,
    chunkBase64: content.subarray(0, 10).toString("base64"),
  });
  fileService.appendChunk(user1.id, {
    transferId: transfer.transferId,
    chunkBase64: content.subarray(10).toString("base64"),
  });

  const result = fileService.finishUpload(user1.id, transfer);
  const download = fileService.download(user2.id, result.file.id);

  assert.equal(
    Buffer.from(download.dataBase64, "base64").toString(),
    content.toString(),
  );
  assert.equal(result.message.messageType, "document");
});

test("nota de voz se guarda como mensaje de audio", () => {
  const user1 = userRepository.findByUsername("user1");
  const user2 = userRepository.findByUsername("user2");
  const chat = chatService.openPrivateChat(user1.id, user2.id);
  const original = chatService.sendText(user2.id, {
    contextType: "private",
    contextId: chat.id,
    content: "Envía una nota de voz",
  });
  const content = Buffer.from("audio-opus-simulado");
  const transfer = fileService.beginUpload(user1.id, {
    contextType: "private",
    contextId: chat.id,
    originalName: "nota-voz.webm",
    mimeType: "audio/webm;codecs=opus",
    size: content.length,
    replyToId: original.id,
  });

  fileService.appendChunk(user1.id, {
    transferId: transfer.transferId,
    chunkBase64: content.toString("base64"),
  });
  const result = fileService.finishUpload(user1.id, transfer);

  assert.equal(result.file.fileType, "audio");
  assert.equal(result.message.messageType, "audio");
  assert.equal(result.message.reply.id, original.id);
  assert.equal(result.message.file.previewData, null);

  const preview = fileService.preview(user2.id, result.file.id);
  assert.match(preview.mimeType, /^audio\/webm/);
  assert.equal(
    Buffer.from(preview.dataBase64, "base64").toString(),
    content.toString(),
  );
});

test("llamadas aceptadas y rechazadas quedan registradas", () => {
  const user1 = userRepository.findByUsername("user1");
  const user2 = userRepository.findByUsername("user2");

  const audio = callService.start(user1.id, {
    callType: "audio",
    receiverId: user2.id,
  });
  const accepted = callService.accept(user2.id, audio.id);
  assert.equal(accepted.status, "in_progress");
  const ended = callService.end(user1.id, audio.id);
  assert.equal(ended.status, "ended");

  const video = callService.start(user1.id, {
    callType: "video",
    receiverId: user2.id,
  });
  const rejected = callService.reject(user2.id, video.id);
  assert.equal(rejected.status, "rejected");
});

test("cada integrante decide si se une a una llamada grupal", () => {
  const user1 = userRepository.findByUsername("user1");
  const user2 = userRepository.findByUsername("user2");
  const user3 = userRepository.findByUsername("user3");
  const group = groupService.create(user1.id, {
    name: "Llamada independiente",
    description: "Prueba de participantes",
    memberIds: [user2.id, user3.id],
  });

  const started = callService.start(user1.id, {
    callType: "video",
    groupId: group.id,
  });
  assert.deepEqual(started.joinedParticipantIds, [user1.id]);
  assert.equal(
    started.participants.find((participant) => participant.id === user2.id)
      .status,
    "invited",
  );

  const firstJoined = callService.accept(user2.id, started.id);
  assert.deepEqual(
    new Set(firstJoined.joinedParticipantIds),
    new Set([user1.id, user2.id]),
  );
  assert.equal(
    firstJoined.participants.find(
      (participant) => participant.id === user3.id,
    ).status,
    "invited",
  );
  assert.deepEqual(
    new Set(callService.getRecipientIds(started.id, user1.id)),
    new Set([user2.id]),
  );
  assert.throws(
    () =>
      callService.start(user3.id, {
        callType: "audio",
        groupId: group.id,
      }),
    /llamada activa/,
  );

  callService.reject(user3.id, started.id);
  const secondJoined = callService.join(user3.id, started.id);
  assert.deepEqual(
    new Set(secondJoined.joinedParticipantIds),
    new Set([user1.id, user2.id, user3.id]),
  );

  const afterUserTwoLeaves = callService.end(user2.id, started.id);
  assert.equal(afterUserTwoLeaves.status, "in_progress");
  assert.equal(afterUserTwoLeaves.joinedParticipantIds.includes(user2.id), false);

  callService.end(user3.id, started.id);
  const ended = callService.end(user1.id, started.id);
  assert.equal(ended.status, "ended");
});

test("modo claro y preferencias persisten", () => {
  const tester = userRepository.findByUsername("tester_updated");
  const settings = settingsService.updateSettings(tester.id, {
    theme: "light",
    soundEnabled: false,
    accentColor: "#2277aa",
  });

  assert.equal(settings.theme, "light");
  assert.equal(settings.soundEnabled, 0);
  assert.equal(settings.accentColor, "#2277aa");
});

test("servidor TCP responde a login y bootstrap", async () => {
  const server = new ChatServer({ config, database });
  const addresses = await server.start();
  const clientOne = new TcpClient();
  const clientTwo = new TcpClient();
  clientOne.on("error", () => {});
  clientTwo.on("error", () => {});

  await clientOne.connect("127.0.0.1", addresses.tcp.port);
  await clientTwo.connect("127.0.0.1", addresses.tcp.port);
  const login = await clientOne.request(MessageTypes.AUTH_LOGIN, {
    username: "user4",
    password: "123456",
  });
  const secondLogin = await clientTwo.request(MessageTypes.AUTH_LOGIN, {
    username: "admin",
    password: "123456",
  });
  const bootstrap = await clientOne.request(MessageTypes.APP_BOOTSTRAP);

  assert.equal(login.user.username, "user4");
  assert.ok(Array.isArray(bootstrap.users));
  assert.ok(Array.isArray(bootstrap.groups));

  const chat = await clientOne.request(MessageTypes.CHAT_OPEN, {
    targetUserId: secondLogin.user.id,
  });
  const eventPromise = new Promise((resolve) => {
    clientTwo.on("event", (event) => {
      if (event.event === "message:new") resolve(event.data);
    });
  });
  await clientOne.request(MessageTypes.CHAT_SEND, {
    contextType: "private",
    contextId: chat.id,
    content: "Mensaje TCP real",
  });
  const received = await eventPromise;
  assert.equal(received.content, "Mensaje TCP real");

  const incomingCallPromise = new Promise((resolve) => {
    clientTwo.on("event", (event) => {
      if (event.event === "call:incoming") resolve(event.data);
    });
  });
  const outgoingCall = await clientOne.request(MessageTypes.CALL_START, {
    callType: "audio",
    receiverId: secondLogin.user.id,
  });
  const incomingCall = await incomingCallPromise;
  assert.equal(incomingCall.id, outgoingCall.id);

  const acceptedCall = await clientTwo.request(MessageTypes.CALL_ACCEPT, {
    callId: outgoingCall.id,
  });
  assert.equal(acceptedCall.status, "in_progress");

  const udpOne = new UdpMediaClient(config);
  const udpTwo = new UdpMediaClient(config);
  await udpOne.start({
    serverHost: "127.0.0.1",
    serverPort: addresses.udp.port,
    userId: login.user.id,
  });
  await udpTwo.start({
    serverHost: "127.0.0.1",
    serverPort: addresses.udp.port,
    userId: secondLogin.user.id,
  });
  await new Promise((resolve) => setTimeout(resolve, 30));

  const mediaPromise = new Promise((resolve) => {
    udpTwo.on("media", resolve);
  });
  const mediaContent = Buffer.from("audio-media-packet").toString("base64");
  udpOne.sendMedia({
    callId: outgoingCall.id,
    mediaType: "audio",
    encoding: "pcm_s16le",
    sampleRate: 16000,
    channels: 1,
    dataBase64: mediaContent,
  });
  const media = await mediaPromise;
  assert.equal(
    Buffer.from(media.dataBase64, "base64").toString(),
    "audio-media-packet",
  );
  assert.equal(media.encoding, "pcm_s16le");
  assert.equal(media.sampleRate, 16000);
  assert.equal(media.sequence, 1);

  await clientOne.request(MessageTypes.CALL_END, {
    callId: outgoingCall.id,
  });
  udpOne.stop();
  udpTwo.stop();

  await clientOne.request(MessageTypes.AUTH_LOGOUT);
  await clientTwo.request(MessageTypes.AUTH_LOGOUT);
  clientOne.disconnect();
  clientTwo.disconnect();
  await server.stop();
});
