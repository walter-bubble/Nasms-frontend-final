(function () {
  "use strict";

  const apiBase = (document.querySelector('meta[name="nasms-api-base"]')?.content || "").replace(/\/+$/, "");
  const form = document.getElementById("registration-form");
  const status = document.getElementById("registration-status");
  const success = document.getElementById("registration-success");
  const summary = document.getElementById("registration-summary");
  const submit = document.getElementById("registration-submit");
  const submitLabel = submit.querySelector(".registration-submit__label");
  const progress = submit.querySelector(".auth-submit__progress");
  const password = document.getElementById("register-password");
  const fields = {
    userName: document.getElementById("register-user-name"),
    emailAddress: document.getElementById("register-email"),
    password: password,
    nationalId: document.getElementById("register-national-id"),
    phoneNumber: document.getElementById("register-phone"),
    farmSize: document.getElementById("register-farm-size")
  };

  function fieldError(input, message) {
    const error = document.getElementById(input.id + "-error");
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (error) {
      error.textContent = message || "";
      error.hidden = !message;
    }
  }

  function clearErrors() {
    Object.values(fields).forEach(function (input) { fieldError(input, ""); });
  }

  function showStatus(message, type) {
    status.textContent = message || "";
    status.hidden = !message;
    status.classList.remove("notice--success", "notice--warning", "notice--error");
    if (type) status.classList.add("notice--" + type);
  }

  function validate() {
    clearErrors();
    showStatus("", "");
    let firstInvalid = null;

    ["userName", "emailAddress", "password", "nationalId"].forEach(function (key) {
      if (!fields[key].value.trim()) {
        fieldError(fields[key], "This field is required.");
        firstInvalid = firstInvalid || fields[key];
      }
    });

    const emailAddress = fields.emailAddress.value.trim();
    if (emailAddress && !fields.emailAddress.validity.valid) {
      fieldError(fields.emailAddress, "Enter a valid email address.");
      firstInvalid = firstInvalid || fields.emailAddress;
    }

    const nationalIdText = fields.nationalId.value.trim();
    const nationalId = Number(nationalIdText);
    if (nationalIdText && (!/^\d+$/.test(nationalIdText) || !Number.isSafeInteger(nationalId))) {
      fieldError(fields.nationalId, "Enter a whole-number national ID within the supported numeric range.");
      firstInvalid = firstInvalid || fields.nationalId;
    }

    const phoneNumber = fields.phoneNumber.value.trim();
    if (phoneNumber && !/^\+?[\d\s().-]+$/.test(phoneNumber)) {
      fieldError(fields.phoneNumber, "Use digits and common phone separators only.");
      firstInvalid = firstInvalid || fields.phoneNumber;
    }

    const farmSizeText = fields.farmSize.value.trim();
    const farmSize = farmSizeText ? Number(farmSizeText) : 0;
    if (farmSizeText && !Number.isFinite(farmSize)) {
      fieldError(fields.farmSize, "Enter a valid numeric farm size.");
      firstInvalid = firstInvalid || fields.farmSize;
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return null;
    }

    return {
      userName: fields.userName.value.trim(),
      emailAddress: emailAddress,
      password: fields.password.value,
      name: document.getElementById("register-name").value.trim(),
      county: document.getElementById("register-county").value.trim(),
      titleNumber: document.getElementById("register-title-number").value.trim(),
      nationalId: nationalId,
      phoneNumber: phoneNumber,
      farmSize: farmSize
    };
  }

  function setLoading(loading) {
    form.setAttribute("aria-busy", String(loading));
    form.querySelectorAll("input, button").forEach(function (control) { control.disabled = loading; });
    submitLabel.textContent = loading ? "Creating account..." : "Create farmer account";
    progress.hidden = !loading;
  }

  function addSummary(label, value) {
    const row = document.createElement("div");
    row.className = "registration-summary__row";
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = String(value);
    row.append(term, description);
    summary.append(row);
  }

  function showSuccess(account) {
    form.hidden = true;
    success.hidden = false;
    summary.replaceChildren();
    addSummary("Account ID", account.id);
    addSummary("Username", account.userName);
    addSummary("Email address", account.emailAddress);
    addSummary("Role", account.role);
    password.value = "";
    success.querySelector("h3").focus({ preventScroll: true });
  }

  async function register(event) {
    event.preventDefault();
    const request = validate();
    if (!request) return;

    setLoading(true);
    try {
      const response = await fetch(apiBase + "/api/auth/register", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      const bodyText = await response.text();
      let result;
      try { result = bodyText ? JSON.parse(bodyText) : null; }
      catch { result = bodyText.replace(/^"|"$/g, "").trim(); }

      if (!response.ok) {
        const message = typeof result === "string" ? result.toLowerCase() : "";
        if (message === "user exists") {
          fieldError(fields.emailAddress, "An account with this email already exists.");
          showStatus("This email address is already registered. Sign in with that account instead.", "error");
          fields.emailAddress.focus();
        } else if (message === "username exists") {
          fieldError(fields.userName, "This username is already in use.");
          showStatus("That username is already in use. Choose another username.", "error");
          fields.userName.focus();
        } else {
          showStatus("NASMS could not create the account. Check your details and try again.", "error");
        }
        return;
      }

      if (!result || result.id === undefined || !result.userName || !result.emailAddress || result.role !== "FARMER") {
        showStatus("NASMS returned an unexpected registration response. Please contact support.", "error");
        return;
      }

      showStatus("", "");
      showSuccess(result);
    } catch {
      showStatus("Unable to reach NASMS. Check your connection and try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  form.addEventListener("submit", register);
  Object.values(fields).forEach(function (input) {
    input.addEventListener("input", function () { fieldError(input, ""); });
  });

  const toggle = document.getElementById("registration-password-toggle");
  toggle.addEventListener("click", function () {
    const reveal = password.type === "password";
    password.type = reveal ? "text" : "password";
    toggle.textContent = reveal ? "Hide" : "Show";
    toggle.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    toggle.setAttribute("aria-pressed", String(reveal));
    password.focus({ preventScroll: true });
  });
})();
