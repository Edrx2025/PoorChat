import { state } from "./state.js";
import { api } from "./api.js";
import {
  $,
  avatarMarkup,
  escapeHtml,
  formatBytes,
  formatDate,
  openModal,
  renderIcons,
  setAvatar,
  showToast,
} from "./ui.js";

let voiceRecorder = null;
let voiceStream = null;
let voiceChunks = [];
let voiceTimer = null;
let voiceStartedAt = null;
let voiceContext = null;

export function renderConversationList(view, search, onSelect) {
  const listContent = $("#list-content");
  const normalizedSearch = search.trim().toLowerCase();
  let items;

  if (view === "groups") {
    items = state.groups
      .filter((group) =>
        group.name.toLowerCase().includes(normalizedSearch),
      )
      .map((group) => ({
        contextType: "group",
        contextId: group.id,
        title: group.name,
        subtitle:
          group.lastMessage ||
          `${group.members?.length || 0} integrantes`,
        lastMessageAt: group.lastMessageAt,
        avatar: {
          displayName: group.name,
          avatarData: group.avatar,
        },
        source: group,
      }));
  } else {
    items = state.privateChats
      .filter((chat) => {
        const text = `${chat.peer.displayName} ${chat.peer.username}`.toLowerCase();
        return text.includes(normalizedSearch);
      })
      .map((chat) => ({
        contextType: "private",
        contextId: chat.id,
        title: chat.peer.displayName,
        subtitle: chat.lastMessage || `@${chat.peer.username}`,
        lastMessageAt: chat.lastMessageAt,
        avatar: chat.peer,
        source: chat,
      }));
  }

  if (!items.length) {
    listContent.innerHTML = `<div class="list-empty">${
      normalizedSearch
        ? "No hay resultados."
        : view === "groups"
          ? "Crea tu primer grupo."
          : "Inicia una conversación."
    }</div>`;
    return;
  }

  listContent.innerHTML = `
    <div class="conversation-list">
      ${items
        .map(
          (item) => `
            <button
              class="conversation-item ${
                state.activeContext?.type === item.contextType &&
                state.activeContext?.id === item.contextId
                  ? "active"
                  : ""
              }"
              data-context-type="${item.contextType}"
              data-context-id="${item.contextId}"
            >
              ${avatarMarkup(item.avatar, "avatar avatar-md")}
              <span class="conversation-item-copy">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.subtitle)}</span>
              </span>
              <time>${formatDate(item.lastMessageAt)}</time>
            </button>
          `,
        )
        .join("")}
    </div>
  `;

  listContent.querySelectorAll(".conversation-item").forEach((button) => {
    button.addEventListener("click", () => {
      const item = items.find(
        (candidate) =>
          candidate.contextType === button.dataset.contextType &&
          candidate.contextId === Number(button.dataset.contextId),
      );
      onSelect(item);
    });
  });
}

export async function openConversation(item) {
  cancelReply();
  const messageInput = $("#message-input");
  messageInput.style.height = "40px";
  state.activeContext = {
    type: item.contextType,
    id: item.contextId,
    title: item.title,
    avatar: item.avatar,
    source: item.source,
  };
  state.messages = [];
  state.loadingOlderMessages = false;
  state.hasMoreMessages = false;

  $("#empty-state").classList.add("hidden");
  $("#calls-view").classList.add("hidden");
  $("#settings-view").classList.add("hidden");
  $("#conversation-view").classList.remove("hidden");
  $("#conversation-title").textContent = item.title;
  setAvatar($("#conversation-avatar"), item.avatar);

  if (item.contextType === "private") {
    const peer = item.source.peer;
    $("#conversation-subtitle").textContent =
      peer.status === "online"
        ? `@${peer.username} · en línea`
        : `@${peer.username} · ${peer.status || "desconectado"}`;
  } else {
    $("#conversation-subtitle").textContent =
      `${item.source.members?.length || 0} integrantes`;
  }

  const contextSnapshot = `${item.contextType}:${item.contextId}`;
  try {
    const cachedMessages = await api.getCachedMessages(
      item.contextType,
      item.contextId,
    );
    if (!isActiveContext(contextSnapshot)) return;
    state.messages = cachedMessages;
  } catch {
    if (!isActiveContext(contextSnapshot)) return;
    state.messages = [];
  }
  renderMessages();
  renderGroupCallBanner();
  renderDetails();

  try {
    const synchronized = await api.syncMessages(
      item.contextType,
      item.contextId,
    );
    if (!isActiveContext(contextSnapshot)) return;
    state.messages = synchronized;
    state.hasMoreMessages = synchronized.length >= 100;
    renderMessages();
  } catch (error) {
    if (!isActiveContext(contextSnapshot)) return;
    state.hasMoreMessages = state.messages.length >= 100;
    if (state.messages.length) {
      showToast("Mostrando mensajes guardados localmente");
    } else {
      showToast(error.message, "error");
    }
  }
}

