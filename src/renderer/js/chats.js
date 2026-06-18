import { state } from "./state.js";
import { api } from "./api.js";
import {
  $,
  avatarMarkup,
  escapeHtml,
  formatBytes,
  formatDate,
  renderIcons,
  setAvatar,
  showToast,
} from "./ui.js";

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
  state.activeContext = {
    type: item.contextType,
    id: item.contextId,
    title: item.title,
    avatar: item.avatar,
    source: item.source,
  };
  state.messages = await api.getMessages(item.contextType, item.contextId);

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

  renderMessages();
  renderDetails();
}

export function renderMessages() {
  const container = $("#messages-container");

  if (!state.messages.length) {
    container.innerHTML =
      '<div class="list-empty">Aún no hay mensajes. Empieza la conversación.</div>';
    return;
  }

  container.innerHTML = state.messages.map(messageMarkup).join("");
  container.scrollTop = container.scrollHeight;
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

export async function sendCurrentMessage() {
  if (!state.activeContext) return;

  const input = $("#message-input");
  const content = input.value.trim();
  if (!content) return;

  input.value = "";
  input.style.height = "auto";

  try {
    const message = await api.sendMessage(
      state.activeContext.type,
      state.activeContext.id,
      content,
    );
    appendMessage(message);
  } catch (error) {
    input.value = content;
    showToast(error.message, "error");
  }
}

export async function uploadCurrentFile() {
  if (!state.activeContext) return;

  try {
    const result = await api.uploadFile(
      state.activeContext.type,
      state.activeContext.id,
    );
    if (result?.message) appendMessage(result.message);
  } catch (error) {
    showToast(error.message, "error");
  }
}

export function renderDetails() {
  if (!state.activeContext) return;

  const content = $("#details-content");
  const isGroup = state.activeContext.type === "group";
  const source = state.activeContext.source;
  const members = isGroup ? source.members || [] : [];
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
        source.members?.some(
          (member) =>
            member.id === state.currentUser.id && member.role === "admin",
        )
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
                      <div>
                        <strong>${escapeHtml(member.displayName)}</strong>
                        <span>@${escapeHtml(member.username)}</span>
                      </div>
                      <span>${escapeHtml(member.role || "")}</span>
                    </div>
                  `,
                )
                .join("")}
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
  renderIcons();
}

function messageMarkup(message) {
  const own = message.senderId === state.currentUser.id;
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

  return `
    <div class="message-row ${own ? "own" : ""}">
      ${own ? "" : avatarMarkup(
        {
          displayName: message.senderDisplayName,
          avatarData: message.senderAvatarData,
        },
        "avatar message-avatar",
      )}
      <div class="message-bubble">
        <div class="message-meta">
          <strong>${escapeHtml(own ? "Tú" : message.senderDisplayName)}</strong>
          <time>${formatDate(message.createdAt)}</time>
        </div>
        ${message.messageType === "text" ? `<p>${escapeHtml(message.content)}</p>` : ""}
        ${fileMarkup}
      </div>
    </div>
  `;
}

function previewMarkup(file) {
  if (!file.previewData) return "";

  if (file.fileType === "image") {
    return `<img class="message-image-preview" src="${file.previewData}" alt="${escapeHtml(file.originalName)}" />`;
  }
  if (file.fileType === "audio") {
    return `<audio class="message-media-preview" controls src="${file.previewData}"></audio>`;
  }
  if (file.fileType === "video") {
    return `<video class="message-media-preview" controls src="${file.previewData}"></video>`;
  }

  return "";
}

function fileIcon(fileType) {
  return {
    image: "image",
    audio: "audio-lines",
    video: "film",
    document: "file-text",
  }[fileType] || "file";
}
