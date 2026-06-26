import { state, applyBootstrap, resetState } from "./state.js";
import { api } from "./api.js";
import {
  $,
  $$,
  applyTheme,
  avatarMarkup,
  escapeHtml,
  openModal,
  renderIcons,
  setAvatar,
  showToast,
} from "./ui.js";
import { setupAuth } from "./auth.js";
import {
  appendMessage,
  cancelReply,
  cancelVoiceRecording,
  openConversation,
  renderConversationList,
  renderDetails,
  renderGroupCallBanner,
  renderMessages,
  loadOlderMessages,
  sendCurrentMessage,
  toggleVoiceRecording,
  uploadCurrentFile,
  updateMessage,
} from "./chats.js";
import { openCreateGroupModal, openEditGroupModal } from "./groups.js";
import { CallController, renderCallsView } from "./calls.js";
import { renderSettingsView } from "./settings.js";

let callController;

document.addEventListener("DOMContentLoaded", () => {
  renderIcons();
  setupAuth({ onAuthenticated: handleAuthenticated });
  setupAppEvents();
  setupServerEvents();
  setupUploadProgress();

  callController = new CallController({
    onCallsChanged: () => {
      if (state.activeView === "calls") renderCallsView();
      renderGroupCallBanner();
    },
  });
});

async function handleAuthenticated(result) {
  state.session = result;
  const bootstrap = await api.bootstrap();
  applyBootstrap(bootstrap);
  applyTheme(state.settings.theme, state.settings.accentColor);
  $("#auth-screen").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
  updateAccountUI();
  switchView("chats");
  await restoreCallState();
  showToast(`Bienvenido, ${state.currentUser.displayName}`);
}

async function restoreCallState() {
  const activeCall = state.calls.find((call) => {
    if (!["started", "in_progress"].includes(call.status)) return false;
    return call.participants?.some(
      (participant) =>
        participant.id === state.currentUser.id &&
        ["joined", "invited"].includes(participant.status),
    );
  });
  if (!activeCall) return;

  const currentParticipant = activeCall.participants.find(
    (participant) => participant.id === state.currentUser.id,
  );
  if (currentParticipant.status === "invited") {
    callController.showIncoming(activeCall);
    return;
  }

  await callController.handleCallUpdate(activeCall);
}

function setupAppEvents() {
  $$(".nav-button[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  $("#theme-quick-toggle").addEventListener("click", async () => {
    const theme = state.settings.theme === "dark" ? "light" : "dark";
    state.settings = await api.updateSettings({ theme });
    applyTheme(theme, state.settings.accentColor);
  });

  $("#profile-rail-button").addEventListener("click", () =>
    switchView("settings"),
  );
  $("#empty-new-chat").addEventListener("click", () => {
    if (state.activeView === "groups") {
      openCreateGroupModal({
        onCreated: async () => {
          await refreshBootstrap();
          renderCurrentList();
        },
      });
    } else {
      openNewChatModal();
    }
  });
  $("#create-action-button").addEventListener("click", () => {
    if (state.activeView === "groups") {
      openCreateGroupModal({
        onCreated: async () => {
          await refreshBootstrap();
          renderCurrentList();
        },
      });
    } else if (state.activeView === "chats") {
      openNewChatModal();
    }
  });

  $("#list-search").addEventListener("input", renderCurrentList);
  $("#send-message-button").addEventListener("click", sendCurrentMessage);
  $("#message-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendCurrentMessage();
    }
  });
  $("#message-input").addEventListener("input", (event) => {
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
  });
  $("#messages-container").addEventListener("scroll", (event) => {
    if (event.currentTarget.scrollTop <= 80) loadOlderMessages();
  });
  $("#attach-button").addEventListener("click", uploadCurrentFile);
  $("#voice-record-button").addEventListener("click", toggleVoiceRecording);
  $("#cancel-composer-context").addEventListener("click", cancelReply);
  $("#audio-call-button").addEventListener("click", () =>
    callController.startFromContext("audio"),
  );
  $("#video-call-button").addEventListener("click", () =>
    callController.startFromContext("video"),
  );
  $("#details-button").addEventListener("click", () => {
    $("#app-shell").classList.toggle("details-open");
    renderDetails();
  });
  $("#close-details").addEventListener("click", () =>
    $("#app-shell").classList.remove("details-open"),
  );
  window.addEventListener("chad:edit-group", (event) => {
    openEditGroupModal(event.detail, {
      onUpdated: async (updated) => {
        await refreshBootstrap();
        const group = state.groups.find((item) => item.id === updated.id);
        if (state.activeContext?.type === "group" && group) {
          state.activeContext.source = group;
          state.activeContext.title = group.name;
          $("#conversation-title").textContent = group.name;
          renderDetails();
        }
        renderCurrentList();
      },
    });
  });
  window.addEventListener("chad:group-call-action", (event) => {
    callController.openOrJoinGroupCall(event.detail.callId);
  });
  window.addEventListener("chad:group-changed", async () => {
    await refreshBootstrap(false);
    syncActiveGroupContext();
    renderCurrentList();
  });
  window.addEventListener("chad:group-left", async () => {
    closeActiveConversation();
    await refreshBootstrap(false);
    switchView("groups");
  });
  window.addEventListener("chad:chat-cleared", async () => {
    await refreshBootstrap(false);
    renderCurrentList();
  });
  window.addEventListener("chad:chat-removed", async () => {
    state.activeContext = null;
    state.messages = [];
    $("#app-shell").classList.remove("details-open");
    await refreshBootstrap(false);
    switchView("chats");
  });
  window.addEventListener("chad:calls-changed", () => {
    if (state.activeView === "calls") {
      renderCallsView();
      renderCallsListPane();
    }
  });
}