export function renderGroupCallBanner() {
  const banner = $("#group-call-banner");
  if (!banner) return;

  const isGroup = state.activeContext?.type === "group";
  const call = isGroup
    ? state.calls.find(
        (item) =>
          item.groupId === state.activeContext.id &&
          ["started", "in_progress"].includes(item.status),
      )
    : null;

  $("#audio-call-button").disabled = Boolean(call);
  $("#video-call-button").disabled = Boolean(call);
  if (!call) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }

  const currentParticipant = call.participants?.find(
    (participant) => participant.id === state.currentUser.id,
  );
  const joined = (call.participants || []).filter(
    (participant) => participant.status === "joined",
  );
  const hasJoined = currentParticipant?.status === "joined";

  banner.innerHTML = `
    <span class="group-call-banner-icon">
      <i data-lucide="${call.callType === "video" ? "video" : "phone"}"></i>
    </span>
    <div class="group-call-banner-copy">
      <strong>${call.callType === "video" ? "Videollamada" : "Llamada"} en curso</strong>
      <span>${joined.length} ${joined.length === 1 ? "participante" : "participantes"}</span>
    </div>
    <div class="group-call-avatars">
      ${joined
        .slice(0, 6)
        .map((participant) =>
          avatarMarkup(participant, "avatar avatar-call-member"),
        )
        .join("")}
    </div>
    <button id="group-call-action" class="group-call-action" type="button">
      <i data-lucide="${hasJoined ? "maximize-2" : "phone-call"}"></i>
      ${hasJoined ? "Abrir" : "Unirse"}
    </button>
  `;
  banner.classList.remove("hidden");
  banner
    .querySelector("#group-call-action")
    .addEventListener("click", () => {
      window.dispatchEvent(
        new CustomEvent("chad:group-call-action", {
          detail: { callId: call.id, joined: hasJoined },
        }),
      );
    });
  renderIcons();
}

export function renderMessages({ scrollToBottom = true } = {}) {
  const container = $("#messages-container");
  renderPinnedMessages();

  if (!state.messages.length) {
    container.innerHTML =
      '<div class="list-empty">Aún no hay mensajes. Empieza la conversación.</div>';
    return;
  }

  container.innerHTML = state.messages.map(messageMarkup).join("");
  if (scrollToBottom) container.scrollTop = container.scrollHeight;
  renderIcons();

  container.querySelectorAll("[data-download-file]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await api.downloadFile(
          Number(button.dataset.downloadFile),
        );
        if (!result.canceled) showToast("Archivo guardado correctamente");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  container.querySelectorAll("[data-message-action]").forEach((button) => {
    button.addEventListener("click", () => {
      handleMessageAction(
        button.dataset.messageAction,
        Number(button.dataset.messageId),
      );
    });
  });

  container.querySelectorAll("[data-reply-target]").forEach((button) => {
    button.addEventListener("click", () =>
      scrollToMessage(Number(button.dataset.replyTarget)),
    );
  });

  container.querySelectorAll("[data-load-preview]").forEach((button) => {
    button.addEventListener("click", () =>
      loadFilePreview(Number(button.dataset.loadPreview), button),
    );
  });
}

export async function loadOlderMessages() {
  if (
    !state.activeContext ||
    !state.messages.length ||
    state.loadingOlderMessages ||
    !state.hasMoreMessages
  ) {
    return;
  }

  const contextSnapshot =
    `${state.activeContext.type}:${state.activeContext.id}`;
  const oldestMessageId = state.messages[0].id;
  const container = $("#messages-container");
  const previousHeight = container.scrollHeight;
  const previousTop = container.scrollTop;
  state.loadingOlderMessages = true;

  try {
    const older = await api.loadOlderMessages(
      state.activeContext.type,
      state.activeContext.id,
      oldestMessageId,
    );
    if (!isActiveContext(contextSnapshot)) return;

    const knownIds = new Set(state.messages.map((message) => message.id));
    const newMessages = older.filter((message) => !knownIds.has(message.id));
    state.hasMoreMessages = older.length >= 100;
    if (!newMessages.length) {
      state.hasMoreMessages = false;
      return;
    }

    state.messages = [...newMessages, ...state.messages].sort(
      (first, second) => first.id - second.id,
    );
    renderMessages({ scrollToBottom: false });
    container.scrollTop =
      container.scrollHeight - previousHeight + previousTop;
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.loadingOlderMessages = false;
  }
}

