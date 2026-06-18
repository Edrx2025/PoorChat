const { publicUser } = require("../utils/presenters");

class AppService {
  constructor(
    userRepository,
    chatService,
    groupService,
    callService,
    settingsService,
  ) {
    this.userRepository = userRepository;
    this.chatService = chatService;
    this.groupService = groupService;
    this.callService = callService;
    this.settingsService = settingsService;
  }

  bootstrap(userId) {
    return {
      currentUser: publicUser(this.userRepository.findById(userId)),
      users: this.userRepository.listExcept(userId).map(publicUser),
      privateChats: this.chatService.listPrivateChats(userId).map((chat) => ({
        ...chat,
        peer: publicUser({
          id: chat.peerId,
          username: chat.peerUsername,
          displayName: chat.peerDisplayName,
          profilePicture: chat.peerProfilePicture,
          status: chat.peerStatus,
        }),
      })),
      groups: this.groupService.listForUser(userId),
      calls: this.callService.list(userId),
      settings: this.settingsService.get(userId),
    };
  }
}

module.exports = AppService;
