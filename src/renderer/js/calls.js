import { state } from "./state.js";
import { api } from "./api.js";
import {
  $,
  avatarMarkup,
  escapeHtml,
  formatDate,
  renderIcons,
  setAvatar,
  showToast,
} from "./ui.js";

export class CallController {
  constructor({ onCallsChanged }) {
    this.onCallsChanged = onCallsChanged;
    this.incomingCall = null;
    this.stream = null;
    this.mediaCallId = null;
    this.mediaStartPromise = null;
    this.mediaSessionVersion = 0;
    this.audioContext = null;
    this.audioSourceNode = null;
    this.audioProcessorNode = null;
    this.audioSilenceGain = null;
    this.remoteAudioStates = new Map();
    this.remoteVideoTiles = new Map();
    this.videoInterval = null;
    this.durationInterval = null;
    this.startedAt = null;
    this.remoteAudioPlayers = new Set();
    this.overlayOpen = false;

    $("#accept-call-button").addEventListener("click", () => this.acceptIncoming());
    $("#reject-call-button").addEventListener("click", () => this.rejectIncoming());
    $("#end-call-button").addEventListener("click", () => this.endActive());
    $("#quick-end-call").addEventListener("click", () => this.endActive());
    $("#open-active-call").addEventListener("click", () =>
      this.openCallOverlay(),
    );
    $("#minimize-call-button").addEventListener("click", () =>
      this.minimizeCallOverlay(),
    );
    $("#toggle-microphone").addEventListener("click", () => this.toggleTrack("audio"));
    $("#toggle-camera").addEventListener("click", () => this.toggleTrack("video"));

    window.chad.media.onReceived((media) => this.handleMedia(media));
    window.addEventListener("beforeunload", () => this.releaseMedia());
    window.addEventListener("pagehide", () => this.releaseMedia());
  }