export function appendMessage(message) {
  const sameContext =
    (state.activeContext?.type === "private" &&
      message.chatId === state.activeContext.id) ||
    (state.activeContext?.type === "group" &&
      message.groupId === state.activeContext.id);

  if (!sameContext) return false;

  if (!state.messages.some((item) => item.id === message.id)) {
    state.messages.push(message);
    renderMessages();
  }

  return true;
}

export function updateMessage(message) {
  const index = state.messages.findIndex((item) => item.id === message.id);
  if (index === -1) return false;

  state.messages[index] = message;
  if (state.replyingTo?.id === message.id && message.deleted) cancelReply();
  renderMessages();
  return true;
}

export async function sendCurrentMessage() {
  if (!state.activeContext) return;

  const input = $("#message-input");
  const content = input.value.trim();
  if (!content) return;
  const replyTo = state.replyingTo;

  input.value = "";
  input.style.height = "auto";
  cancelReply();

  try {
    const message = await api.sendMessage(
      state.activeContext.type,
      state.activeContext.id,
      content,
      replyTo?.id || null,
    );
    appendMessage(message);
  } catch (error) {
    input.value = content;
    if (replyTo) startReply(replyTo.id);
    showToast(error.message, "error");
  }
}

export async function uploadCurrentFile() {
  if (!state.activeContext) return;
  const replyTo = state.replyingTo;
  cancelReply();

  try {
    const result = await api.uploadFile(
      state.activeContext.type,
      state.activeContext.id,
      replyTo?.id || null,
    );
    if (result?.message) appendMessage(result.message);
  } catch (error) {
    if (replyTo) startReply(replyTo.id);
    showToast(error.message, "error");
  }
}

export async function toggleVoiceRecording() {
  if (voiceRecorder?.state === "recording") {
    voiceRecorder.stop();
    return;
  }
  if (!state.activeContext) return;

  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const mimeType = selectRecordingMimeType();
    voiceChunks = [];
    voiceContext = {
      type: state.activeContext.type,
      id: state.activeContext.id,
      replyToId: state.replyingTo?.id || null,
    };
    cancelReply();
    voiceRecorder = mimeType
      ? new MediaRecorder(voiceStream, { mimeType })
      : new MediaRecorder(voiceStream);
    voiceRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) voiceChunks.push(event.data);
    });
    voiceRecorder.addEventListener("stop", sendRecordedVoice);
    voiceRecorder.start(250);
    voiceStartedAt = Date.now();
    updateRecordingUI(true);
    voiceTimer = setInterval(updateVoiceTimer, 250);
  } catch (error) {
    releaseVoiceRecorder();
    showToast(`No se pudo grabar audio: ${error.message}`, "error");
  }
}

export function cancelReply() {
  state.replyingTo = null;
  const context = $("#composer-context");
  if (context) context.classList.add("hidden");
}

export function cancelVoiceRecording() {
  if (voiceRecorder?.state === "recording") {
    voiceRecorder.ondataavailable = null;
    voiceRecorder.onstop = null;
    voiceRecorder.stop();
  }
  releaseVoiceRecorder();
}

