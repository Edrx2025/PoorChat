const path = require("path");
const { fileToDataUrl } = require("./fileUtils");

function mimeFromFilePath(filePath) {
  const extension = path.extname(filePath || "").toLowerCase();

  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    profilePicture: user.profilePicture,
    avatarData: user.profilePicture
      ? fileToDataUrl(user.profilePicture, mimeFromFilePath(user.profilePicture))
      : null,
    status: user.status,
    theme: user.theme,
    createdAt: user.createdAt,
  };
}

function presentMessage(message) {
  if (!message) return null;

  const {
    senderProfilePicture,
    filePath,
    fileOriginalName,
    fileType,
    fileMimeType,
    fileSize,
    replyContent,
    replyMessageType,
    replyDeletedAt,
    replySenderDisplayName,
    ...messageData
  } = message;
  const deleted = Boolean(messageData.deletedAt);

  return {
    ...messageData,
    content: deleted ? "" : messageData.content,
    isPinned: Boolean(messageData.isPinned),
    deleted,
    deletedBy: messageData.deletedBy || null,
    deletionReason: messageData.deletionReason || null,
    senderAvatarData: null,
    file: !deleted && messageData.fileId
      ? {
          id: messageData.fileId,
          originalName: fileOriginalName,
          fileType,
          mimeType: fileMimeType,
          size: fileSize,
          previewData: null,
        }
      : null,
    reply: messageData.replyToId
      ? {
          id: messageData.replyToId,
          senderDisplayName: replySenderDisplayName,
          content: replyDeletedAt
            ? "Mensaje borrado"
            : replyContent,
          messageType: replyMessageType,
          deleted: Boolean(replyDeletedAt),
        }
      : null,
  };
}

function presentCall(call, participants = []) {
  if (!call) return null;

  const presentedParticipants = participants.map((participant) => ({
    ...participant,
    avatarData: participant.profilePicture
      ? fileToDataUrl(
          participant.profilePicture,
          mimeFromFilePath(participant.profilePicture),
        )
      : null,
  }));

  return {
    ...call,
    participants: presentedParticipants,
    joinedParticipantIds: presentedParticipants
      .filter((participant) => participant.status === "joined")
      .map((participant) => participant.id),
    callerAvatarData: call.callerProfilePicture
      ? fileToDataUrl(
          call.callerProfilePicture,
          mimeFromFilePath(call.callerProfilePicture),
        )
      : null,
    receiverAvatarData: call.receiverProfilePicture
      ? fileToDataUrl(
          call.receiverProfilePicture,
          mimeFromFilePath(call.receiverProfilePicture),
        )
      : null,
  };
}

module.exports = {
  publicUser,
  presentMessage,
  presentCall,
};