function setupServerEvents() {
  window.chad.events.onServerEvent(async (message) => {
    switch (message.event) {
      case "message:new": {
        const knownConversation = updateConversationSummary(message.data);
        if (!appendMessage(message.data)) {
          showToast(
            `Nuevo mensaje de ${message.data.senderDisplayName || "Chad"}`,
          );
        }
        if (!knownConversation) await refreshBootstrap(false);
        renderCurrentList();
        break;
      }
      case "message:updated":
        updateConversationSummary(message.data, { onlyIfLatest: true });
        updateMessage(message.data);
        renderCurrentList();
        break;
      case "group:created":
      case "group:updated":
        await refreshBootstrap(false);
        syncActiveGroupContext();
        renderCurrentList();
        break;
      case "group:removed":
        await refreshBootstrap(false);
        if (
          state.activeContext?.type === "group" &&
          state.activeContext.id === message.data.groupId
        ) {
          closeActiveConversation();
          switchView("groups");
        } else {
          renderCurrentList();
        }
        break;
      case "group:cleared":
        if (
          state.activeContext?.type === "group" &&
          state.activeContext.id === message.data.groupId
        ) {
          state.messages = [];
          renderMessages();
        }
        await refreshBootstrap(false);
        renderCurrentList();
        break;
      case "call:incoming":
        if (state.settings.callNotificationsEnabled) {
          callController.showIncoming(message.data);
        } else {
          state.calls = [
            message.data,
            ...state.calls.filter((call) => call.id !== message.data.id),
          ];
          renderGroupCallBanner();
          if (state.activeView === "calls") renderCallsView();
        }
        break;
      case "call:updated":
        callController.handleCallUpdate(message.data);
        break;
      case "settings:updated":
        state.settings = message.data;
        applyTheme(state.settings.theme, state.settings.accentColor);
        break;
      case "user:updated":
        if (message.data.id === state.currentUser.id) {
          state.currentUser = message.data;
          state.groups = state.groups.map((group) => ({
            ...group,
            members: group.members.map((member) =>
              member.id === message.data.id
                ? { ...member, ...message.data }
                : member,
            ),
          }));
          syncActiveGroupContext();
          updateAccountUI();
          renderCurrentList();
          renderDetails();
          renderGroupCallBanner();
        } else {
          state.users = state.users.map((user) =>
            user.id === message.data.id ? message.data : user,
          );
          state.privateChats = state.privateChats.map((chat) =>
            chat.peer.id === message.data.id
              ? { ...chat, peer: message.data }
              : chat,
          );
          state.groups = state.groups.map((group) => ({
            ...group,
            members: group.members.map((member) =>
              member.id === message.data.id
                ? { ...member, ...message.data }
                : member,
            ),
          }));
          syncActivePrivateContext();
          syncActiveGroupContext();
          renderCurrentList();
          renderDetails();
          renderGroupCallBanner();
        }
        break;
      case "presence:changed":
        updatePresence(message.data.connectedUserIds);
        break;
      default:
        break;
    }
  });

  window.chad.events.onDisconnected(() => {
    callController?.hideIncoming();
    callController?.closeCallOverlay();
    showToast("Se perdió la conexión con el servidor", "error", 6000);
  });
  window.chad.events.onError((message) => showToast(message, "error"));
}

function setupUploadProgress() {
  window.chad.file.onProgress((progress) => {
    const element = $("#upload-progress");
    element.classList.remove("hidden");
    element.style.setProperty("--upload-progress", `${progress.progress}%`);
    if (progress.progress >= 100) {
      setTimeout(() => element.classList.add("hidden"), 700);
    }
  });
}

