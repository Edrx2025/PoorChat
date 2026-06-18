const net = require("net");
const AppConfig = require("../config/AppConfig");
const DatabaseConnection = require("../database/DatabaseConnection");
const EventBus = require("../observers/EventBus");
const UserRepository = require("../repositories/UserRepository");
const ChatRepository = require("../repositories/ChatRepository");
const GroupRepository = require("../repositories/GroupRepository");
const FileRepository = require("../repositories/FileRepository");
const CallRepository = require("../repositories/CallRepository");
const SettingsRepository = require("../repositories/SettingsRepository");
const NotificationService = require("../services/NotificationService");
const AuthService = require("../services/AuthService");
const ChatService = require("../services/ChatService");
const GroupService = require("../services/GroupService");
const FileService = require("../services/FileService");
const CallService = require("../services/CallService");
const SettingsService = require("../services/SettingsService");
const AppService = require("../services/AppService");
const MessageTypes = require("../network/MessageTypes");
const ClientConnection = require("./ClientConnection");
const SessionRegistry = require("./SessionRegistry");
const UdpRelayServer = require("./UdpRelayServer");
const seedDatabase = require("../database/seed");

class ChatServer {
  constructor(options = {}) {
    this.config = options.config || AppConfig.getInstance();
    this.database =
      options.database || DatabaseConnection.getInstance(this.config.databasePath);
    this.database.initialize();

    this.eventBus = EventBus.getInstance();
    this.sessionRegistry = new SessionRegistry();

    this.userRepository = new UserRepository(this.database);
    this.chatRepository = new ChatRepository(this.database);
    this.groupRepository = new GroupRepository(this.database);
    this.fileRepository = new FileRepository(this.database);
    this.callRepository = new CallRepository(this.database);
    this.settingsRepository = new SettingsRepository(this.database);

    this.notificationService = new NotificationService(this.eventBus);
    this.authService = new AuthService(this.userRepository);
    this.chatService = new ChatService(
      this.chatRepository,
      this.groupRepository,
      this.notificationService,
    );
    this.groupService = new GroupService(
      this.groupRepository,
      this.userRepository,
      this.notificationService,
    );
    this.settingsService = new SettingsService(
      this.userRepository,
      this.settingsRepository,
      this.config,
      this.notificationService,
    );
    this.fileService = new FileService(
      this.fileRepository,
      this.chatService,
      this.config,
    );
    this.callService = new CallService(
      this.callRepository,
      this.groupRepository,
      this.userRepository,
      this.notificationService,
      this.config,
    );
    this.appService = new AppService(
      this.userRepository,
      this.chatService,
      this.groupService,
      this.callService,
      this.settingsService,
    );

    this.tcpServer = net.createServer((socket) => {
      const connection = new ClientConnection(socket, this);
      connection.start();
    });
    this.udpServer = new UdpRelayServer({
      host: this.config.udpHost,
      port: this.config.udpPort,
      getRecipientIds: (callId, senderId) =>
        this.callService.getRecipientIds(callId, senderId),
    });

    this.bindObservers();
  }

  async initialize() {
    await seedDatabase({
      database: this.database,
      config: this.config,
    });
  }

  bindObservers() {
    const routedEvents = [
      "message:new",
      "group:created",
      "group:updated",
      "call:incoming",
      "call:updated",
      "settings:updated",
    ];

    for (const eventName of routedEvents) {
      this.eventBus.on(eventName, ({ recipients, data }) => {
        this.sessionRegistry.sendToUsers(recipients, eventName, data);
      });
    }

    this.eventBus.on("user:updated", ({ data }) => {
      this.sessionRegistry.broadcast("user:updated", data);
    });
  }

