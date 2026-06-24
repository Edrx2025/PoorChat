const { publicUser } = require("../utils/presenters");

class GroupService {
  constructor(
    groupRepository,
    userRepository,
    chatService,
    notificationService,
  ) {
    this.groupRepository = groupRepository;
    this.userRepository = userRepository;
    this.chatService = chatService;
    this.notificationService = notificationService;
  }

  create(userId, { name, description = "", memberIds = [] }) {
    const cleanName = String(name || "").trim();

    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new Error("El nombre del grupo debe tener entre 2 y 60 caracteres");
    }

    const validMembers = memberIds
      .map(Number)
      .filter((id) => id > 0 && this.userRepository.findById(id));

    const group = this.groupRepository.create({
      name: cleanName,
      description: String(description || "").trim().slice(0, 240),
      avatar: null,
      createdBy: userId,
      memberIds: validMembers,
    });

    for (const memberId of new Set(validMembers)) {
      if (memberId === userId) continue;
      const member = this.userRepository.findById(memberId);
      this.chatService.createSystemMessage(
        group.id,
        memberId,
        `${member.displayName} se unió al grupo.`,
      );
    }

    const result = this.getById(group.id);
    this.notificationService.notify(
      "group:created",
      this.groupRepository.getMemberIds(group.id),
      result,
    );

    return result;
  }

  listForUser(userId) {
    return this.groupRepository.listForUser(userId).map((group) => ({
      ...group,
      members: group.members.map((member) => ({
        ...publicUser(member),
        role: member.role,
      })),
    }));
  }

  getById(groupId) {
    const group = this.groupRepository.findById(groupId);
    if (!group) throw new Error("El grupo no existe");

    return {
      ...group,
      members: this.groupRepository.listMembers(groupId).map((member) => ({
        ...publicUser(member),
        role: member.role,
      })),
    };
  }

  update(userId, groupId, updates) {
    if (!this.groupRepository.isAdmin(groupId, userId)) {
      throw new Error("Solo el dueño o un admin puede modificar el grupo");
    }

    const group = this.groupRepository.update(groupId, {
      name: updates.name?.trim(),
      description: updates.description?.trim(),
      avatar: updates.avatar,
    });

    if (Array.isArray(updates.memberIds)) {
      const validMemberIds = updates.memberIds
        .map(Number)
        .filter((id) => id > 0 && this.userRepository.findById(id));
      const addedIds = this.groupRepository.addMembers(groupId, validMemberIds);
      for (const memberId of addedIds) {
        const member = this.userRepository.findById(memberId);
        this.chatService.createSystemMessage(
          groupId,
          memberId,
          `${member.displayName} se unió al grupo.`,
        );
      }
    }

    const result = this.getById(group.id);
    this.notificationService.notify(
      "group:updated",
      this.groupRepository.getMemberIds(groupId),
      result,
    );

    return result;
  }

  promoteToAdmin(userId, groupId, targetUserId) {
    const actor = this.requireMember(groupId, userId);
    if (!["owner", "admin"].includes(actor.role)) {
      throw new Error("Solo el dueño o un admin puede nombrar administradores");
    }

    const target = this.requireMember(groupId, targetUserId);
    if (target.role === "owner") {
      throw new Error("El dueño ya tiene todos los permisos");
    }
    if (target.role === "admin") {
      throw new Error("Este integrante ya es admin");
    }

    this.groupRepository.updateMemberRole(groupId, targetUserId, "admin");
    const user = this.userRepository.findById(targetUserId);
    this.chatService.createSystemMessage(
      groupId,
      userId,
      `${user.displayName} ahora es admin.`,
    );
    return this.notifyUpdated(groupId);
  }

  removeMember(userId, groupId, targetUserId) {
    const actor = this.requireMember(groupId, userId);
    const target = this.requireMember(groupId, targetUserId);
    if (!["owner", "admin"].includes(actor.role)) {
      throw new Error("No tienes permisos para expulsar integrantes");
    }
    if (target.userId === userId) {
      throw new Error("Usa la opción Salir del grupo");
    }
    if (target.role === "owner") {
      throw new Error("El dueño no puede ser expulsado");
    }

    const previousMemberIds = this.groupRepository.getMemberIds(groupId);
    const targetUser = this.userRepository.findById(targetUserId);
    this.groupRepository.removeMember(groupId, targetUserId);
    this.chatService.createSystemMessage(
      groupId,
      userId,
      `${targetUser.displayName} fue expulsado.`,
    );
    return this.notifyUpdated(groupId, previousMemberIds);
  }

  leave(userId, groupId) {
    const member = this.requireMember(groupId, userId);
    const previousMemberIds = this.groupRepository.getMemberIds(groupId);
    const user = this.userRepository.findById(userId);

    if (previousMemberIds.length === 1) {
      this.groupRepository.delete(groupId);
      this.notificationService.notify(
        "group:removed",
        previousMemberIds,
        { groupId },
      );
      return { groupId, removed: true };
    }

    if (member.role === "owner") {
      const successor = this.groupRepository.findOwnershipSuccessor(
        groupId,
        userId,
      );
      this.groupRepository.transferOwnership(
        groupId,
        userId,
        successor.userId,
      );
    }

    this.groupRepository.removeMember(groupId, userId);
    this.chatService.createSystemMessage(
      groupId,
      userId,
      `${user.displayName} abandonó el grupo.`,
    );
    return this.notifyUpdated(groupId, previousMemberIds);
  }

  requireMember(groupId, userId) {
    const member = this.groupRepository.getMember(
      Number(groupId),
      Number(userId),
    );
    if (!member) throw new Error("El integrante no pertenece al grupo");
    return member;
  }

  notifyUpdated(groupId, extraRecipientIds = []) {
    const result = this.getById(groupId);
    const recipients = [
      ...new Set([
        ...this.groupRepository.getMemberIds(groupId),
        ...extraRecipientIds,
      ]),
    ];
    this.notificationService.notify("group:updated", recipients, result);
    return result;
  }
}

module.exports = GroupService;
