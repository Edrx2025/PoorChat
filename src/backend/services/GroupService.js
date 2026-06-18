const { publicUser } = require("../utils/presenters");

class GroupService {
  constructor(groupRepository, userRepository, notificationService) {
    this.groupRepository = groupRepository;
    this.userRepository = userRepository;
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
      throw new Error("Solo un administrador puede modificar el grupo");
    }

    const group = this.groupRepository.update(groupId, {
      name: updates.name?.trim(),
      description: updates.description?.trim(),
      avatar: updates.avatar,
    });

    if (Array.isArray(updates.memberIds)) {
      this.groupRepository.addMembers(groupId, updates.memberIds.map(Number));
    }

    const result = this.getById(group.id);
    this.notificationService.notify(
      "group:updated",
      this.groupRepository.getMemberIds(groupId),
      result,
    );

    return result;
  }
}

module.exports = GroupService;
