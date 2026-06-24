const path = require("path");
const fs = require("fs");
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

  const deleted = Boolean(message.deletedAt);
  let filePreviewData = null;
  if (
    !deleted &&
    message.filePath &&
    message.fileSize <= 8 * 1024 * 1024 &&
    ["image", "audio", "video"].includes(message.fileType) &&
    fs.existsSync(message.filePath)
  ) {
    filePreviewData = fileToDataUrl(
      message.filePath,
      message.fileMimeType || "application/octet-stream",
    );
  }

  return {
    ...message,
    content: deleted ? "" : message.content,
    isPinned: Boolean(message.isPinned),
    deleted,
    senderAvatarData: message.senderProfilePicture
      ? fileToDataUrl(
          message.senderProfilePicture,
          mimeFromFilePath(message.senderProfilePicture),
        )
      : null,
    file: !deleted && message.fileId
      ? {
          id: message.fileId,
          originalName: message.fileOriginalName,
          fileType: message.fileType,
          mimeType: message.fileMimeType,
          size: message.fileSize,
          previewData: filePreviewData,
        }
      : null,
    reply: message.replyToId
      ? {
          id: message.replyToId,
          senderDisplayName: message.replySenderDisplayName,
          content: message.replyDeletedAt
            ? "Mensaje borrado"
            : message.replyContent,
          messageType: message.replyMessageType,
          deleted: Boolean(message.replyDeletedAt),
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
