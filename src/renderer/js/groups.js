import { state } from "./state.js";
import { api } from "./api.js";
import {
  avatarMarkup,
  escapeHtml,
  openModal,
  showToast,
} from "./ui.js";

export function openCreateGroupModal({ onCreated }) {
  const { modal, close } = openModal(`
    <header class="modal-header">
      <h2>Crear grupo</h2>
      <button class="icon-button modal-close" title="Cerrar">
        <i data-lucide="x"></i>
      </button>
    </header>
    <form id="create-group-form" class="modal-form">
      <label class="field">
        <span>Nombre del grupo</span>
        <input id="group-name" maxlength="60" placeholder="Proyecto Final" required />
      </label>
      <label class="field">
        <span>Descripción</span>
        <textarea id="group-description" maxlength="240" placeholder="¿Para qué usaremos este grupo?"></textarea>
      </label>
      <div>
        <span class="eyebrow">Integrantes</span>
        <div class="member-picker">
          ${state.users
            .map(
              (user) => `
                <label class="member-option">
                  ${avatarMarkup(user, "avatar avatar-sm")}
                  <span>
                    <strong>${escapeHtml(user.displayName)}</strong><br />
                    <small>@${escapeHtml(user.username)}</small>
                  </span>
                  <input type="checkbox" name="member" value="${user.id}" />
                </label>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-button modal-close">Cancelar</button>
        <button type="submit" class="primary-button">Crear grupo</button>
      </div>
    </form>
  `);

  modal.querySelector("#create-group-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const memberIds = [
      ...modal.querySelectorAll("input[name='member']:checked"),
    ].map((input) => Number(input.value));

    try {
      const group = await api.createGroup({
        name: modal.querySelector("#group-name").value,
        description: modal.querySelector("#group-description").value,
        memberIds,
      });
      close();
      showToast("Grupo creado");
      onCreated(group);
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

export function openEditGroupModal(group, { onUpdated }) {
  const currentMemberIds = new Set((group.members || []).map((member) => member.id));
  const { modal, close } = openModal(`
    <header class="modal-header">
      <h2>Editar grupo</h2>
      <button class="icon-button modal-close" title="Cerrar">
        <i data-lucide="x"></i>
      </button>
    </header>
    <form id="edit-group-form" class="modal-form">
      <label class="field">
        <span>Nombre del grupo</span>
        <input id="edit-group-name" maxlength="60" value="${escapeHtml(group.name)}" required />
      </label>
      <label class="field">
        <span>Descripción</span>
        <textarea id="edit-group-description" maxlength="240">${escapeHtml(group.description || "")}</textarea>
      </label>
      <div>
        <span class="eyebrow">Agregar integrantes</span>
        <div class="member-picker">
          ${state.users
            .map(
              (user) => `
                <label class="member-option">
                  ${avatarMarkup(user, "avatar avatar-sm")}
                  <span>
                    <strong>${escapeHtml(user.displayName)}</strong><br />
                    <small>@${escapeHtml(user.username)}</small>
                  </span>
                  <input
                    type="checkbox"
                    name="member"
                    value="${user.id}"
                    ${currentMemberIds.has(user.id) ? "checked disabled" : ""}
                  />
                </label>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-button modal-close">Cancelar</button>
        <button type="submit" class="primary-button">Guardar cambios</button>
      </div>
    </form>
  `);

  modal.querySelector("#edit-group-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const memberIds = [
      ...modal.querySelectorAll("input[name='member']:checked:not(:disabled)"),
    ].map((input) => Number(input.value));

    try {
      const updated = await api.updateGroup({
        groupId: group.id,
        name: modal.querySelector("#edit-group-name").value,
        description: modal.querySelector("#edit-group-description").value,
        memberIds,
      });
      close();
      showToast("Grupo actualizado");
      onUpdated(updated);
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}
