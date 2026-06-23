const CallFactory = require("../factories/CallFactory");
const { presentCall } = require("../utils/presenters");

class CallService {
  constructor(
    callRepository,
    groupRepository,
    userRepository,
    notificationService,
    config,
  ) {
    this.callRepository = callRepository;
    this.groupRepository = groupRepository;
    this.userRepository = userRepository;
    this.notificationService = notificationService;
    this.config = config;
    this.timeoutHandles = new Map();
  }

  start(userId, { callType, receiverId = null, groupId = null }) {
    const call = CallFactory.create(callType, {
      callerId: userId,
      receiverId: receiverId ? Number(receiverId) : null,
      groupId: groupId ? Number(groupId) : null,
      status: "started",
    });

    const recipients = this.resolveRecipients(call, userId);
    if (!recipients.length) throw new Error("No hay destinatarios para la llamada");

    const saved = this.callRepository.create(call);
    const presented = presentCall(saved);

    this.userRepository.updateStatus(userId, "in_call");
    this.notificationService.notify("call:incoming", recipients, presented);
    this.notificationService.notify("call:updated", [userId], presented);

    const timeout = setTimeout(() => {
      const current = this.callRepository.findById(saved.id);
      if (current?.status === "started") {
        const missed = presentCall(
          this.callRepository.updateStatus(saved.id, "missed"),
        );
        this.userRepository.updateStatus(userId, "online");
        this.notificationService.notify(
          "call:updated",
          [userId, ...recipients],
          missed,
        );
      }
      this.timeoutHandles.delete(saved.id);
    }, this.config.callTimeoutMs);

    this.timeoutHandles.set(saved.id, timeout);
    return presented;
  }

  accept(userId, callId) {
    const call = this.assertRecipient(userId, callId);
    this.clearTimeout(call.id);

    const updated = presentCall(
      this.callRepository.updateStatus(call.id, "in_progress"),
    );

    this.userRepository.updateStatus(call.callerId, "in_call");
    this.userRepository.updateStatus(userId, "in_call");
    this.notificationService.notify(
      "call:updated",
      this.getParticipantIds(call),
      updated,
    );

    return {
      ...updated,
      udpPort: this.config.udpPort,
    };
  }

  reject(userId, callId) {
    const call = this.assertRecipient(userId, callId);
    this.clearTimeout(call.id);
    const updated = presentCall(
      this.callRepository.updateStatus(call.id, "rejected"),
    );

    this.userRepository.updateStatus(call.callerId, "online");
    this.notificationService.notify(
      "call:updated",
      this.getParticipantIds(call),
      updated,
    );
    return updated;
  }

  end(userId, callId) {
    const call = this.callRepository.findById(callId);
    if (!call || !this.getParticipantIds(call).includes(userId)) {
      throw new Error("No perteneces a esta llamada");
    }

    this.clearTimeout(call.id);
    const updated = presentCall(
      this.callRepository.updateStatus(call.id, "ended"),
    );

    for (const participantId of this.getParticipantIds(call)) {
      this.userRepository.updateStatus(participantId, "online");
    }

    this.notificationService.notify(
      "call:updated",
      this.getParticipantIds(call),
      updated,
    );
    return updated;
  }

  list(userId) {
    return this.callRepository.listForUser(userId).map(presentCall);
  }

  getRecipientIds(callId, senderId) {
    const call = this.callRepository.findById(callId);
    if (!call || call.status !== "in_progress") return [];

    return this.getParticipantIds(call).filter((id) => id !== senderId);
  }

  resolveRecipients(call, callerId) {
    if (call.receiverId) {
      if (!this.userRepository.findById(call.receiverId)) {
        throw new Error("El usuario destinatario no existe");
      }
      return [call.receiverId];
    }

    if (!this.groupRepository.isMember(call.groupId, callerId)) {
      throw new Error("No perteneces a este grupo");
    }

    return this.groupRepository
      .getMemberIds(call.groupId)
      .filter((id) => id !== callerId);
  }

  assertRecipient(userId, callId) {
    const call = this.callRepository.findById(callId);
    if (!call || call.status !== "started") {
      throw new Error("La llamada ya no está disponible");
    }
    if (!this.getParticipantIds(call).includes(userId) || call.callerId === userId) {
      throw new Error("No puedes responder esta llamada");
    }
    return call;
  }

  getParticipantIds(call) {
    if (call.receiverId) return [call.callerId, call.receiverId];
    return this.groupRepository.getMemberIds(call.groupId);
  }

  clearTimeout(callId) {
    const handle = this.timeoutHandles.get(callId);
    if (handle) clearTimeout(handle);
    this.timeoutHandles.delete(callId);
  }
}

module.exports = CallService;