  async handleRequest(connection, request) {
    const { type, payload = {} } = request;

    if (type === MessageTypes.AUTH_REGISTER) {
      return this.authService.register(payload);
    }

    if (type === MessageTypes.AUTH_LOGIN) {
      const user = await this.authService.login(payload);
      try {
        this.sessionRegistry.add(user.id, connection);
      } catch (error) {
        this.authService.logout(user.id);
        throw error;
      }
      connection.authenticate(user);
      this.broadcastPresence();
      return {
        user,
        udpPort: this.config.udpPort,
      };
    }

    const user = connection.requireUser();

    switch (type) {
      case MessageTypes.AUTH_LOGOUT:
        this.handleLogout(connection);
        return { loggedOut: true };
      case MessageTypes.APP_BOOTSTRAP:
        return this.appService.bootstrap(user.id);
      case MessageTypes.CHAT_OPEN:
        return this.chatService.openPrivateChat(user.id, Number(payload.targetUserId));
      case MessageTypes.CHAT_MESSAGES:
        return this.chatService.getMessages(user.id, payload);
      case MessageTypes.CHAT_SEND:
        return this.chatService.sendText(user.id, payload);
      case MessageTypes.GROUP_CREATE:
        return this.groupService.create(user.id, payload);
      case MessageTypes.GROUP_UPDATE:
        return this.groupService.update(user.id, Number(payload.groupId), payload);
      case MessageTypes.FILE_UPLOAD_START:
        return this.fileService.beginUpload(user.id, payload);
      case MessageTypes.FILE_UPLOAD_CHUNK:
        return this.fileService.appendChunk(user.id, payload);
      case MessageTypes.FILE_UPLOAD_END:
        return this.fileService.finishUpload(user.id, payload);
      case MessageTypes.FILE_LIST:
        return this.fileService.list(user.id, payload);
      case MessageTypes.FILE_DOWNLOAD:
        return this.fileService.download(user.id, Number(payload.fileId));
      case MessageTypes.CALL_START:
        return this.callService.start(user.id, payload);
      case MessageTypes.CALL_ACCEPT:
        return this.callService.accept(user.id, Number(payload.callId));
      case MessageTypes.CALL_REJECT:
        return this.callService.reject(user.id, Number(payload.callId));
      case MessageTypes.CALL_END:
        return this.callService.end(user.id, Number(payload.callId));
      case MessageTypes.SETTINGS_UPDATE:
        return this.settingsService.updateSettings(user.id, payload);
      case MessageTypes.PROFILE_UPDATE:
        return this.settingsService.updateProfile(user.id, payload);
      case MessageTypes.PROFILE_AVATAR:
        return this.settingsService.updateAvatar(user.id, payload);
      case MessageTypes.PASSWORD_CHANGE:
        return this.settingsService.changePassword(user.id, payload);
      default:
        throw new Error(`Operación no soportada: ${type}`);
    }
  }

  handleLogout(connection) {
    if (!connection.user) return;
    this.authService.logout(connection.user.id);
    this.sessionRegistry.remove(connection.user.id);
    connection.user = null;
    this.broadcastPresence();
  }

  handleDisconnect(connection) {
    this.handleLogout(connection);
  }

  broadcastPresence() {
    this.sessionRegistry.broadcast("presence:changed", {
      connectedUserIds: this.sessionRegistry.getConnectedUserIds(),
    });
  }

  async start() {
    await this.initialize();

    await new Promise((resolve, reject) => {
      this.tcpServer.once("error", reject);
      this.tcpServer.listen(
        this.config.tcpPort,
        this.config.tcpHost,
        resolve,
      );
    });
    await this.udpServer.start();

    const udpAddress = this.udpServer.address();
    if (this.config.udpPort === 0) {
      this.config.udpPort = udpAddress.port;
    }

    return {
      tcp: this.tcpServer.address(),
      udp: udpAddress,
    };
  }

  async stop() {
    await Promise.all([
      new Promise((resolve) => {
        if (!this.tcpServer.listening) return resolve();
        this.tcpServer.close(resolve);
      }),
      this.udpServer.stop(),
    ]);
  }
}

module.exports = ChatServer;
