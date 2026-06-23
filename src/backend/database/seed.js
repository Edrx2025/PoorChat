const fs = require("fs");
const path = require("path");
const UserRepository = require("../repositories/UserRepository");
const ChatRepository = require("../repositories/ChatRepository");
const GroupRepository = require("../repositories/GroupRepository");
const FileRepository = require("../repositories/FileRepository");
const CallRepository = require("../repositories/CallRepository");
const { hashPassword } = require("../utils/password");
const { ensureDirectory } = require("../utils/fileUtils");

async function seedDatabase({ database, config }) {
  const userRepository = new UserRepository(database);
  const chatRepository = new ChatRepository(database);
  const groupRepository = new GroupRepository(database);
  const fileRepository = new FileRepository(database);
  const callRepository = new CallRepository(database);

  database.exec("UPDATE users SET status = 'offline';");

  if (userRepository.findByUsername("user1")) return;

  const userDefinitions = [
    ["user1", "User One"],
    ["user2", "User Two"],
    ["user3", "User Three"],
    ["user4", "User Four"],
    ["admin", "Admin"],
  ];
  const users = {};

  for (const [username, displayName] of userDefinitions) {
    const passwordHash = await hashPassword("123456");
    users[username] = userRepository.create({
      username,
      displayName,
      passwordHash,
    });
  }

  const chat12 = chatRepository.findOrCreatePrivateChat(
    users.user1.id,
    users.user2.id,
  );
  const chat13 = chatRepository.findOrCreatePrivateChat(
    users.user1.id,
    users.user3.id,
  );

  chatRepository.createMessage({
    chatId: chat12.id,
    senderId: users.user2.id,
    content: "¿Revisamos el avance de Chad?",
    messageType: "text",
  });
  chatRepository.createMessage({
    chatId: chat12.id,
    senderId: users.user1.id,
    content: "Sí, ya quedó lista la base del chat privado.",
    messageType: "text",
  });
  chatRepository.createMessage({
    chatId: chat13.id,
    senderId: users.user3.id,
    content: "Te envié las ideas para la exposición.",
    messageType: "text",
  });

  const studyGroup = groupRepository.create({
    name: "Grupo de Estudio",
    description: "Coordinación de prácticas y revisión de conceptos.",
    avatar: null,
    createdBy: users.user1.id,
    memberIds: [users.user2.id, users.user3.id],
  });
  const finalGroup = groupRepository.create({
    name: "Proyecto Final",
    description: "Canal del equipo para organizar la entrega.",
    avatar: null,
    createdBy: users.admin.id,
    memberIds: [users.user1.id, users.user2.id, users.user4.id],
  });

  chatRepository.createMessage({
    groupId: studyGroup.id,
    senderId: users.user1.id,
    content: "Bienvenidos al grupo de estudio.",
    messageType: "text",
  });
  chatRepository.createMessage({
    groupId: finalGroup.id,
    senderId: users.admin.id,
    content: "Aquí centralizamos las tareas del proyecto.",
    messageType: "text",
  });

  const documentsDirectory = path.join(config.storagePath, "documents");
  ensureDirectory(documentsDirectory);
  const sampleStoredName = "guia-exposicion.txt";
  const samplePath = path.join(documentsDirectory, sampleStoredName);
  const sampleContent =
    "Chad - archivo de demostración\n\nEste archivo confirma la transferencia y persistencia de documentos.";
  fs.writeFileSync(samplePath, sampleContent, "utf8");

  const sampleFile = fileRepository.create({
    originalName: "guia-exposicion.txt",
    storedName: sampleStoredName,
    filePath: samplePath,
    fileType: "document",
    mimeType: "text/plain",
    size: Buffer.byteLength(sampleContent),
    uploadedBy: users.admin.id,
    groupId: finalGroup.id,
  });

  chatRepository.createMessage({
    groupId: finalGroup.id,
    senderId: users.admin.id,
    content: sampleFile.originalName,
    messageType: "document",
    fileId: sampleFile.id,
  });

  const endedAudioCall = callRepository.create({
    callType: "audio",
    callerId: users.user1.id,
    receiverId: users.user2.id,
    status: "started",
  });
  callRepository.updateStatus(endedAudioCall.id, "ended");

  const rejectedVideoCall = callRepository.create({
    callType: "video",
    callerId: users.user3.id,
    receiverId: users.user1.id,
    status: "started",
  });
  callRepository.updateStatus(rejectedVideoCall.id, "rejected");
}

module.exports = seedDatabase;