  async startFromContext(callType) {
    if (!state.activeContext) return;

    try {
      const payload =
        state.activeContext.type === "private"
          ? {
              callType,
              receiverId: state.activeContext.source.peer.id,
            }
          : {
              callType,
              groupId: state.activeContext.id,
            };

      const call = await api.startCall(payload);
      state.activeCall = call;
      this.updateCallUI(call, "Llamando");
      this.showCallIndicator();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  showIncoming(call) {
    this.incomingCall = call;
    const caller = {
      displayName: call.callerDisplayName,
      username: call.callerUsername,
      avatarData: call.callerAvatarData,
    };
    setAvatar($("#incoming-avatar"), caller);
    const inProgress = call.status === "in_progress";
    $("#incoming-type").textContent = call.groupId
      ? `${call.callType === "video" ? "Videollamada" : "Llamada"} grupal ${
          inProgress ? "en curso" : "entrante"
        }`
      : call.callType === "video"
        ? "Videollamada entrante"
        : "Llamada entrante";
    $("#incoming-name").textContent = call.groupName || call.callerDisplayName;
    $("#incoming-accept-label").textContent = call.groupId
      ? "Unirse"
      : "Aceptar";
    $("#incoming-call").classList.remove("hidden");
  }

  async acceptIncoming() {
    if (!this.incomingCall) return;

    try {
      const call = await api.acceptCall(this.incomingCall.id);
      $("#incoming-call").classList.add("hidden");
      this.incomingCall = null;
      state.activeCall = call;
      this.updateCallUI(call, "En curso");
      this.showCallIndicator();
      await this.ensureMediaStarted(call);
      this.onCallsChanged();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async rejectIncoming() {
    if (!this.incomingCall) return;

    try {
      await api.rejectCall(this.incomingCall.id);
      $("#incoming-call").classList.add("hidden");
      this.incomingCall = null;
      this.onCallsChanged();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async handleCallUpdate(call) {
    const isParticipant =
      call.callerId === state.currentUser.id ||
      call.receiverId === state.currentUser.id ||
      Boolean(call.groupId);
    if (!isParticipant) return;

    state.calls = [
      call,
      ...state.calls.filter((existing) => existing.id !== call.id),
    ];

    const participant = call.participants?.find(
      (item) => item.id === state.currentUser.id,
    );
    const joined = participant?.status === "joined";
    const activeStatus = ["started", "in_progress"].includes(call.status);

    if (joined && call.status === "in_progress") {
      state.activeCall = call;
      this.updateCallUI(call, "En curso");
      this.showCallIndicator();
      if (this.incomingCall?.id === call.id) {
        this.incomingCall = null;
        $("#incoming-call").classList.add("hidden");
      }
      await this.ensureMediaStarted(call);
    } else if (
      joined &&
      call.status === "started" &&
      call.callerId === state.currentUser.id
    ) {
      state.activeCall = call;
      this.updateCallUI(call, "Llamando");
      this.showCallIndicator();
    } else if (!joined && activeStatus) {
      if (state.activeCall?.id === call.id) this.closeCallOverlay();
      if (participant?.status === "invited") {
        this.showIncoming(call);
      } else if (this.incomingCall?.id === call.id) {
        this.incomingCall = null;
        $("#incoming-call").classList.add("hidden");
      }
    } else if (["ended", "rejected", "missed"].includes(call.status)) {
      if (state.activeCall?.id === call.id) this.closeCallOverlay();
      if (this.incomingCall?.id === call.id) {
        this.incomingCall = null;
        $("#incoming-call").classList.add("hidden");
      }
    }

    this.onCallsChanged();
  }

  updateCallUI(call, status) {
    const isVideo = call.callType === "video";
    const otherName =
      call.groupName ||
      (call.callerId === state.currentUser.id
        ? call.receiverDisplayName
        : call.callerDisplayName);
    const otherAvatar = {
      displayName: otherName,
      avatarData:
        call.callerId === state.currentUser.id
          ? call.receiverAvatarData
          : call.callerAvatarData,
    };

    $("#call-status").textContent = status;
    $("#call-name").textContent = otherName || "Llamada de grupo";
    $("#active-call-name").textContent = otherName || "Llamada de grupo";
    $("#active-call-status").textContent = status;
    $("#active-call-icon").innerHTML =
      `<i data-lucide="${isVideo ? "video" : "phone"}"></i>`;
    setAvatar($("#call-avatar"), otherAvatar);
    setAvatar($("#local-call-avatar"), state.currentUser);
    $("#audio-call-visual").classList.toggle("hidden", isVideo);
    $("#video-call-grid").classList.toggle("hidden", !isVideo);
    $("#toggle-camera").classList.toggle("hidden", !isVideo);
    this.renderCallParticipants(call);
    if (isVideo) this.syncVideoParticipants(call);
    renderIcons();
  }

  showCallIndicator() {
    $("#active-call-indicator").classList.remove("hidden");
  }

  openCallOverlay() {
    if (!state.activeCall) return;
    this.overlayOpen = true;
    this.updateCallUI(
      state.activeCall,
      state.activeCall.status === "in_progress" ? "En curso" : "Llamando",
    );
    $("#call-overlay").classList.remove("hidden");
  }

  minimizeCallOverlay() {
    this.overlayOpen = false;
    $("#call-overlay").classList.add("hidden");
  }

  async ensureMediaStarted(call) {
    if (this.stream && this.mediaCallId === call.id) return;

    if (this.mediaStartPromise && this.mediaCallId === call.id) {
      await this.mediaStartPromise;
      return;
    }

    if (this.mediaCallId && this.mediaCallId !== call.id) {
      this.releaseMedia();
    }

    const sessionVersion = ++this.mediaSessionVersion;
    this.mediaCallId = call.id;

    this.mediaStartPromise = this.startMedia(call, sessionVersion).finally(() => {
      if (sessionVersion === this.mediaSessionVersion) {
        this.mediaStartPromise = null;
      }
    });

    await this.mediaStartPromise;
  }

  async startMedia(call, sessionVersion) {
    let acquiredStream = null;

    try {
      acquiredStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: call.callType === "video",
      });

      const callStillActive =
        sessionVersion === this.mediaSessionVersion &&
        state.activeCall?.id === call.id &&
        state.activeCall?.status === "in_progress";

      if (!callStillActive) {
        this.stopStream(acquiredStream);
        return;
      }

      this.stream = acquiredStream;
      $("#local-video").srcObject = acquiredStream;
      if (call.callType === "video") {
        $("#local-video").classList.remove("hidden");
        $("#local-video-placeholder").classList.add("hidden");
      }

      await this.startAudioTransmission(call.id);
      if (call.callType === "video") this.startVideoTransmission(call.id);

      this.startedAt = Date.now();
      this.durationInterval = setInterval(() => {
        const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
        const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
        const remaining = String(seconds % 60).padStart(2, "0");
        $("#call-duration").textContent = `${minutes}:${remaining}`;
        $("#active-call-duration").textContent = `${minutes}:${remaining}`;
      }, 1000);
    } catch (error) {
      if (sessionVersion !== this.mediaSessionVersion) return;
      if (acquiredStream) this.stopStream(acquiredStream);
      this.releaseMedia();

      showToast(
        `No se pudo acceder a cámara o micrófono: ${error.message}`,
        "error",
      );
    }
  }

  async startAudioTransmission(callId) {
    if (!this.stream) return;
    const audioTracks = this.stream.getAudioTracks();
    if (!audioTracks.length) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio no está disponible");
    }

    const audioStream = new MediaStream(audioTracks);
    this.audioContext = new AudioContextClass({ latencyHint: "interactive" });
    await this.audioContext.resume();
    this.audioSourceNode =
      this.audioContext.createMediaStreamSource(audioStream);
    this.audioProcessorNode = this.audioContext.createScriptProcessor(2048, 1, 1);
    this.audioSilenceGain = this.audioContext.createGain();
    this.audioSilenceGain.gain.value = 0;

    this.audioProcessorNode.onaudioprocess = (event) => {
      if (!state.activeCall || state.activeCall.id !== callId) return;
      const input = event.inputBuffer.getChannelData(0);
      const samples = downsampleAudio(
        input,
        this.audioContext.sampleRate,
        16000,
      );
      api.sendMedia({
        callId,
        mediaType: "audio",
        encoding: "pcm_s16le",
        sampleRate: 16000,
        channels: 1,
        dataBase64: int16ToBase64(samples),
      }).catch(() => {});
    };

    this.audioSourceNode.connect(this.audioProcessorNode);
    this.audioProcessorNode.connect(this.audioSilenceGain);
    this.audioSilenceGain.connect(this.audioContext.destination);
  }

  startVideoTransmission(callId) {
    const video = $("#local-video");
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const context = canvas.getContext("2d");

    this.videoInterval = setInterval(() => {
      if (!state.activeCall || video.readyState < 2) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataBase64 = canvas
        .toDataURL("image/jpeg", 0.45)
        .split(",")[1];
      api.sendMedia({ callId, mediaType: "video", dataBase64 }).catch(() => {});
    }, 300);
  }

  handleMedia(media) {
    if (!state.activeCall || Number(media.callId) !== state.activeCall.id) return;

    if (media.mediaType === "video") {
      const frame = this.getRemoteVideoFrame(Number(media.senderId));
      frame.src = `data:image/jpeg;base64,${media.dataBase64}`;
      $("#audio-call-visual").classList.add("hidden");
      $("#video-call-grid").classList.remove("hidden");
      return;
    }

    if (media.mediaType === "audio") {
      if (media.encoding === "pcm_s16le") {
        this.playPcmAudio(media);
        return;
      }

      const bytes = Uint8Array.from(atob(media.dataBase64), (char) =>
        char.charCodeAt(0),
      );
      const blob = new Blob([bytes], { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.remoteAudioPlayers.add(audio);
      audio.play().catch(() => {});
      audio.onended = () => {
        this.remoteAudioPlayers.delete(audio);
        URL.revokeObjectURL(url);
      };
    }
  }

  playPcmAudio(media) {
    if (!this.audioContext) return;

    const senderId = Number(media.senderId) || 0;
    const audioState = this.remoteAudioStates.get(senderId) || {
      lastSequence: 0,
      nextTime: 0,
    };
    if (Number(media.sequence) <= audioState.lastSequence) return;

    audioState.lastSequence = Number(media.sequence);
    this.audioContext.resume().catch(() => {});

    const bytes = base64ToBytes(media.dataBase64);
    const samples = new Int16Array(bytes.buffer);
    const sampleRate = Number(media.sampleRate) || 16000;
    const buffer = this.audioContext.createBuffer(1, samples.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 32768;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    const now = this.audioContext.currentTime;
    if (
      audioState.nextTime < now ||
      audioState.nextTime > now + 0.45
    ) {
      audioState.nextTime = now + 0.06;
    }
    source.start(audioState.nextTime);
    audioState.nextTime += buffer.duration;
    this.remoteAudioStates.set(senderId, audioState);
  }

  getRemoteVideoFrame(senderId) {
    const existing = this.remoteVideoTiles.get(senderId);
    if (existing) {
      existing.frame.classList.remove("hidden");
      existing.placeholder.classList.add("hidden");
      return existing.frame;
    }

    const participant = this.findParticipant(senderId);
    const tile = document.createElement("article");
    tile.className = "video-tile remote";
    tile.dataset.senderId = String(senderId);
    tile.innerHTML = `
      <img
        class="participant-video hidden"
        alt="Cámara de ${escapeHtml(participant.displayName)}"
      />
      <div class="participant-video-placeholder">
        ${avatarMarkup(participant, "avatar avatar-xl")}
      </div>
      <span class="video-participant-name">
        ${escapeHtml(participant.displayName)}
      </span>
    `;
    const frame = tile.querySelector("img");
    const placeholder = tile.querySelector(".participant-video-placeholder");
    $("#video-call-grid").appendChild(tile);
    this.remoteVideoTiles.set(senderId, { tile, frame, placeholder });
    frame.classList.remove("hidden");
    placeholder.classList.add("hidden");
    this.updateVideoGridLayout();
    return frame;
  }

  ensureRemoteVideoTile(participant) {
    if (this.remoteVideoTiles.has(participant.id)) return;

    const tile = document.createElement("article");
    tile.className = "video-tile remote";
    tile.dataset.senderId = String(participant.id);
    tile.innerHTML = `
      <img
        class="participant-video hidden"
        alt="Cámara de ${escapeHtml(participant.displayName)}"
      />
      <div class="participant-video-placeholder">
        ${avatarMarkup(participant, "avatar avatar-xl")}
      </div>
      <span class="video-participant-name">
        ${escapeHtml(participant.displayName)}
      </span>
    `;
    $("#video-call-grid").appendChild(tile);
    this.remoteVideoTiles.set(participant.id, {
      tile,
      frame: tile.querySelector("img"),
      placeholder: tile.querySelector(".participant-video-placeholder"),
    });
  }

  syncVideoParticipants(call) {
    const joined = (call.participants || []).filter(
      (participant) =>
        participant.status === "joined" &&
        participant.id !== state.currentUser.id,
    );
    const joinedIds = new Set(joined.map((participant) => participant.id));

    for (const participant of joined) {
      this.ensureRemoteVideoTile(participant);
    }
    for (const [userId, entry] of this.remoteVideoTiles) {
      if (!joinedIds.has(userId)) {
        entry.tile.remove();
        this.remoteVideoTiles.delete(userId);
      }
    }
    this.updateVideoGridLayout();
  }

  renderCallParticipants(call) {
    const joined = (call.participants || []).filter(
      (participant) => participant.status === "joined",
    );
    const container = $("#call-participants");
    container.innerHTML = joined
      .map(
        (participant) => `
          <div class="call-participant">
            ${avatarMarkup(participant, "avatar avatar-sm")}
            <span>${escapeHtml(
              participant.id === state.currentUser.id
                ? "Tú"
                : participant.displayName,
            )}</span>
          </div>
        `,
      )
      .join("");
    container.classList.toggle("hidden", !joined.length);
  }

  findParticipant(senderId) {
    if (state.currentUser?.id === senderId) return state.currentUser;

    if (state.activeCall?.groupId) {
      const activeParticipant = state.activeCall.participants?.find(
        (participant) => participant.id === senderId,
      );
      if (activeParticipant) return activeParticipant;
      const group = state.groups.find(
        (item) => item.id === state.activeCall.groupId,
      );
      const member = group?.members?.find((item) => item.id === senderId);
      if (member) return member;
    }

    return (
      state.users.find((user) => user.id === senderId) || {
        id: senderId,
        displayName: `Usuario ${senderId}`,
      }
    );
  }

  updateVideoGridLayout() {
    const grid = $("#video-call-grid");
    if (!grid) return;

    const participantCount = 1 + this.remoteVideoTiles.size;
    const columns =
      participantCount <= 1 ? 1 : participantCount <= 4 ? 2 : 3;
    grid.style.setProperty("--video-columns", String(columns));
    grid.dataset.participantCount = String(participantCount);
  }

  clearRemoteVideoTiles() {
    for (const { tile } of this.remoteVideoTiles.values()) {
      tile.remove();
    }
    this.remoteVideoTiles.clear();
    this.updateVideoGridLayout();
  }

  async endActive() {
    if (!state.activeCall) return;
    try {
      await api.endCall(state.activeCall.id);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      this.closeCallOverlay();
    }
  }

  toggleTrack(kind) {
    if (!this.stream) return;
    const tracks =
      kind === "audio"
        ? this.stream.getAudioTracks()
        : this.stream.getVideoTracks();
    const button =
      kind === "audio" ? $("#toggle-microphone") : $("#toggle-camera");

    for (const track of tracks) track.enabled = !track.enabled;
    const disabled = tracks.some((track) => !track.enabled);
    button.classList.toggle("disabled", disabled);
    if (kind === "video") {
      $("#local-video").classList.toggle("hidden", disabled);
      $("#local-video-placeholder").classList.toggle("hidden", !disabled);
    }
  }

  closeCallOverlay() {
    state.activeCall = null;
    this.releaseMedia();
    $("#local-video").srcObject = null;
    $("#call-duration").textContent = "00:00";
    $("#active-call-duration").textContent = "00:00";
    $("#active-call-indicator").classList.add("hidden");
    $("#call-overlay").classList.add("hidden");
    this.overlayOpen = false;
  }

  releaseMedia() {
    this.mediaSessionVersion += 1;
    this.mediaCallId = null;
    this.mediaStartPromise = null;

    if (this.videoInterval) clearInterval(this.videoInterval);
    if (this.durationInterval) clearInterval(this.durationInterval);

    if (this.audioProcessorNode) {
      this.audioProcessorNode.onaudioprocess = null;
      this.audioProcessorNode.disconnect();
    }
    this.audioSourceNode?.disconnect();
    this.audioSilenceGain?.disconnect();
    this.audioContext?.close().catch(() => {});

    this.stopStream(this.stream);
    this.stream = null;
    this.audioContext = null;
    this.audioSourceNode = null;
    this.audioProcessorNode = null;
    this.audioSilenceGain = null;
    this.remoteAudioStates.clear();
    this.videoInterval = null;
    this.durationInterval = null;
    this.startedAt = null;

    for (const audio of this.remoteAudioPlayers) {
      audio.pause();
      if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
      audio.src = "";
    }
    this.remoteAudioPlayers.clear();
    this.clearRemoteVideoTiles();

    const localVideo = $("#local-video");
    if (localVideo) {
      localVideo.pause();
      localVideo.srcObject = null;
      localVideo.classList.add("hidden");
      $("#local-video-placeholder")?.classList.remove("hidden");
    }
  }

  stopStream(stream) {
    if (!stream) return;

    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}

export function renderCallsView() {
  const container = $("#calls-view");
  container.innerHTML = `
    <header class="section-heading">
      <div>
        <span class="eyebrow">Actividad reciente</span>
        <h2>Llamadas</h2>
      </div>
    </header>
    <div class="call-history">
      ${
        state.calls.length
          ? state.calls.map(callHistoryMarkup).join("")
          : '<div class="list-empty">Aún no hay llamadas registradas.</div>'
      }
    </div>
  `;
  renderIcons();
}

function callHistoryMarkup(call) {
  const outgoing = call.callerId === state.currentUser.id;
  const name =
    call.groupName ||
    (outgoing ? call.receiverDisplayName : call.callerDisplayName) ||
    "Llamada";
  const icon = call.callType === "video" ? "video" : "phone";

  return `
    <article class="call-history-item">
      <span class="avatar avatar-md">${escapeHtml(name.slice(0, 2))}</span>
      <div class="call-history-copy">
        <strong>${escapeHtml(name)}</strong>
        <span>
          <i data-lucide="${outgoing ? "arrow-up-right" : "arrow-down-left"}"></i>
          ${call.callType === "video" ? "Videollamada" : "Llamada de audio"} ·
          ${formatDate(call.createdAt, true)}
        </span>
      </div>
      <span class="call-status">${escapeHtml(call.status)}</span>
    </article>
  `;
}

function downsampleAudio(input, inputRate, outputRate) {
  if (inputRate === outputRate) {
    return floatToInt16(input);
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Int16Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(Math.floor((outputIndex + 1) * ratio), input.length);
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += input[inputIndex];
    }
    const sample = sum / Math.max(1, end - start);
    output[outputIndex] = Math.max(-32768, Math.min(32767, sample * 32767));
  }

  return output;
}

function floatToInt16(input) {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    output[index] = Math.max(
      -32768,
      Math.min(32767, input[index] * 32767),
    );
  }
  return output;
}

function int16ToBase64(samples) {
  const bytes = new Uint8Array(samples.buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(dataBase64) {
  return Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0));
}
