(function () {
  "use strict";

  const form = document.getElementById("mpesa-payment-form");
  const unavailable = document.getElementById("mpesa-unavailable");
  const loanSelect = document.getElementById("mpesa-loan-choice");
  const loanSummary = document.getElementById("mpesa-loan-summary");
  const phoneInput = document.getElementById("mpesa-phone-number");
  const amountInput = document.getElementById("mpesa-amount");
  const confirmInput = document.getElementById("mpesa-confirm-send");
  const submitButton = document.getElementById("mpesa-submit");
  const statusNotice = document.getElementById("mpesa-payment-status");
  const requestResult = document.getElementById("mpesa-request-result");
  const recordsTarget = document.getElementById("mpesa-payment-records");
  const refreshButton = document.getElementById("mpesa-refresh-loans");
  let currentUser = null;
  let loans = [];
  let activeLoan = null;
  let busy = false;

  function node(tag, className, text) {
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

  function setStatus(message, type) {
    statusNotice.textContent = message || "";
    statusNotice.hidden = !message;
    statusNotice.classList.remove("notice--success", "notice--warning", "notice--error");
    if (type) statusNotice.classList.add("notice--" + type);
  }

  function setBusy(value) {
    busy = value;
    form.setAttribute("aria-busy", String(value));
    Array.from(form.elements).forEach(function (control) { control.disabled = value; });
    refreshButton.disabled = value;
    submitButton.textContent = value ? "Sending prompt..." : "Send M-Pesa prompt";
    updateSubmitButton();
  }

  function selectedLoan() {
    return loans.find(function (loan) { return String(loan.id) === loanSelect.value; }) || null;
  }

  function updateSubmitButton() {
    submitButton.disabled = busy || !activeLoan || !confirmInput.checked;
  }

  function formatValue(value) {
    return value === null || value === undefined || value === "" ? "Not provided" : String(value);
  }

  function detail(label, value) {
    const item = node("div", "loan-detail");
    item.append(node("dt", "", label));
    item.append(node("dd", "", formatValue(value)));
    return item;
  }

  function renderLoanSummary() {
    activeLoan = selectedLoan();
    loanSummary.replaceChildren();
    requestResult.hidden = true;
    setStatus("", "");
    if (!activeLoan) {
      loanSummary.hidden = true;
      updateSubmitButton();
      return;
    }

    const accountReference = "LOAN-" + activeLoan.id;
    loanSummary.append(detail("Loan reference", accountReference));
    loanSummary.append(detail("Remaining balance", activeLoan.remainingBalance));
    loanSummary.hidden = false;
    amountInput.max = String(activeLoan.remainingBalance);
    updateSubmitButton();
  }

  function renderPaymentRecords() {
    recordsTarget.replaceChildren();
    const rows = loans.flatMap(function (loan) {
      return (Array.isArray(loan.loanPayments) ? loan.loanPayments : []).map(function (payment) {
        return { loanId: loan.id, payment: payment };
      });
    });
    if (!rows.length) {
      recordsTarget.append(node("p", "dashboard-empty", loans.length ? "No payment records were included in the returned loan details." : "Load your loans to see payment records, if returned."));
      return;
    }

    rows.forEach(function (item) {
      const row = node("article", "loan-payment-record");
      const summary = ["Loan " + item.loanId, item.payment.amountToPay, item.payment.paymentMethod, item.payment.paymentDate].filter(Boolean).join(" | ");
      row.append(node("span", "", summary));
      row.append(node("span", "badge " + paymentStatusClass(item.payment.status), item.payment.status || "Unknown"));
      if (item.payment.mpesaReceiptNumber) row.append(node("span", "", "Receipt: " + item.payment.mpesaReceiptNumber));
      recordsTarget.append(row);
    });
  }

  function paymentStatusClass(status) {
    if (status === "COMPLETED") return "badge--success";
    if (status === "FAILED") return "badge--danger";
    if (status === "PENDING") return "badge--warning";
    return "badge--neutral";
  }

  function setLoans(value) {
    loans = Array.isArray(value) ? value : [];
    const previous = loanSelect.value;
    const payableLoans = loans.filter(function (loan) {
      return loan && loan.id !== undefined && Number.isFinite(Number(loan.remainingBalance)) && Number(loan.remainingBalance) > 0;
    });
    loanSelect.replaceChildren(new Option("Choose a loan", ""));
    payableLoans.forEach(function (loan) {
      loanSelect.add(new Option("Loan " + loan.id + " | Remaining " + loan.remainingBalance, String(loan.id)));
    });
    if (payableLoans.some(function (loan) { return String(loan.id) === previous; })) loanSelect.value = previous;
    unavailable.hidden = payableLoans.length > 0;
    if (!payableLoans.length) {
      unavailable.textContent = loans.length ? "No returned loan has a positive remaining balance available for payment." : "Load your farmer loans in the loan section before starting a payment.";
      form.hidden = true;
    } else {
      form.hidden = false;
    }
    renderLoanSummary();
    renderPaymentRecords();
  }

  function responseMessage(response) {
    const description = response.responseDescription && response.responseDescription !== "null" ? response.responseDescription : "";
    const customer = response.customerMessage && response.customerMessage !== "null" ? response.customerMessage : "";
    return [description, customer].filter(Boolean).join(" ");
  }

  async function readError(response) {
    const raw = await response.text();
    let message = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      message = typeof parsed === "string" ? parsed : parsed && (parsed.message || parsed.error) || raw;
    } catch {}
    const normalized = String(message).toLowerCase();
    if (response.status === 403 || normalized.includes("access denied")) return "This loan does not belong to the signed-in account.";
    if (response.status === 404 || normalized.includes("loan does not exist")) return "The selected loan could not be found.";
    if (normalized.includes("amount exceeds")) return "The amount is greater than the loan's remaining balance.";
    if (normalized.includes("amount must")) return "Enter an amount greater than zero.";
    if (normalized.includes("phone number") || normalized.includes("invalid kenyan phone")) return "Enter a Kenyan phone number beginning with 07, 01, 254, or +254.";
    return "NASMS could not start the M-Pesa prompt. Review the details and try again.";
  }

  function renderResponse(response) {
    requestResult.replaceChildren();
    const code = response.responseCode;
    if (code !== "0") {
      setStatus(responseMessage(response) || "M-Pesa did not accept the STK request.", "error");
      requestResult.hidden = true;
      return;
    }

    setStatus("STK request accepted. Complete the prompt on your phone. This does not confirm that payment has completed.", "success");
    requestResult.append(node("p", "eyebrow", "M-Pesa prompt initiated"));
    requestResult.append(node("p", "muted", responseMessage(response) || "Check your phone for the M-Pesa prompt."));
    requestResult.append(detail("Loan account reference", "LOAN-" + activeLoan.id));
    requestResult.append(detail("Merchant request ID", response.merchantRequestId));
    requestResult.append(detail("Checkout request ID", response.checkoutRequestId));
    requestResult.append(detail("Response code", code));
    requestResult.hidden = false;
  }

  async function submitPayment(event) {
    event.preventDefault();
    fieldError(phoneInput, "");
    fieldError(amountInput, "");
    setStatus("", "");
    const loan = selectedLoan();
    const phoneNumber = phoneInput.value.trim();
    const amountText = amountInput.value.trim();
    const amount = Number(amountText);
    let invalid = false;

    if (!loan) {
      setStatus("Select one of your loaded loans before starting payment.", "error");
      return;
    }
    if (!/^(?:(?:07|01)\d+|\+?254\d+)$/.test(phoneNumber)) {
      fieldError(phoneInput, "Enter digits with a supported Kenyan prefix: 07, 01, 254, or +254.");
      invalid = true;
    }
    if (!amountText || !Number.isInteger(amount) || amount <= 0) {
      fieldError(amountInput, "Enter a whole-shilling amount greater than zero.");
      invalid = true;
    } else if (amount > Number(loan.remainingBalance)) {
      fieldError(amountInput, "Amount cannot exceed the remaining balance shown for this loan.");
      invalid = true;
    }
    if (!confirmInput.checked) {
      setStatus("Confirm the loan, amount, and phone number before sending an M-Pesa prompt.", "warning");
      invalid = true;
    }
    if (invalid) return;

    setBusy(true);
    try {
      const response = await window.nasmsAuth.authorizedFetch("/api/loan-payments/mpesa/" + encodeURIComponent(loan.id), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount, phoneNumber: phoneNumber })
      });
      if (!response.ok) {
        const error = new Error(await readError(response));
        if (response.status === 400) fieldError(amount > Number(loan.remainingBalance) ? amountInput : phoneInput, error.message);
        throw error;
      }
      const result = await response.json();
      if (!result || result.responseCode === undefined || result.checkoutRequestId === undefined) {
        throw new Error("NASMS returned an incomplete STK response.");
      }
      renderResponse(result);
    } catch (error) {
      if (error.message === "Authentication expired") return;
      setStatus(error.message || "Unable to reach NASMS. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  function open() {
    document.getElementById("loan-payment-details").scrollIntoView({ behavior: "smooth", block: "start" });
    loanSelect.focus({ preventScroll: true });
  }

  loanSelect.addEventListener("change", renderLoanSummary);
  confirmInput.addEventListener("change", updateSubmitButton);
  phoneInput.addEventListener("input", function () { fieldError(phoneInput, ""); });
  amountInput.addEventListener("input", function () { fieldError(amountInput, ""); });
  form.addEventListener("submit", submitPayment);
  refreshButton.addEventListener("click", function () {
    if (window.nasmsLoans && typeof window.nasmsLoans.refresh === "function") window.nasmsLoans.refresh();
  });
  document.addEventListener("click", function (event) {
    const link = event.target.closest('a[href="#loan-payment-details"]');
    if (!link) return;
    event.preventDefault();
    if (window.nasmsLoans) window.nasmsLoans.open();
    open();
  });

  window.nasmsPayments = Object.freeze({
    render: function (user) {
      currentUser = user;
      if (!user || user.role !== "FARMER") {
        form.hidden = true;
        unavailable.hidden = false;
      }
    },
    setLoans: setLoans,
    open: open
  });
})();
