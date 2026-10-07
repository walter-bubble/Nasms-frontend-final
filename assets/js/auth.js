(function () {
  "use strict";

  const TOKEN_KEY = "nasms.jwt";
  const API_BASE = (document.querySelector('meta[name="nasms-api-base"]')?.content || "").replace(/\/+$/, "");
  const loginView = document.getElementById("login-view");
  const accountView = document.getElementById("account-view");
  const loginForm = document.getElementById("login-form");
  const emailInput = document.getElementById("email-address");
  const passwordInput = document.getElementById("password");
  const passwordToggle = document.getElementById("password-toggle");
  const submitButton = document.getElementById("login-submit");
  const submitLabel = submitButton.querySelector(".auth-submit__label");
  const submitProgress = submitButton.querySelector(".auth-submit__progress");
  const loginStatus = document.getElementById("login-status");
  const accountStatus = document.getElementById("account-status");
  const identityDetails = document.getElementById("identity-details");
  let currentUser = null;

  function getToken() {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  function storeToken(token) {
    try {
      window.sessionStorage.setItem(TOKEN_KEY, token);
      return true;
    } catch {
      return false;
    }
  }

  function clearToken() {
    try {
      window.sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Session storage may be unavailable in restricted browser contexts.
    }
  }

  function apiUrl(path) {
    return API_BASE + path;
  }

  function setFieldError(input, message) {
    const error = document.getElementById(input.id + "-error");
    input.setAttribute("aria-invalid", message ? "true" : "false");
    error.textContent = message || "";
    error.hidden = !message;
  }

  function clearFieldErrors() {
    setFieldError(emailInput, "");
    setFieldError(passwordInput, "");
  }

  function setStatus(element, message, kind) {
    element.textContent = message;
    element.hidden = !message;
    element.classList.remove("notice--success", "notice--warning", "notice--error");
    if (kind) element.classList.add("notice--" + kind);
  }

  function setLoading(loading) {
    loginForm.setAttribute("aria-busy", String(loading));
    emailInput.disabled = loading;
    passwordInput.disabled = loading;
    passwordToggle.disabled = loading;
    submitButton.disabled = loading;
    submitLabel.textContent = loading ? "Signing in?" : "Sign in";
    submitProgress.hidden = !loading;
  }

  function showLogin(message, kind) {
    loginView.hidden = false;
    accountView.hidden = true;
    if (message) setStatus(loginStatus, message, kind || "warning");
    emailInput.focus({ preventScroll: true });
  }

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createBrand() {
    const brand = element("a", "brand account-brand");
    brand.href = "#account-panel";
    brand.setAttribute("aria-label", "NASMS account");
    brand.append(element("span", "brand-mark", "N"));
    const text = element("span", "brand__text");
    text.append(element("span", "brand__name", "NASMS"));
    text.append(element("span", "brand__descriptor", "National Agricultural Support & Monitoring System"));
    brand.append(text);
    return brand;
  }

  function createAccountLink(className) {
    const link = element("a", className || "nav-link", "My account");
    link.href = "#account-panel";
    link.setAttribute("aria-current", "page");
    return link;
  }

  function renderHeader(user) {
    const headerMount = document.getElementById("app-header");
    const header = element("header", "site-header app-shell");
    header.append(createBrand());

    const nav = element("nav", "primary-nav");
    nav.setAttribute("aria-label", "Main navigation");
    nav.append(createAccountLink("nav-link"));
    header.append(nav);

    const mobileNav = element("details", "mobile-nav");
    const summary = element("summary", "mobile-nav__summary", "Menu");
    summary.setAttribute("aria-label", "Toggle navigation menu");
    const panel = element("div", "mobile-nav__panel");
    panel.append(createAccountLink("nav-link"));
    mobileNav.append(summary, panel);
    header.append(mobileNav);

    const actions = element("div", "header-actions");
    const chip = element("div", "user-chip");
    chip.append(element("span", "user-chip__name", user.userName || user.emailAddress));
    chip.append(element("span", "user-chip__role", user.role));
    actions.append(chip);

    const roleBadge = element("span", "badge badge--success", user.role);
    roleBadge.setAttribute("aria-label", "Account role: " + user.role);
    actions.append(roleBadge);

    const logoutButton = element("button", "button button--secondary button--small", "Sign out");
    logoutButton.type = "button";
    logoutButton.addEventListener("click", function () {
      logout("You have signed out.");
    });
    actions.append(logoutButton);
    header.append(actions);

    headerMount.replaceChildren(header);
  }

  function renderIdentity(user) {
    identityDetails.replaceChildren();
    [
      ["Name", user.userName],
      ["Email address", user.emailAddress],
      ["Role", user.role],
      ["Account ID", user.id]
    ].forEach(function ([label, value]) {
      const item = element("div", "identity-item");
      item.append(element("dt", "", label));
      item.append(element("dd", "", String(value)));
      identityDetails.append(item);
    });

    const roleDescription = user.role === "ADMIN" ? "Administrator account" : "Farmer account";
    document.getElementById("session-intro").textContent = "Signed in as " + (user.userName || user.emailAddress) + ". " + roleDescription + ".";
  }

  function showAccount(user) {
    currentUser = user;
    renderHeader(user);
    renderIdentity(user);
    loginView.hidden = true;
    accountView.hidden = false;
    setStatus(accountStatus, "", "");
    document.getElementById("account-panel").focus({ preventScroll: true });
  }

  function validUserResponse(user) {
    return Boolean(
      user &&
      (user.role === "FARMER" || user.role === "ADMIN") &&
      user.id !== undefined &&
      typeof user.emailAddress === "string" &&
      typeof user.userName === "string"
    );
  }

  async function fetchCurrentUser(token) {
    const response = await fetch(apiUrl("/api/auth/me"), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token
      }
    });

    if (response.status === 401 || response.status === 403) {
      clearToken();
      const error = new Error("Your sign-in has expired. Please sign in again.");
      error.authFailure = true;
      throw error;
    }
    if (!response.ok) throw new Error("NASMS could not verify this account right now.");

    const user = await response.json();
    if (!validUserResponse(user)) {
      clearToken();
      throw new Error("This account has an unsupported role or incomplete profile.");
    }
    return user;
  }

  function validateForm() {
    clearFieldErrors();
    let firstInvalid = null;

    if (!emailInput.value.trim()) {
      setFieldError(emailInput, "Enter your email address.");
      firstInvalid = emailInput;
    } else if (!emailInput.validity.valid) {
      setFieldError(emailInput, "Enter a valid email address.");
      firstInvalid = emailInput;
    }

    if (!passwordInput.value) {
      setFieldError(passwordInput, "Enter your password.");
      firstInvalid = firstInvalid || passwordInput;
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return false;
    }
    return true;
  }

  async function submitLogin(event) {
    event.preventDefault();
    setStatus(loginStatus, "", "");
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: {
          Accept: "text/plain",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          emailAddress: emailInput.value.trim(),
          password: passwordInput.value
        })
      });

      if (response.status === 401) {
        setStatus(loginStatus, "The email address or password was not accepted.", "error");
        passwordInput.focus();
        return;
      }
      if (!response.ok) {
        setStatus(loginStatus, "NASMS could not complete sign-in. Please try again.", "error");
        return;
      }

      const token = (await response.text()).trim();
      if (token.split(".").length !== 3 || token.split(".").some(function (part) { return !part; })) {
        setStatus(loginStatus, "NASMS returned an unexpected sign-in response.", "error");
        return;
      }
      if (!storeToken(token)) {
        setStatus(loginStatus, "This browser could not securely keep your session. Enable session storage and try again.", "error");
        return;
      }

      try {
        const user = await fetchCurrentUser(token);
        showAccount(user);
      } catch (error) {
        if (error.authFailure) {
          setStatus(loginStatus, error.message, "warning");
        } else {
          setStatus(loginStatus, error.message || "Sign-in succeeded, but NASMS could not verify the account.", "warning");
        }
      }
    } catch {
      setStatus(loginStatus, "Unable to reach NASMS. Check your connection and try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  function logout(message) {
    clearToken();
    currentUser = null;
    loginForm.reset();
    clearFieldErrors();
    setStatus(accountStatus, "", "");
    setStatus(loginStatus, message || "", message ? "success" : "");
    showLogin();
  }

  async function restoreSession() {
    const token = getToken();
    if (!token) return;

    try {
      const user = await fetchCurrentUser(token);
      showAccount(user);
    } catch (error) {
      if (error.authFailure) {
        setStatus(loginStatus, "Your session has expired. Please sign in again.", "warning");
      } else {
        setStatus(loginStatus, error.message || "Unable to verify your saved session.", "warning");
      }
    }
  }

  loginForm.addEventListener("submit", submitLogin);
  emailInput.addEventListener("input", function () { setFieldError(emailInput, ""); });
  passwordInput.addEventListener("input", function () { setFieldError(passwordInput, ""); });
  passwordToggle.addEventListener("click", function () {
    const showing = passwordInput.type === "password";
    passwordInput.type = showing ? "text" : "password";
    passwordToggle.textContent = showing ? "Hide" : "Show";
    passwordToggle.setAttribute("aria-label", showing ? "Hide password" : "Show password");
    passwordToggle.setAttribute("aria-pressed", String(showing));
    passwordInput.focus({ preventScroll: true });
  });

  window.nasmsAuth = Object.freeze({
    getToken: getToken,
    getUser: function () { return currentUser; },
    getApiBase: function () { return API_BASE; },
    logout: logout,
    authorizedFetch: async function (path, options) {
      const token = getToken();
      if (!token) {
        showLogin("Please sign in to continue.", "warning");
        throw new Error("Authentication required");
      }

      const requestOptions = options || {};
      const headers = new Headers(requestOptions.headers || {});
      headers.set("Authorization", "Bearer " + token);
      const response = await fetch(apiUrl(path), Object.assign({}, requestOptions, { headers: headers }));

      if (response.status === 401) {
        logout("Your session has expired. Please sign in again.");
        throw new Error("Authentication expired");
      }
      return response;
    }
  });

  restoreSession();
})();
