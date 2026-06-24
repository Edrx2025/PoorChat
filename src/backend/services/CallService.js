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
    const normalizedGroupId = groupId ? Number(groupId) : null;
    if (
      normalizedGroupId &&
      this.callRepository.findActiveForGroup(normalizedGroupId)
    ) {
      throw new Error("Ya hay una llamada activa en este grupo");
    }

    const call = CallFactory.create(callType, {
      callerId: userId,
      receiverId: receiverId ? Number(receiverId) : null,
      groupId: normalizedGroupId,
      status: "started",
    });

    const recipients = this.resolveRecipients(call, userId);
    if (!recipients.length) throw new Error("No hay destinatarios para la llamada");

    const saved = this.callRepository.create(call);
    this.callRepository.createParticipants(
      saved.id,
      userId,
      recipients,
    );
    const presented = this.present(saved);

    this.userRepository.updateStatus(userId, "in_call");
    this.notificationService.notify("call:incoming", recipients, presented);
    this.notificationService.notify(
      "call:updated",
      [userId, ...recipients],
      presented,
    );

    const timeout = setTimeout(() => {
      const current = this.callRepository.findById(saved.id);
      if (["started", "in_progress"].includes(current?.status)) {
        this.callRepository.expireInvitations(saved.id);

        if (current.status === "started") {
          this.callRepository.updateParticipantStatus(
            saved.id,
            userId,
            "left",
          );
          this.callRepository.updateStatus(saved.id, "missed");
        }

        const updated = this.present(
          this.callRepository.findById(saved.id),
        );
        if (current.status === "started") {
          this.userRepository.updateStatus(userId, "online");
        }
        this.notificationService.notify(
          "call:updated",
          this.getParticipantIds(current),
          updated,
        );
      }
      this.timeoutHandles.delete(saved.id);
    }, this.config.callTimeoutMs);

    this.timeoutHandles.set(saved.id, timeout);
    return presented;
  }

  accept(userId, callId) {
    const call = this.assertInvitedParticipant(userId, callId);
    this.callRepository.updateParticipantStatus(call.id, userId, "joined");

    if (call.status === "started") {
      this.callRepository.updateStatus(call.id, "in_progress");
    }
    if (!call.groupId) this.clearTimeout(call.id);

    this.userRepository.updateStatus(call.callerId, "in_call");
    this.userRepository.updateStatus(userId, "in_call");
    const updated = this.present(this.callRepository.findById(call.id));
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

  join(userId, callId) {
    const call = this.callRepository.findById(callId);
    if (
      !call ||
      !call.groupId ||
      !["started", "in_progress"].includes(call.status)
    ) {
      throw new Error("La llamada grupal ya no está disponible");
    }
    if (!this.groupRepository.isMember(call.groupId, userId)) {
      throw new Error("No perteneces a este grupo");
    }

    this.callRepository.upsertParticipantStatus(call.id, userId, "joined");
    if (call.status === "started") {
      this.callRepository.updateStatus(call.id, "in_progress");
    }
    this.userRepository.updateStatus(userId, "in_call");

    const updated = this.present(this.callRepository.findById(call.id));
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
    const call = this.assertInvitedParticipant(userId, callId);
    this.callRepository.updateParticipantStatus(call.id, userId, "rejected");

    if (!call.groupId) {
      this.clearTimeout(call.id);
      this.callRepository.updateParticipantStatus(
        call.id,
        call.callerId,
        "left",
      );
      this.callRepository.updateStatus(call.id, "rejected");
      this.userRepository.updateStatus(call.callerId, "online");
    } else if (
      call.status === "started" &&
      this.callRepository.countParticipantsByStatus(call.id, "invited") === 0
    ) {
      this.clearTimeout(call.id);
      this.callRepository.updateParticipantStatus(
        call.id,
        call.callerId,
        "left",
      );
      this.callRepository.updateStatus(call.id, "rejected");
      this.userRepository.updateStatus(call.callerId, "online");
    }

    const updated = this.present(this.callRepository.findById(call.id));
    this.notificationService.notify(
      "call:updated",
      this.getParticipantIds(call),
      updated,
    );
    return updated;
  }

  end(userId, callId) {
    const call = this.callRepository.findById(callId);
    const participant = this.callRepository.findParticipant(callId, userId);
    if (!call || participant?.status !== "joined") {
      throw new Error("No perteneces a esta llamada");
    }

    if (call.groupId) {
      this.callRepository.updateParticipantStatus(call.id, userId, "left");
      this.userRepository.updateStatus(userId, "online");

      if (
        this.callRepository.countParticipantsByStatus(call.id, "joined") === 0
      ) {
        this.clearTimeout(call.id);
        this.callRepository.updateStatus(call.id, "ended");
      }
    } else {
      this.clearTimeout(call.id);
      for (const participantId of this.getParticipantIds(call)) {
        this.callRepository.updateParticipantStatus(
          call.id,
          participantId,
          "left",
        );
        this.userRepository.updateStatus(participantId, "online");
      }
      this.callRepository.updateStatus(call.id, "ended");
    }

    const updated = this.present(this.callRepository.findById(call.id));
    this.notificationService.notify(
      "call:updated",
      this.getParticipantIds(call),
      updated,
    );
    return updated;
  }

  list(userId) {
    return this.callRepository
      .listForUser(userId)
      .map((call) => this.present(call));
  }

  getRecipientIds(callId, senderId) {
    const call = this.callRepository.findById(callId);
    if (!call || call.status !== "in_progress") return [];

    return this.callRepository
      .listParticipants(callId)
      .filter(
        (participant) =>
          participant.status === "joined" &&
          participant.id !== senderId &&
          (!call.groupId ||
            this.groupRepository.isMember(call.groupId, participant.id)),
      )
      .map((participant) => participant.id);
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

  assertInvitedParticipant(userId, callId) {
    const call = this.callRepository.findById(callId);
    if (!call || !["started", "in_progress"].includes(call.status)) {
      throw new Error("La llamada ya no está disponible");
    }
    const participant = this.callRepository.findParticipant(callId, userId);
    if (participant?.status !== "invited") {
      throw new Error("Ya respondiste o no fuiste invitado a esta llamada");
    }
    return call;
  }

  getParticipantIds(call) {
    const participants = this.callRepository.listParticipants(call.id);
    if (participants.length) {
      return participants.map((participant) => participant.id);
    }
    if (call.receiverId) return [call.callerId, call.receiverId];
    return this.groupRepository.getMemberIds(call.groupId);
  }

  present(call) {
    return presentCall(
      call,
      this.callRepository.listParticipants(call.id),
    );
  }

  clearTimeout(callId) {
    const handle = this.timeoutHandles.get(callId);
    if (handle) clearTimeout(handle);
    this.timeoutHandles.delete(callId);
  }
}

module.exports = CallService;
