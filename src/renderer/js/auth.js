import { api } from "./api.js";
import { $, $$, setButtonLoading } from "./ui.js";

export function setupAuth({ onAuthenticated }) {
  const authTabs = $("#auth-tabs");
  const loginForm = $("#login-form");
  const registerForm = $("#register-form");

  authTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-auth-tab]");
    if (!button) return;

    $$("[data-auth-tab]", authTabs).forEach((tab) =>
      tab.classList.toggle("active", tab === button),
    );
    const loginActive = button.dataset.authTab === "login";
    loginForm.classList.toggle("hidden", !loginActive);
    registerForm.classList.toggle("hidden", loginActive);
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const feedback = $("#login-feedback");
    const button = loginForm.querySelector("button[type='submit']");
    feedback.textContent = "";
    setButtonLoading(button, true, "Conectando");

    try {
      const result = await api.login({
        username: $("#login-username").value.trim(),
        password: $("#login-password").value,
        host: $("#server-host").value.trim(),
        port: Number($("#server-port").value),
      });
      await onAuthenticated(result);
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      setButtonLoading(button, false, "Conectar");
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const feedback = $("#register-feedback");
    const button = registerForm.querySelector("button[type='submit']");
    feedback.textContent = "";
    feedback.classList.remove("success");
    setButtonLoading(button, true, "Registrando");

    try {
      const user = await api.register({
        username: $("#register-username").value.trim(),
        displayName: $("#register-display-name").value.trim(),
        password: $("#register-password").value,
        host: $("#server-host").value.trim(),
        port: Number($("#server-port").value),
      });
      feedback.textContent = `Cuenta @${user.username} creada. Ya puedes iniciar sesión.`;
      feedback.classList.add("success");
      $("#login-username").value = user.username;
      authTabs.querySelector("[data-auth-tab='login']").click();
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      setButtonLoading(button, false, "Registrar cuenta");
    }
  });
}
