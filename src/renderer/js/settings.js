import { state } from "./state.js";
import { api } from "./api.js";
import {
  $,
  applyTheme,
  escapeHtml,
  renderIcons,
  setAvatar,
  showToast,
} from "./ui.js";

export function renderSettingsView({ onUpdated, onLogout }) {
  const container = $("#settings-view");
  const settings = state.settings;
  const user = state.currentUser;

  container.innerHTML = `
    <header class="section-heading">
      <div>
        <span class="eyebrow">Cuenta y aplicación</span>
        <h2>Ajustes</h2>
      </div>
    </header>
    <div class="settings-layout">
      <section class="settings-panel">
        <h3>Perfil</h3>
        <div class="profile-editor">
          <span id="settings-avatar" class="avatar avatar-xl"></span>
          <div class="profile-editor-copy">
            <strong>${escapeHtml(user.displayName)}</strong>
            <span>@${escapeHtml(user.username)}</span>
          </div>
          <button id="change-avatar-button" class="secondary-button" type="button">
            <i data-lucide="image-up"></i>
            Foto
          </button>
        </div>
        <form id="profile-form" class="settings-form">
          <label class="field">
            <span>Username</span>
            <input id="settings-username" value="${escapeHtml(user.username)}" required />
          </label>
          <label class="field">
            <span>Nombre visible</span>
            <input id="settings-display-name" value="${escapeHtml(user.displayName)}" required />
          </label>
          <label class="field">
            <span>Estado</span>
            <select id="settings-status">
              ${statusOption("online", "Disponible", user.status)}
              ${statusOption("busy", "Ocupado", user.status)}
              ${statusOption("offline", "Invisible", user.status)}
            </select>
          </label>
          <button class="primary-button" type="submit">Guardar perfil</button>
        </form>
      </section>

      <section class="settings-panel">
        <h3>Apariencia y notificaciones</h3>
        <form id="preferences-form" class="settings-form">
          <label class="field">
            <span>Tema</span>
            <select id="settings-theme">
              <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Oscuro</option>
              <option value="light" ${settings.theme === "light" ? "selected" : ""}>Claro</option>
            </select>
          </label>
          <label class="field">
            <span>Color de acento</span>
            <input id="settings-accent" type="color" value="${escapeHtml(settings.accentColor)}" />
          </label>
          ${toggleRow("settings-notifications", "Notificaciones", settings.notificationsEnabled)}
          ${toggleRow("settings-call-notifications", "Avisos de llamada", settings.callNotificationsEnabled)}
          ${toggleRow("settings-sound", "Sonidos", settings.soundEnabled)}
          <button class="primary-button" type="submit">Guardar preferencias</button>
        </form>
      </section>

      <section class="settings-panel">
        <h3>Seguridad</h3>
        <form id="password-form" class="settings-form">
          <label class="field">
            <span>Contraseña actual</span>
            <input id="current-password" type="password" required />
          </label>
          <label class="field">
            <span>Nueva contraseña</span>
            <input id="new-password" type="password" minlength="6" required />
          </label>
          <button class="secondary-button" type="submit">Cambiar contraseña</button>
        </form>
      </section>

      <section class="settings-panel">
        <h3>Sesión</h3>
        <p>Cuenta creada el ${new Date(user.createdAt).toLocaleDateString("es-PE")}.</p>
        <button id="logout-button" class="danger-button" type="button">
          <i data-lucide="log-out"></i>
          Cerrar sesión
        </button>
      </section>
    </div>
  `;

  setAvatar($("#settings-avatar"), user);
  renderIcons();

  $("#change-avatar-button").addEventListener("click", async () => {
    try {
      const result = await api.chooseAvatar();
      if (!result.canceled) {
        state.currentUser = result.user;
        setAvatar($("#settings-avatar"), result.user);
        onUpdated();
        showToast("Foto de perfil actualizada");
      }
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  $("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      state.currentUser = await api.updateProfile({
        username: $("#settings-username").value,
        displayName: $("#settings-display-name").value,
        status: $("#settings-status").value,
      });
      onUpdated();
      showToast("Perfil guardado");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  $("#preferences-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      state.settings = await api.updateSettings({
        theme: $("#settings-theme").value,
        accentColor: $("#settings-accent").value,
        notificationsEnabled: $("#settings-notifications").checked,
        callNotificationsEnabled: $("#settings-call-notifications").checked,
        soundEnabled: $("#settings-sound").checked,
      });
      applyTheme(state.settings.theme, state.settings.accentColor);
      showToast("Preferencias guardadas");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  $("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api.changePassword({
        currentPassword: $("#current-password").value,
        newPassword: $("#new-password").value,
      });
      event.target.reset();
      showToast("Contraseña actualizada");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  $("#logout-button").addEventListener("click", onLogout);
}

function toggleRow(id, label, checked) {
  return `
    <div class="toggle-row">
      <span>${label}</span>
      <label class="toggle">
        <input id="${id}" type="checkbox" ${checked ? "checked" : ""} />
        <span></span>
      </label>
    </div>
  `;
}

function statusOption(value, label, current) {
  return `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
}
