export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function avatarMarkup(user, className = "avatar avatar-md") {
  const label = user?.displayName || user?.username || "Usuario";
  const image = user?.avatarData || user?.avatar;

  if (image) {
    return `<span class="${className}"><img src="${image}" alt="${escapeHtml(label)}" /></span>`;
  }

  return `<span class="${className}">${escapeHtml(initials(label))}</span>`;
}

export function setAvatar(element, user) {
  if (!element) return;

  const label = user?.displayName || user?.username || "Usuario";
  const image = user?.avatarData || user?.avatar;
  element.innerHTML = image
    ? `<img src="${image}" alt="${escapeHtml(label)}" />`
    : escapeHtml(initials(label));
}

export function formatDate(value, includeDate = false) {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-PE", {
    ...(includeDate ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export function renderIcons() {
  if (window.lucide) {
    window.lucide.createIcons({
      attrs: {
        "stroke-width": 1.8,
      },
    });
  }
}

export function showToast(message, type = "info", duration = 3200) {
  const container = $("#toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), duration);
}

export function openModal(content) {
  const backdrop = $("#modal-backdrop");
  const modal = $("#modal");
  modal.innerHTML = content;
  backdrop.classList.remove("hidden");
  renderIcons();

  const close = () => {
    backdrop.classList.add("hidden");
    modal.innerHTML = "";
  };

  $$(".modal-close", modal).forEach((button) =>
    button.addEventListener("click", close),
  );
  backdrop.onclick = (event) => {
    if (event.target === backdrop) close();
  };

  return { modal, close };
}

export function applyTheme(theme, accentColor) {
  document.documentElement.dataset.theme = theme || "dark";
  if (accentColor) {
    document.documentElement.style.setProperty("--accent", accentColor);
    document.documentElement.style.setProperty(
      "--accent-contrast",
      getContrastColor(accentColor),
    );
  }
}

function getContrastColor(color) {
  const clean = String(color).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return "#17200f";

  const red = parseInt(clean.slice(0, 2), 16);
  const green = parseInt(clean.slice(2, 4), 16);
  const blue = parseInt(clean.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 145 ? "#17200f" : "#ffffff";
}

export function setButtonLoading(button, loading, text = null) {
  button.disabled = loading;
  if (text) button.querySelector("span").textContent = text;
}