function switchView(view) {
  state.activeView = view;
  $$(".nav-button[data-view]").forEach((button) =>
    button.classList.toggle("active", button.dataset.view === view),
  );

  $("#conversation-view").classList.add("hidden");
  $("#empty-state").classList.add("hidden");
  $("#calls-view").classList.add("hidden");
  $("#settings-view").classList.add("hidden");
  $("#details-pane").classList.remove("visible");
  $("#app-shell").classList.remove("details-open");

  const titles = {
    chats: ["Conversaciones", "Chats"],
    groups: ["Espacios compartidos", "Grupos"],
    calls: ["Actividad", "Llamadas"],
    settings: ["Cuenta", "Ajustes"],
  };
  $("#view-kicker").textContent = titles[view][0];
  $("#view-title").textContent = titles[view][1];
  $("#create-action-button").classList.toggle(
    "hidden",
    !["chats", "groups"].includes(view),
  );
  $(".search-box").classList.toggle(
    "hidden",
    !["chats", "groups"].includes(view),
  );
  const emptyButton = $("#empty-new-chat");
  emptyButton.innerHTML =
    view === "groups"
      ? '<i data-lucide="users-round"></i> Nuevo grupo'
      : '<i data-lucide="message-square-plus"></i> Nuevo chat';

  if (view === "calls") {
    $("#calls-view").classList.remove("hidden");
    renderCallsView();
    renderCallsListPane();
  } else if (view === "settings") {
    $("#settings-view").classList.remove("hidden");
    renderSettingsView({
      onUpdated: updateAccountUI,
      onLogout: handleLogout,
    });
    renderSettingsListPane();
  } else {
    $("#empty-state").classList.remove("hidden");
    renderCurrentList();
  }

  renderIcons();
}

function renderCurrentList() {
  if (!["chats", "groups"].includes(state.activeView)) return;

  renderConversationList(
    state.activeView,
    $("#list-search").value,
    async (item) => {
      await openConversation(item);
      renderCurrentList();
    },
  );
}

function renderCallsListPane() {
  const recent = state.calls.slice(0, 8);
  $("#list-content").innerHTML = recent.length
    ? `<div class="conversation-list">${recent
        .map((call) => {
          const outgoing = call.callerId === state.currentUser.id;
          const name =
            call.groupName ||
            (outgoing ? call.receiverDisplayName : call.callerDisplayName) ||
            "Llamada";
          return `
            <div class="conversation-item">
              ${avatarMarkup({ displayName: name }, "avatar avatar-md")}
              <span class="conversation-item-copy">
                <strong>${escapeHtml(name)}</strong>
                <span>${escapeHtml(call.callType)} · ${escapeHtml(call.status)}</span>
              </span>
            </div>
          `;
        })
        .join("")}</div>`
    : '<div class="list-empty">Sin llamadas recientes.</div>';
}

function renderSettingsListPane() {
  $("#list-content").innerHTML = `
    <div class="list-empty">
      Personaliza tu perfil, seguridad, apariencia y notificaciones.
    </div>
  `;
}

