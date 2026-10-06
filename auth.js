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

  // 기존에 이미 베타 인증을 완료한 기기만 계속 PWA를 사용할 수 있습니다.
  if (isBetaAuthorized()) {
    hideBetaAuthScreen();
    startAppAfterAuth();
    return;
  }

  // 신규 접속자는 더 이상 베타 코드를 입력해 PWA를 시작할 수 없습니다.
  showBetaAuthScreen();
  const description = document.querySelector(".beta-auth-description");
  const form = document.getElementById("betaAuthForm");
  if (description) {
    description.textContent = "PWA 베타 신규 이용이 종료되었습니다. 정식 모두의장부 앱을 이용해주세요.";
  }
  if (form) {
    form.style.display = "none";
  }
}

window.jeilProBetaAuth = {
  isBetaAuthorized,
  resetBetaAuthorization,
  showBetaAuthScreen,
  hideBetaAuthScreen,
  startAppAfterAuth
};

window.addEventListener("DOMContentLoaded", bootstrapBetaAuth);
