const BETA_AUTH_KEY = "betaAuthorized";
const BETA_AUTH_CODE = "JEIL100";
let betaAuthInitialized = false;
let betaAppStarted = false;

window.jeilProUseBetaAuth = true;

function getBetaAuthScreen() {
  return document.getElementById("betaAuthScreen");
}

function getBetaAuthInput() {
  return document.getElementById("betaAuthCode");
}

function getBetaAuthError() {
  return document.getElementById("betaAuthError");
}

function isBetaAuthorized() {
  return localStorage.getItem(BETA_AUTH_KEY) === "true";
}

function setBetaAuthError(message) {
  const error = getBetaAuthError();
  if (error) {
    error.textContent = message || "";
  }
}

function showBetaAuthScreen() {
  const screen = getBetaAuthScreen();
  const input = getBetaAuthInput();
  if (!screen) return;

  document.body.classList.add("beta-auth-locked");
  screen.classList.remove("hidden");
  screen.setAttribute("aria-hidden", "false");
  setBetaAuthError("");

  if (input) {
    input.value = "";
    input.focus();
  }
}

function hideBetaAuthScreen() {
  const screen = getBetaAuthScreen();
  if (!screen) return;

  screen.classList.add("hidden");
  screen.setAttribute("aria-hidden", "true");
  document.body.classList.remove("beta-auth-locked");
}

function startAppAfterAuth() {
  if (betaAppStarted) return;

  if (typeof window.jeilProInitializeApp === "function") {
    betaAppStarted = true;
    hideBetaAuthScreen();
    window.jeilProInitializeApp();
    return;
  }

  window.jeilProPendingAppStart = true;
}

function authorizeBetaAccess() {
  localStorage.setItem(BETA_AUTH_KEY, "true");
  hideBetaAuthScreen();
  startAppAfterAuth();
}

function resetBetaAuthorization() {
  localStorage.removeItem(BETA_AUTH_KEY);
  betaAppStarted = false;
  showBetaAuthScreen();
}

function handleBetaAuthSubmit(event) {
  event.preventDefault();
  const input = getBetaAuthInput();
  const enteredCode = String(input?.value || "").trim();

  if (enteredCode === BETA_AUTH_CODE) {
    setBetaAuthError("");
    authorizeBetaAccess();
    return;
  }

  setBetaAuthError("베타 코드가 올바르지 않습니다.");
  if (input) {
    input.focus();
    input.select();
  }
}

function bindBetaAuthUI() {
  if (betaAuthInitialized) return;
  betaAuthInitialized = true;

  const form = document.getElementById("betaAuthForm");
  const resetButton = document.getElementById("betaAuthResetBtn");

  if (form) {
    form.addEventListener("submit", handleBetaAuthSubmit);
  }

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      resetBetaAuthorization();
    });
  }
}

function bootstrapBetaAuth() {
  bindBetaAuthUI();

  if (isBetaAuthorized()) {
    hideBetaAuthScreen();
    startAppAfterAuth();
    return;
  }

  showBetaAuthScreen();
}

window.jeilProBetaAuth = {
  isBetaAuthorized,
  resetBetaAuthorization,
  showBetaAuthScreen,
  hideBetaAuthScreen,
  startAppAfterAuth
};

window.addEventListener("DOMContentLoaded", bootstrapBetaAuth);
