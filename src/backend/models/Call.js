class Call {
  constructor({
    id = null,
    callerId,
    receiverId = null,
    groupId = null,
    status = "started",
    startedAt = null,
    endedAt = null,
    createdAt = null,
  }) {
    this.id = id;
    this.callerId = callerId;
    this.receiverId = receiverId;
    this.groupId = groupId;
    this.status = status;
    this.startedAt = startedAt;
    this.endedAt = endedAt;
    this.createdAt = createdAt;
  }
}

class AudioCall extends Call {
  constructor(data) {
    super(data);
    this.callType = "audio";
  }
}

class VideoCall extends Call {
  constructor(data) {
    super(data);
    this.callType = "video";
  }
}

module.exports = {
  Call,
  AudioCall,
  VideoCall,
};
