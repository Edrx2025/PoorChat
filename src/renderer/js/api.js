export const api = {
  register: (payload) => window.chad.auth.register(payload),
  login: (payload) => window.chad.auth.login(payload),
  logout: () => window.chad.auth.logout(),
  bootstrap: () => window.chad.app.bootstrap(),
  openChat: (targetUserId) => window.chad.chat.open({ targetUserId }),
  getMessages: (contextType, contextId) =>
    window.chad.chat.getMessages({ contextType, contextId }),
  sendMessage: (contextType, contextId, content, replyToId = null) =>
    window.chad.chat.send({ contextType, contextId, content, replyToId }),
  deleteMessage: (messageId) =>
    window.chad.chat.deleteMessage({ messageId }),
  pinMessage: (messageId, pinned) =>
    window.chad.chat.pinMessage({ messageId, pinned }),
  clearChat: (chatId) => window.chad.chat.clear({ chatId }),
  removeChat: (chatId) => window.chad.chat.remove({ chatId }),
  createGroup: (payload) => window.chad.group.create(payload),
  updateGroup: (payload) => window.chad.group.update(payload),
  promoteGroupMember: (groupId, targetUserId) =>
    window.chad.group.promote({ groupId, targetUserId }),
  removeGroupMember: (groupId, targetUserId) =>
    window.chad.group.removeMember({ groupId, targetUserId }),
  leaveGroup: (groupId) => window.chad.group.leave({ groupId }),
  clearGroup: (groupId) => window.chad.group.clear({ groupId }),
  uploadFile: (contextType, contextId, replyToId = null) =>
    window.chad.file.chooseAndUpload({ contextType, contextId, replyToId }),
  uploadRecordedAudio: (payload) =>
    window.chad.file.uploadRecordedAudio(payload),
  downloadFile: (fileId) => window.chad.file.download({ fileId }),
  startCall: (payload) => window.chad.call.start(payload),
  acceptCall: (callId) => window.chad.call.accept({ callId }),
  joinCall: (callId) => window.chad.call.join({ callId }),
  rejectCall: (callId) => window.chad.call.reject({ callId }),
  endCall: (callId) => window.chad.call.end({ callId }),
  updateSettings: (payload) => window.chad.settings.update(payload),
  updateProfile: (payload) => window.chad.settings.updateProfile(payload),
  changePassword: (payload) =>
    window.chad.settings.changePassword(payload),
  chooseAvatar: () => window.chad.settings.chooseAvatar(),
  sendMedia: (payload) => window.chad.media.send(payload),
};
