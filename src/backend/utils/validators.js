const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,24}$/;

function requireFields(payload, fields) {
  for (const field of fields) {
    if (payload[field] === undefined || String(payload[field]).trim() === "") {
      throw new Error(`El campo ${field} es obligatorio`);
    }
  }
}

function validateUsername(username) {
  const value = String(username || "").trim();

  if (!USERNAME_PATTERN.test(value)) {
    throw new Error(
      "El username debe tener entre 3 y 24 caracteres y usar letras, números, punto, guion o guion bajo",
    );
  }

  return value;
}

function validatePassword(password) {
  const value = String(password || "");

  if (value.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres");
  }

  return value;
}

function validateDisplayName(displayName) {
  const value = String(displayName || "").trim();

  if (value.length < 2 || value.length > 60) {
    throw new Error("El nombre visible debe tener entre 2 y 60 caracteres");
  }

  return value;
}

function validateTheme(theme) {
  if (!["light", "dark"].includes(theme)) {
    throw new Error("Tema inválido");
  }

  return theme;
}

function validateStatus(status) {
  const allowed = ["online", "busy", "offline", "in_call"];

  if (!allowed.includes(status)) {
    throw new Error("Estado de usuario inválido");
  }

  return status;
}

module.exports = {
  requireFields,
  validateUsername,
  validatePassword,
  validateDisplayName,
  validateTheme,
  validateStatus,
};