export function renderDetails() {
  if (!state.activeContext) return;

  const content = $("#details-content");
  const isGroup = state.activeContext.type === "group";
  const source = state.activeContext.source;
  const members = isGroup ? source.members || [] : [];
  const currentMembership = isGroup
    ? members.find((member) => member.id === state.currentUser.id)
    : null;
  const currentRole = currentMembership?.role || "member";
  const canModerate = ["owner", "admin"].includes(currentRole);
  const profile = isGroup
    ? { displayName: source.name, avatarData: source.avatar }
    : source.peer;

  content.innerHTML = `
    <div class="details-profile">
      ${avatarMarkup(profile, "avatar avatar-xl")}
      <h3>${escapeHtml(state.activeContext.title)}</h3>
      <p>${
        isGroup
          ? escapeHtml(source.description || "Grupo de Chad")
          : `@${escapeHtml(source.peer.username)}`
      }</p>
      ${
        isGroup &&
        canModerate
          ? `
            <button id="edit-group-button" class="secondary-button" type="button">
              <i data-lucide="settings-2"></i>
              Editar grupo
            </button>
          `
          : ""
      }
      ${
        isGroup
          ? `
            <div class="member-list">
              ${members
                .map(
                  (member) => `
                    <div class="member-row">
                      ${avatarMarkup(member, "avatar avatar-sm")}
                      <div class="member-row-copy">
                        <strong>${escapeHtml(member.displayName)}</strong>
                        <span>
                          @${escapeHtml(member.username)}
                          <span class="role-badge role-${escapeHtml(member.role || "member")}">
                            ${escapeHtml(roleLabel(member.role))}
                          </span>
                        </span>
                      </div>
                      <div class="member-row-actions">
                        ${
                          canModerate && member.role === "member"
                            ? `
                              <button
                                class="member-action"
                                type="button"
                                data-promote-member="${member.id}"
                                title="Hacer admin"
                              >
                                <i data-lucide="shield-plus"></i>
                              </button>
                            `
                            : ""
                        }
                        ${
                          canModerate &&
                          member.id !== state.currentUser.id &&
                          member.role !== "owner"
                            ? `
                              <button
                                class="member-action danger"
                                type="button"
                                data-remove-member="${member.id}"
                                title="Expulsar del grupo"
                              >
                                <i data-lucide="user-minus"></i>
                              </button>
                            `
                            : ""
                        }
                      </div>
                    </div>
                  `,
                )
                .join("")}
            </div>
            <div class="conversation-management">
              ${
                canModerate
                  ? `
                    <button id="clear-group-button" class="secondary-button" type="button">
                      <i data-lucide="eraser"></i>
                      Vaciar chat
                    </button>
                  `
                  : ""
              }
              <button id="leave-group-button" class="danger-button" type="button">
                <i data-lucide="log-out"></i>
                Salir del grupo
              </button>
            </div>
          `
          : ""
      }
      ${
        !isGroup
          ? `
            <div class="conversation-management">
              <button
                id="clear-chat-button"
                class="secondary-button"
                type="button"
              >
                <i data-lucide="eraser"></i>
                Vaciar chat
              </button>
              <button
                id="remove-chat-button"
                class="danger-button"
                type="button"
              >
                <i data-lucide="message-square-x"></i>
                Eliminar chat
              </button>
            </div>
          `
          : ""
      }
    </div>
  `;

  content.querySelector("#edit-group-button")?.addEventListener("click", () => {
    window.dispatchEvent(
      new CustomEvent("chad:edit-group", { detail: source }),
    );
  });
  content.querySelector("#clear-chat-button")?.addEventListener("click", () => {
    openChatActionConfirmation("clear");
  });
  content.querySelector("#remove-chat-button")?.addEventListener("click", () => {
    openChatActionConfirmation("remove");
  });
  content.querySelectorAll("[data-promote-member]").forEach((button) => {
    button.addEventListener("click", () =>
      confirmGroupMemberAction("promote", Number(button.dataset.promoteMember)),
    );
  });
  content.querySelectorAll("[data-remove-member]").forEach((button) => {
    button.addEventListener("click", () =>
      confirmGroupMemberAction("remove", Number(button.dataset.removeMember)),
    );
  });
  content.querySelector("#clear-group-button")?.addEventListener("click", () =>
    confirmGroupAction("clear"),
  );
  content.querySelector("#leave-group-button")?.addEventListener("click", () =>
    confirmGroupAction("leave"),
  );
  renderIcons();
}

function roleLabel(role) {
  return {
    owner: "Dueño",
    admin: "Admin",
    member: "Miembro",
  }[role] || "Miembro";
}

