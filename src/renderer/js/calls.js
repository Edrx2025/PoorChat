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
    this.mediaRecorder = null;
    this.videoInterval = null;
    this.durationInterval = null;
    this.startedAt = null;
    this.remoteAudioPlayers = new Set();

    $("#accept-call-button").addEventListener("click", () => this.acceptIncoming());
    $("#reject-call-button").addEventListener("click", () => this.rejectIncoming());
    $("#end-call-button").addEventListener("click", () => this.endActive());
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
      this.showCallOverlay(call, "Llamando");
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
    $("#incoming-type").textContent =
      call.callType === "video" ? "Videollamada entrante" : "Llamada entrante";
    $("#incoming-name").textContent = call.groupName || call.callerDisplayName;
    $("#incoming-call").classList.remove("hidden");
  }

  async acceptIncoming() {
    if (!this.incomingCall) return;

    try {
      const call = await api.acceptCall(this.incomingCall.id);
      $("#incoming-call").classList.add("hidden");
      this.incomingCall = null;
      state.activeCall = call;
      await this.showCallOverlay(call, "En curso");
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

    if (call.status === "in_progress") {
      state.activeCall = call;
      await this.showCallOverlay(call, "En curso");
    } else if (["ended", "rejected", "missed"].includes(call.status)) {
      if (state.activeCall?.id === call.id) this.closeCallOverlay();
      if (this.incomingCall?.id === call.id) {
        this.incomingCall = null;
        $("#incoming-call").classList.add("hidden");
      }
    }

    this.onCallsChanged();
  }

  async showCallOverlay(call, status) {
    const overlay = $("#call-overlay");
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
    setAvatar($("#call-avatar"), otherAvatar);
    $("#audio-call-visual").classList.toggle("hidden", isVideo);
    $("#remote-frame").classList.toggle("hidden", !isVideo);
    $("#local-video").classList.toggle("hidden", !isVideo);
    $("#toggle-camera").classList.toggle("hidden", !isVideo);
    overlay.classList.remove("hidden");

    if (call.status === "in_progress") {
      await this.ensureMediaStarted(call);
    }
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
        audio: true,
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

      this.startAudioTransmission(call.id);
      if (call.callType === "video") this.startVideoTransmission(call.id);

      this.startedAt = Date.now();
      this.durationInterval = setInterval(() => {
        const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
        const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
        const remaining = String(seconds % 60).padStart(2, "0");
        $("#call-duration").textContent = `${minutes}:${remaining}`;
      }, 1000);
    } catch (error) {
      if (acquiredStream) this.stopStream(acquiredStream);
      if (sessionVersion !== this.mediaSessionVersion) return;

      showToast(
        `No se pudo acceder a cámara o micrófono: ${error.message}`,
        "error",
      );
    }
  }

  startAudioTransmission(callId) {
    if (!window.MediaRecorder || !this.stream) return;

    const audioTracks = this.stream.getAudioTracks();
    if (!audioTracks.length) return;

    const audioStream = new MediaStream(audioTracks);
    this.mediaRecorder = new MediaRecorder(audioStream);
    this.mediaRecorder.addEventListener("dataavailable", async (event) => {
      if (!event.data.size || !state.activeCall) return;
      const dataBase64 = await blobToBase64(event.data);
      api.sendMedia({ callId, mediaType: "audio", dataBase64 }).catch(() => {});
    });
    this.mediaRecorder.start(350);
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
      $("#remote-frame").src = `data:image/jpeg;base64,${media.dataBase64}`;
      $("#remote-frame").classList.remove("hidden");
      $("#audio-call-visual").classList.add("hidden");
      return;
    }

    if (media.mediaType === "audio") {
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
    button.classList.toggle("disabled", tracks.some((track) => !track.enabled));
  }

  closeCallOverlay() {
    state.activeCall = null;
    this.releaseMedia();
    $("#local-video").srcObject = null;
    $("#remote-frame").src = "";
    $("#call-duration").textContent = "00:00";
    $("#call-overlay").classList.add("hidden");
  }

  releaseMedia() {
    this.mediaSessionVersion += 1;
    this.mediaCallId = null;
    this.mediaStartPromise = null;

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    if (this.videoInterval) clearInterval(this.videoInterval);
    if (this.durationInterval) clearInterval(this.durationInterval);

    this.stopStream(this.stream);
    this.stream = null;
    this.mediaRecorder = null;
    this.videoInterval = null;
    this.durationInterval = null;
    this.startedAt = null;

    for (const audio of this.remoteAudioPlayers) {
      audio.pause();
      if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
      audio.src = "";
    }
    this.remoteAudioPlayers.clear();

    const localVideo = $("#local-video");
    if (localVideo) {
      localVideo.pause();
      localVideo.srcObject = null;
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

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