function openNewChatModal() {
  const { modal, close } = openModal(`
    <header class="modal-header">
      <h2>Nuevo chat</h2>
      <button class="icon-button modal-close" title="Cerrar">
        <i data-lucide="x"></i>
      </button>
    </header>
    <div class="member-picker">
      ${state.users
        .map(
          (user) => `
            <button class="member-option new-chat-user" data-user-id="${user.id}">
              ${avatarMarkup(user, "avatar avatar-sm")}
              <span>
                <strong>${escapeHtml(user.displayName)}</strong><br />
                <small>
                  @${escapeHtml(user.username)}
                  <span class="status-chip compact status-${escapeHtml(user.status || "offline")}">
                    ${escapeHtml(statusLabel(user.status))}
                  </span>
                </small>
              </span>
              <i data-lucide="message-circle"></i>
            </button>
          `,
        )
        .join("")}
    </div>
  `);

  modal.querySelectorAll(".new-chat-user").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const chat = await api.openChat(Number(button.dataset.userId));
        await refreshBootstrap();
        const found = state.privateChats.find((item) => item.id === chat.id);
        close();
        switchView("chats");
        if (found) {
          await openConversation({
            contextType: "private",
            contextId: found.id,
            title: found.peer.displayName,
            subtitle: `@${found.peer.username}`,
            avatar: found.peer,
            source: found,
          });
          renderCurrentList();
        }
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

async function refreshBootstrap(updateAccount = true) {
  const bootstrap = await api.bootstrap();
  const activeContext = state.activeContext;
  applyBootstrap(bootstrap);
  state.activeContext = activeContext;
  if (updateAccount) updateAccountUI();
}

function syncActiveGroupContext() {
  if (state.activeContext?.type !== "group") return;

  const group = state.groups.find(
    (item) => item.id === state.activeContext.id,
  );
  if (!group) {
    closeActiveConversation();
    switchView("groups");
    return;
  }

  state.activeContext.source = group;
  state.activeContext.title = group.name;
  state.activeContext.avatar = {
    displayName: group.name,
    avatarData: group.avatar,
  };
  $("#conversation-title").textContent = group.name;
  $("#conversation-subtitle").textContent =
    groupPresenceSummary(group.members || []);
  renderDetails();
  renderGroupCallBanner();
}

function closeActiveConversation() {
  state.activeContext = null;
  state.messages = [];
  state.loadingOlderMessages = false;
  state.hasMoreMessages = true;
  $("#conversation-view").classList.add("hidden");
  $("#app-shell").classList.remove("details-open");
}

function updateConversationSummary(message, { onlyIfLatest = false } = {}) {
  const summary = message.deleted
    ? "Mensaje borrado"
    : message.content ||
      message.file?.originalName ||
      {
        image: "Imagen",
        audio: "Nota de voz",
        video: "Video",
        document: "Documento",
      }[message.messageType] ||
      "Mensaje";
  const collection =
    message.chatId ? state.privateChats : message.groupId ? state.groups : [];
  const item = collection.find(
    (candidate) =>
      candidate.id === Number(message.chatId || message.groupId),
  );
  if (!item) return false;
  if (onlyIfLatest && Number(item.lastMessageId) !== Number(message.id)) {
    return true;
  }

  item.lastMessageId = message.id;
  item.lastMessage = summary;
  item.lastMessageType = message.messageType;
  item.lastMessageAt = message.createdAt;
  collection.sort(
    (first, second) =>
      new Date(second.lastMessageAt || second.createdAt || 0) -
      new Date(first.lastMessageAt || first.createdAt || 0),
  );
  return true;
}

function updateAccountUI() {
  if (!state.currentUser) return;

  $("#account-display-name").textContent = state.currentUser.displayName;
  $("#account-username").textContent = `@${state.currentUser.username}`;
  setAvatar($("#account-avatar"), state.currentUser);
  setAvatar($("#rail-avatar"), state.currentUser);
  $("#account-status-dot").className =
    `status-dot ${state.currentUser.status || "offline"}`;
}

function updatePresence(connectedUserIds) {
  const connected = new Set(connectedUserIds.map(Number));
  const resolveStatus = (user) => {
    if (!connected.has(user.id)) return "offline";
    return user.status && user.status !== "offline" ? user.status : "online";
  };

  state.users = state.users.map((user) => ({
    ...user,
    status: resolveStatus(user),
  }));
  state.privateChats = state.privateChats.map((chat) => ({
    ...chat,
    peer: {
      ...chat.peer,
      status: resolveStatus(chat.peer),
    },
  }));
  state.groups = state.groups.map((group) => ({
    ...group,
    members: group.members.map((member) => ({
      ...member,
      status: resolveStatus(member),
    })),
  }));
  syncActivePrivateContext();
  if (state.activeContext?.type === "group") syncActiveGroupContext();
  renderCurrentList();
  renderDetails();
  renderGroupCallBanner();
}

function syncActivePrivateContext() {
  if (state.activeContext?.type !== "private") return;

  const chat = state.privateChats.find(
    (item) => item.id === state.activeContext.id,
  );
  if (!chat) return;

  state.activeContext.source = chat;
  state.activeContext.title = chat.peer.displayName;
  state.activeContext.avatar = chat.peer;
  $("#conversation-title").textContent = chat.peer.displayName;
  $("#conversation-subtitle").textContent =
    `@${chat.peer.username} · ${statusLabel(chat.peer.status)}`;
  setAvatar($("#conversation-avatar"), chat.peer);
}

function statusLabel(status) {
  return {
    online: "Activo",
    busy: "Ocupado",
    in_call: "En llamada",
    offline: "Offline",
  }[status || "offline"] || "Offline";
}

function groupPresenceSummary(members) {
  const active = members.filter((member) =>
    ["online", "busy", "in_call"].includes(member.status),
  ).length;
  const busy = members.filter((member) => member.status === "busy").length;
  const inCall = members.filter((member) => member.status === "in_call").length;
  const parts = [`${members.length} integrantes`, `${active} activos`];
  if (busy) parts.push(`${busy} ocupados`);
  if (inCall) parts.push(`${inCall} en llamada`);
  return parts.join(" · ");
}

async function handleLogout() {
  try {
    callController.hideIncoming();
    cancelVoiceRecording();
    if (state.activeCall) {
      await callController.endActive();
    } else {
      callController.closeCallOverlay();
    }
    await api.logout();
  } finally {
    resetState();
    $("#app-shell").classList.add("hidden");
    $("#auth-screen").classList.remove("hidden");
    $("#login-password").value = "";
    showToast("Sesión cerrada");
  }
}