function confirmGroupMemberAction(action, targetUserId) {
  const member = state.activeContext?.source?.members?.find(
    (item) => item.id === targetUserId,
  );
  if (!member) return;

  const promoting = action === "promote";
  const { modal, close } = openModal(`
    <header class="modal-header">
      <h2>${promoting ? "Nombrar admin" : "Expulsar integrante"}</h2>
      <button class="icon-button modal-close" title="Cerrar">
        <i data-lucide="x"></i>
      </button>
    </header>
    <p class="confirmation-copy">
      ${
        promoting
          ? `${escapeHtml(member.displayName)} podrá gestionar integrantes y mensajes del grupo.`
          : `${escapeHtml(member.displayName)} dejará de tener acceso a este grupo.`
      }
    </p>
    <div class="modal-actions">
      <button class="secondary-button modal-close" type="button">Cancelar</button>
      <button id="confirm-group-member-action" class="${promoting ? "primary-button" : "danger-button"}" type="button">
        ${promoting ? "Hacer admin" : "Expulsar"}
      </button>
    </div>
  `);

  modal
    .querySelector("#confirm-group-member-action")
    .addEventListener("click", async () => {
      try {
        const groupId = state.activeContext.id;
        if (promoting) {
          await api.promoteGroupMember(groupId, targetUserId);
        } else {
          await api.removeGroupMember(groupId, targetUserId);
        }
        close();
        window.dispatchEvent(
          new CustomEvent("chad:group-changed", { detail: { groupId } }),
        );
        showToast(promoting ? "Administrador asignado" : "Integrante expulsado");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
}

function confirmGroupAction(action) {
  if (state.activeContext?.type !== "group") return;
  const leaving = action === "leave";
  const { modal, close } = openModal(`
    <header class="modal-header">
      <h2>${leaving ? "Salir del grupo" : "Vaciar chat"}</h2>
      <button class="icon-button modal-close" title="Cerrar">
        <i data-lucide="x"></i>
      </button>
    </header>
    <p class="confirmation-copy">
      ${
        leaving
          ? "Dejarás de ver el grupo y sus mensajes. Si eres el dueño, la propiedad pasará automáticamente a otro integrante."
          : "Se eliminará el historial del grupo para todos sus integrantes."
      }
    </p>
    <div class="modal-actions">
      <button class="secondary-button modal-close" type="button">Cancelar</button>
      <button id="confirm-group-action" class="danger-button" type="button">
        ${leaving ? "Salir" : "Vaciar"}
      </button>
    </div>
  `);

  modal.querySelector("#confirm-group-action").addEventListener("click", async () => {
    try {
      const groupId = state.activeContext.id;
      if (leaving) {
        await api.leaveGroup(groupId);
      } else {
        await api.clearGroup(groupId);
        state.messages = [];
        renderMessages();
      }
      close();
      window.dispatchEvent(
        new CustomEvent(leaving ? "chad:group-left" : "chad:group-changed", {
          detail: { groupId },
        }),
      );
      showToast(leaving ? "Saliste del grupo" : "Chat del grupo vaciado");
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

function openChatActionConfirmation(action) {
  if (state.activeContext?.type !== "private") return;

  const removing = action === "remove";
  const { modal, close } = openModal(`
    <header class="modal-header">
      <h2>${removing ? "Eliminar chat" : "Vaciar chat"}</h2>
      <button class="icon-button modal-close" title="Cerrar">
        <i data-lucide="x"></i>
      </button>
    </header>
    <p class="confirmation-copy">
      ${
        removing
          ? "La conversación desaparecerá de tu lista. Volverá a mostrarse si alguno envía un mensaje nuevo."
          : "Los mensajes actuales dejarán de mostrarse para tu cuenta. Esta acción no afecta al otro usuario."
      }
    </p>
    <div class="modal-actions">
      <button class="secondary-button modal-close" type="button">Cancelar</button>
      <button id="confirm-chat-action" class="danger-button" type="button">
        ${removing ? "Eliminar" : "Vaciar"}
      </button>
    </div>
  `);

  modal.querySelector("#confirm-chat-action").addEventListener(
    "click",
    async () => {
      try {
        const chatId = state.activeContext.id;
        if (removing) {
          await api.removeChat(chatId);
        } else {
          await api.clearChat(chatId);
          state.messages = [];
          renderMessages();
        }
        close();
        window.dispatchEvent(
          new CustomEvent(
            removing ? "chad:chat-removed" : "chad:chat-cleared",
            { detail: { chatId } },
          ),
        );
        showToast(removing ? "Chat eliminado" : "Chat vaciado");
      } catch (error) {
        showToast(error.message, "error");
      }
    },
  );
}

function messageMarkup(message) {
  if (message.messageType === "system") {
    return `
      <div id="message-${message.id}" class="system-message">
        <span>${escapeHtml(message.content)}</span>
        <time>${formatDate(message.createdAt)}</time>
      </div>
    `;
  }

  const own = message.senderId === state.currentUser.id;
  const sender =
    own
      ? state.currentUser
      : state.users.find((user) => user.id === message.senderId);
  const deleted = message.deleted || message.messageType === "deleted";
  const currentRole =
    state.activeContext?.type === "group"
      ? state.activeContext.source?.members?.find(
          (member) => member.id === state.currentUser.id,
        )?.role
      : null;
  const canDelete =
    own || ["owner", "admin"].includes(currentRole);
  const fileMarkup = message.file
    ? `
      ${previewMarkup(message.file)}
      <div class="file-message">
        <span class="file-icon"><i data-lucide="${fileIcon(message.file.fileType)}"></i></span>
        <span class="file-message-copy">
          <strong>${escapeHtml(message.file.originalName)}</strong>
          <span>${escapeHtml(message.file.fileType)} · ${formatBytes(message.file.size)}</span>
        </span>
        <button class="file-download" data-download-file="${message.file.id}" title="Descargar">
          <i data-lucide="download"></i>
        </button>
      </div>
    `
    : "";
  const replyMarkup = message.reply
    ? `
      <button
        class="message-reply-reference"
        type="button"
        data-reply-target="${message.reply.id}"
      >
        <strong>${escapeHtml(message.reply.senderDisplayName || "Mensaje")}</strong>
        <span>${escapeHtml(message.reply.deleted
          ? "Mensaje borrado"
          : message.reply.content || messageTypeLabel(message.reply.messageType))}</span>
      </button>
    `
    : "";
  const actions = deleted
    ? ""
    : `
      <div class="message-actions">
        <button
          type="button"
          data-message-action="reply"
          data-message-id="${message.id}"
          title="Responder"
        ><i data-lucide="reply"></i></button>
        <button
          type="button"
          data-message-action="pin"
          data-message-id="${message.id}"
          title="${message.isPinned ? "Desfijar" : "Fijar"}"
        ><i data-lucide="${message.isPinned ? "pin-off" : "pin"}"></i></button>
        ${
          canDelete
            ? `
              <button
                type="button"
                class="message-delete-action"
                data-message-action="delete"
                data-message-id="${message.id}"
                title="Borrar"
              ><i data-lucide="trash-2"></i></button>
            `
            : ""
        }
      </div>
    `;

  return `
    <div
      id="message-${message.id}"
      class="message-row ${own ? "own" : ""} ${deleted ? "deleted" : ""}"
    >
      ${own ? "" : avatarMarkup(
        {
          displayName: message.senderDisplayName,
          avatarData: message.senderAvatarData || sender?.avatarData,
        },
        "avatar message-avatar",
      )}
      <div class="message-bubble">
        ${actions}
        <div class="message-meta">
          <strong>${escapeHtml(own ? "Tú" : message.senderDisplayName)}</strong>
          <span>
            ${message.isPinned ? '<i data-lucide="pin" class="pinned-icon"></i>' : ""}
            <time>${formatDate(message.createdAt)}</time>
          </span>
        </div>
        ${replyMarkup}
        ${
          deleted
            ? `<p class="deleted-message-copy"><i data-lucide="ban"></i> ${
                message.deletionReason === "admin"
                  ? "Eliminado por un admin"
                  : "Mensaje borrado"
              }</p>`
            : message.messageType === "text"
              ? `<p>${escapeHtml(message.content)}</p>`
              : ""
        }
        ${deleted ? "" : fileMarkup}
      </div>
    </div>
  `;
}

function renderPinnedMessages() {
  const container = $("#pinned-messages");
  const pinned = state.messages.filter((message) => message.isPinned && !message.deleted);

  if (!pinned.length) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <i data-lucide="pin"></i>
    <strong>${pinned.length === 1 ? "Mensaje fijado" : `${pinned.length} mensajes fijados`}</strong>
    <div class="pinned-message-list">
      ${pinned
        .map(
          (message) => `
            <button type="button" data-pinned-message="${message.id}">
              ${escapeHtml(message.content || message.file?.originalName || messageTypeLabel(message.messageType))}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
  container.classList.remove("hidden");
  container.querySelectorAll("[data-pinned-message]").forEach((button) => {
    button.addEventListener("click", () =>
      scrollToMessage(Number(button.dataset.pinnedMessage)),
    );
  });
  renderIcons();
}

async function handleMessageAction(action, messageId) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) return;

  if (action === "reply") {
    startReply(messageId);
    return;
  }

  try {
    const updated =
      action === "delete"
        ? await api.deleteMessage(messageId)
        : await api.pinMessage(messageId, !message.isPinned);
    updateMessage(updated);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function startReply(messageId) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message || message.deleted) return;

  state.replyingTo = message;
  $("#composer-context-title").textContent =
    `Respondiendo a ${message.senderId === state.currentUser.id ? "ti" : message.senderDisplayName}`;
  $("#composer-context-text").textContent =
    message.content || message.file?.originalName || messageTypeLabel(message.messageType);
  $("#composer-context").classList.remove("hidden");
  $("#message-input").focus();
}

function scrollToMessage(messageId) {
  const element = $(`#message-${messageId}`);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.add("message-highlight");
  setTimeout(() => element.classList.remove("message-highlight"), 1200);
}

async function sendRecordedVoice() {
  const context = voiceContext;
  const mimeType = voiceRecorder?.mimeType || "audio/webm";
  const blob = new Blob(voiceChunks, { type: mimeType });
  releaseVoiceRecorder();

  if (!context || !blob.size) return;

  try {
    const result = await api.uploadRecordedAudio({
      contextType: context.type,
      contextId: context.id,
      replyToId: context.replyToId,
      originalName: `nota-voz-${Date.now()}.${mimeType.includes("ogg") ? "ogg" : "webm"}`,
      mimeType,
      dataBase64: await blobToBase64(blob),
    });
    if (result?.message) appendMessage(result.message);
  } catch (error) {
    if (context.replyToId) startReply(context.replyToId);
    showToast(error.message, "error");
  }
}

function releaseVoiceRecorder() {
  if (voiceTimer) clearInterval(voiceTimer);
  for (const track of voiceStream?.getTracks?.() || []) track.stop();
  voiceTimer = null;
  voiceStream = null;
  voiceRecorder = null;
  voiceChunks = [];
  voiceStartedAt = null;
  voiceContext = null;
  updateRecordingUI(false);
}

function updateRecordingUI(recording) {
  $("#voice-record-button")?.classList.toggle("recording", recording);
  $("#voice-recording-status")?.classList.toggle("hidden", !recording);
  if (!recording && $("#voice-recording-time")) {
    $("#voice-recording-time").textContent = "00:00";
  }
}

function updateVoiceTimer() {
  if (!voiceStartedAt) return;
  const seconds = Math.floor((Date.now() - voiceStartedAt) / 1000);
  $("#voice-recording-time").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function selectRecordingMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

function messageTypeLabel(type) {
  return {
    image: "Imagen",
    document: "Documento",
    audio: "Nota de voz",
    video: "Video",
  }[type] || "Mensaje";
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize));
  }
  return btoa(binary);
}

function previewMarkup(file) {
  if (file.previewData && file.fileType === "image") {
    return `<img class="message-image-preview" src="${file.previewData}" alt="${escapeHtml(file.originalName)}" />`;
  }
  if (file.previewData && file.fileType === "audio") {
    return `<audio class="message-media-preview" controls src="${file.previewData}"></audio>`;
  }
  if (file.previewData && file.fileType === "video") {
    return `<video class="message-media-preview" controls src="${file.previewData}"></video>`;
  }
  if (["image", "audio", "video"].includes(file.fileType)) {
    return `
      <button
        class="load-file-preview"
        type="button"
        data-load-preview="${file.id}"
      >
        <i data-lucide="${file.fileType === "image" ? "image" : file.fileType === "audio" ? "play" : "film"}"></i>
        Cargar vista previa
      </button>
    `;
  }

  return "";
}

async function loadFilePreview(fileId, button) {
  const message = state.messages.find((item) => item.file?.id === fileId);
  if (!message?.file || message.file.previewData) return;

  button.disabled = true;
  button.classList.add("loading");
  try {
    const preview = await api.getFilePreview(fileId);
    message.file.previewData = preview.dataUrl;
    renderMessages({ scrollToBottom: false });
  } catch (error) {
    button.disabled = false;
    button.classList.remove("loading");
    showToast(error.message, "error");
  }
}

function isActiveContext(snapshot) {
  return (
    snapshot === `${state.activeContext?.type}:${state.activeContext?.id}`
  );
}

function fileIcon(fileType) {
  return {
    image: "image",
    audio: "audio-lines",
    video: "film",
    document: "file-text",
  }[fileType] || "file";
}
