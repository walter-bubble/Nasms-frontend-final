(function () {
  "use strict";

  const module = document.getElementById("loan-module");
  const packagesTarget = document.getElementById("loan-package-catalog");
  const recordsTarget = document.getElementById("farmer-loan-records");
  const nationalIdInput = document.getElementById("loan-national-id");
  const packageSelect = document.getElementById("loan-package-choice");
  const lookupForm = document.getElementById("loan-national-id-form");
  const applicationForm = document.getElementById("loan-application-form");
  const lookupStatus = document.getElementById("loan-record-status");
  const applicationStatus = document.getElementById("loan-application-status");
  const lookupButton = document.getElementById("load-farmer-loans");
  const applicationButton = document.getElementById("submit-loan-application");
  let user = null;
  let packages = [];
  let loans = [];
  let packagesLoaded = false;
  let loansLoaded = false;
  const loanPackageImages = [
    { src: "assets/images/loans/young-seedlings.jpg", alt: "Rows of young seedlings growing in prepared soil" },
    { src: "assets/images/loans/golden-crop-field.jpg", alt: "Golden crop field at sunset" },
    { src: "assets/images/loans/fresh-produce.jpg", alt: "Freshly harvested vegetables and produce" }
  ];

  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function fieldError(input, message) {
    const target = document.getElementById(input.id + "-error");
    input.setAttribute("aria-invalid", message ? "true" : "false");
    target.textContent = message || "";
    target.hidden = !message;
  }

  function setNotice(target, message, kind) {
    target.textContent = message || "";
    target.hidden = !message;
    target.classList.remove("notice--success", "notice--warning", "notice--error");
    if (kind) target.classList.add("notice--" + kind);
  }

  function loading(target, message) {
    target.setAttribute("aria-busy", "true");
    target.replaceChildren(element("p", "dashboard-loading", message));
  }

  function empty(target, message) {
    target.setAttribute("aria-busy", "false");
    target.replaceChildren(element("p", "dashboard-empty", message));
  }

  function errorState(target, message, retry) {
    target.setAttribute("aria-busy", "false");
    const state = element("div", "dashboard-error");
    state.append(element("p", "", message));
    const button = element("button", "button button--secondary button--small dashboard-retry", "Try again");
    button.type = "button";
    button.addEventListener("click", retry);
    state.append(button);
    target.replaceChildren(state);
  }

  function setBusy(form, button, busy, busyText, idleText) {
    form.setAttribute("aria-busy", String(busy));
    button.disabled = busy || (button === applicationButton && hasActiveLoan());
    button.textContent = busy ? busyText : idleText;
  }

  function hasActiveLoan() {
    return loansLoaded && loans.some(function (loan) { return loan.status === "ACTIVE"; });
  }

  function updateApplicationButton() {
    applicationButton.disabled = !packages.length || hasActiveLoan() || applicationForm.dataset.busy === "true";
  }

  function parseNationalId() {
    const nationalId = nationalIdInput.value.trim();
    if (!/^\d+$/.test(nationalId)) {
      fieldError(nationalIdInput, "Enter your National ID using digits only.");
      nationalIdInput.focus();
      return null;
    }
    fieldError(nationalIdInput, "");
    return nationalId;
  }

  async function backendError(response) {
    const bodyText = await response.text();
    let message = "";
    try {
      const body = bodyText ? JSON.parse(bodyText) : null;
      message = typeof body === "string" ? body : body && (body.message || body.error) || "";
    } catch {
      message = bodyText;
    }
    const normalized = String(message).toLowerCase();
    if (normalized.includes("no active season")) return "NASMS has no active season for loan applications right now.";
    if (normalized.includes("only during active season")) return "Loan applications are accepted only during an active season.";
    if (normalized.includes("budget exceeded")) return "This application could not be accepted because the season budget is exceeded.";
    if (normalized.includes("already have a loan")) return "You already have an active loan. The backend does not allow another active loan application.";
    if (normalized.includes("farmer not found")) return "No farmer record was found for that National ID.";
    if (response.status === 403 || normalized.includes("access denied")) return "The National ID must belong to the signed-in farmer.";
    if (response.status === 404) return "The selected loan package or loan record could not be found.";
    return "NASMS could not complete this loan request. Please try again.";
  }

  async function getJson(path) {
    const response = await window.nasmsAuth.authorizedFetch(path, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(await backendError(response));
    return response.json();
  }

  function detail(label, value) {
    const wrapper = element("div", "loan-detail");
    wrapper.append(element("dt", "", label));
    wrapper.append(element("dd", "", value === null || value === undefined || value === "" ? "Not provided" : String(value)));
    return wrapper;
  }

  function packageCard(item, index) {
    const card = element("article", "loan-package-card");
    const visual = element("div", "loan-package-card__visual");
    const image = element("img", "");
    const photo = loanPackageImages[index % loanPackageImages.length];
    image.src = photo.src;
    image.alt = photo.alt;
    image.loading = "lazy";
    visual.append(image);
    visual.append(element("span", "loan-package-card__visual-label", "Seasonal farm financing"));
    card.append(visual);

    const content = element("div", "loan-package-card__content");
    content.append(element("h4", "", item.description || "Loan package"));
    content.append(element("span", "loan-package-card__amount-label", "Package amount"));
    content.append(element("p", "loan-package-amount", item.amount === null || item.amount === undefined ? "Not provided" : String(item.amount)));
    const summary = element("dl", "loan-detail-grid");
    summary.append(detail("Interest rate", item.interestRate === null || item.interestRate === undefined ? null : item.interestRate + "%"));
    summary.append(detail("Duration", item.durationMonths === null || item.durationMonths === undefined ? null : item.durationMonths + " months"));
    summary.append(detail("Season", item.farmingSeason && item.farmingSeason.seasonName));
    if (item.farmingSeason && typeof item.farmingSeason.active === "boolean") {
      summary.append(detail("Season status", item.farmingSeason.active ? "Active" : "Inactive"));
    }
    content.append(summary);

    const details = element("details", "");
    details.append(element("summary", "", "View details"));
    const fullDetails = element("dl", "loan-detail-grid");
    fullDetails.append(detail("Monthly penalty", item.monthlyPenalty));
    fullDetails.append(detail("Minimum farm size", item.minimumFarmSize));
    fullDetails.append(detail("Maximum farm size", item.maximumFarmSize));
    details.append(fullDetails);
    content.append(details);

    const actions = element("div", "loan-package-card__actions");
    const apply = element("button", "button button--primary button--small", "Apply");
    apply.type = "button";
    apply.setAttribute("aria-label", "Apply for " + (item.description || "this loan package"));
    apply.addEventListener("click", function () {
      packageSelect.value = String(item.id);
      fieldError(packageSelect, "");
      applicationForm.scrollIntoView({ behavior: "smooth", block: "center" });
      if (nationalIdInput.value.trim()) applicationButton.focus({ preventScroll: true });
      else nationalIdInput.focus({ preventScroll: true });
    });
    actions.append(apply);
    content.append(actions);
    card.append(content);
    return card;
  }

  async function loadPackages() {
    loading(packagesTarget, "Loading loan packages...");
    packagesLoaded = false;
    updateApplicationButton();
    try {
      const result = await getJson("/api/loan-package");
      if (!Array.isArray(result)) throw new Error("Unable to load loan packages. Please try again.");
      packages = result;
      packagesLoaded = true;
      packageSelect.replaceChildren(new Option("Choose a loan package", ""));
      packages.forEach(function (item) {
        const option = new Option(item.description || "Loan package", String(item.id));
        packageSelect.add(option);
      });
      if (!packages.length) empty(packagesTarget, "No loan packages are currently listed.");
      else {
        packagesTarget.setAttribute("aria-busy", "false");
        packagesTarget.replaceChildren(...packages.map(packageCard));
      }
      updateApplicationButton();
    } catch (error) {
      errorState(packagesTarget, error.message || "Unable to load loan packages. Please try again.", loadPackages);
    }
  }

  function statusBadge(status) {
    const classes = {
      ACTIVE: "badge--info",
      APPROVED: "badge--success",
      COMPLETED: "badge--success",
      OVERDUE: "badge--danger",
      CANCELED: "badge--neutral"
    };
    return element("span", "badge " + (classes[status] || "badge--neutral"), status || "Unknown");
  }

  function paymentHistory(payments) {
    if (!Array.isArray(payments) || payments.length === 0) return null;
    const section = element("section", "loan-payment-history");
    section.append(element("h5", "", "Payment records"));
    payments.forEach(function (payment) {
      const row = element("div", "loan-payment-record");
      const details = [payment.paymentDate, payment.amountToPay, payment.paymentMethod, payment.status].filter(function (value) { return value !== null && value !== undefined && value !== ""; });
      row.append(element("span", "", details.length ? details.join(" · ") : "Payment record"));
      if (payment.remainingBalance !== null && payment.remainingBalance !== undefined) row.append(element("span", "", "Remaining balance: " + payment.remainingBalance));
      section.append(row);
    });
    return section;
  }

  function loanCard(loan) {
    const card = element("article", "loan-record-card");
    const top = element("div", "loan-record-card__top");
    top.append(element("h4", "", "Loan " + (loan.id === undefined ? "record" : loan.id)));
    top.append(statusBadge(loan.status));
    card.append(top);
    const metadata = element("dl", "loan-detail-grid");
    metadata.append(detail("Amount", loan.amount));
    metadata.append(detail("Interest rate", loan.interestRate === null || loan.interestRate === undefined ? null : loan.interestRate + "%"));
    metadata.append(detail("Total payment", loan.totalPayment));
    metadata.append(detail("Remaining balance", loan.remainingBalance));
    metadata.append(detail("Duration", loan.durationMonths === null || loan.durationMonths === undefined ? null : loan.durationMonths + " months"));
    metadata.append(detail("Due date", loan.dueDate));
    const seasonName = loan.farmingSeason && loan.farmingSeason.seasonName;
    metadata.append(detail("Season", seasonName));
    card.append(metadata);
    const history = paymentHistory(loan.loanPayments);
    if (history) card.append(history);
    return card;
  }

  async function loadLoans() {
    const nationalId = parseNationalId();
    if (!nationalId) return;
    setNotice(lookupStatus, "", "");
    loading(recordsTarget, "Loading loans from NASMS...");
    if (window.nasmsDashboard) window.nasmsDashboard.setLoansLoading();
    lookupButton.disabled = true;
    lookupButton.textContent = "Loading loans...";
    try {
      const result = await getJson("/api/loans/farmer/" + encodeURIComponent(nationalId));
      if (!Array.isArray(result)) throw new Error("Unable to read loan records from NASMS.");
      loans = result;
      loansLoaded = true;
      if (window.nasmsPayments) window.nasmsPayments.setLoans(loans);
      if (window.nasmsDashboard) window.nasmsDashboard.setLoans(loans);
      nationalIdInput.dataset.loadedId = nationalId;
      if (loans.length) {
        recordsTarget.setAttribute("aria-busy", "false");
        recordsTarget.replaceChildren(...loans.map(loanCard));
      } else {
        empty(recordsTarget, "No loan records were returned for this farmer.");
      }
      updateApplicationButton();
      if (hasActiveLoan()) setNotice(lookupStatus, "An ACTIVE loan is already linked to this farmer record. NASMS does not allow another active loan application.", "warning");
    } catch (error) {
      loansLoaded = false;
      loans = [];
      updateApplicationButton();
      if (window.nasmsPayments) window.nasmsPayments.setLoans(loans);
      if (window.nasmsDashboard) window.nasmsDashboard.setLoanError(error.message);
      errorState(recordsTarget, error.message || "Unable to load loan records. Please try again.", loadLoans);
    } finally {
      lookupButton.disabled = false;
      lookupButton.textContent = "Load my loans";
    }
  }

  function applicationError(message) {
    const target = document.getElementById("loan-package-choice-error");
    target.textContent = message;
    target.hidden = !message;
    packageSelect.setAttribute("aria-invalid", message ? "true" : "false");
  }

  async function applyForPackage(event) {
    event.preventDefault();
    applicationError("");
    setNotice(applicationStatus, "", "");
    const nationalId = parseNationalId();
    const packageId = packageSelect.value;
    if (!nationalId) return;
    if (!packageId) {
      applicationError("Select a loan package.");
      packageSelect.focus();
      return;
    }
    if (hasActiveLoan()) {
      setNotice(applicationStatus, "An ACTIVE loan is already linked to this farmer record. NASMS does not allow another active loan application.", "warning");
      return;
    }

    applicationForm.dataset.busy = "true";
    setBusy(applicationForm, applicationButton, true, "Submitting...", "Apply to selected package");
    try {
      const response = await window.nasmsAuth.authorizedFetch(
        "/api/loans/" + encodeURIComponent(nationalId) + "/package/" + encodeURIComponent(packageId),
        { method: "POST", headers: { Accept: "application/json" } }
      );
      if (!response.ok) throw new Error(await backendError(response));
      const createdLoan = await response.json();
      if (!createdLoan || !createdLoan.loanId || createdLoan.status !== "ACTIVE") {
        throw new Error("NASMS returned an unexpected loan application response.");
      }
      setNotice(applicationStatus, "NASMS created loan " + createdLoan.loanId + " with status " + createdLoan.status + ".", "success");
      await loadLoans();
    } catch (error) {
      setNotice(applicationStatus, error.message || "Unable to submit the loan application. Please try again.", "error");
    } finally {
      applicationForm.dataset.busy = "false";
      setBusy(applicationForm, applicationButton, false, "Submitting...", "Apply to selected package");
    }
  }

  function open() {
    if (!user || user.role !== "FARMER") return;
    module.hidden = false;
    if (!packagesLoaded) loadPackages();
    module.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("loan-module-title").focus({ preventScroll: true });
  }

  lookupForm.addEventListener("submit", function (event) {
    event.preventDefault();
    loadLoans();
  });
  applicationForm.addEventListener("submit", applyForPackage);
  nationalIdInput.addEventListener("input", function () {
    fieldError(nationalIdInput, "");
    setNotice(lookupStatus, "", "");
    if (loansLoaded && nationalIdInput.value.trim() !== nationalIdInput.dataset.loadedId) {
      loansLoaded = false;
      loans = [];
      if (window.nasmsDashboard) window.nasmsDashboard.clearLoans();
      empty(recordsTarget, "Load loans for this National ID to view its records.");
      updateApplicationButton();
    }
  });
  nationalIdInput.addEventListener("change", function () {
    nationalIdInput.dataset.loadedId = nationalIdInput.value.trim();
  });
  document.addEventListener("click", function (event) {
    const link = event.target.closest('a[href="#loan-module"], a[href="#loan-payment-details"]');
    if (!link) return;
    event.preventDefault();
    open();
    if (link.hash === "#loan-payment-details") {
      document.getElementById("loan-payment-details").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  window.nasmsLoans = Object.freeze({
    refresh: loadLoans,
    getLoans: function () { return loansLoaded ? loans.slice() : []; },
    render: function (currentUser) {
      user = currentUser;
      if (user.role !== "FARMER") module.hidden = true;
    },
    open: open
  });
})();
