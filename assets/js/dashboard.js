(function () {
  "use strict";

  const root = document.getElementById("farmer-dashboard");
  const roleMessage = document.getElementById("dashboard-role-message");
  const loanSummary = document.getElementById("farmer-dashboard-loans");
  const accountDetails = document.getElementById("dashboard-account-details");
  let currentUser = null;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function populateNavigation() {
    const targets = [
      ["Overview", "#dashboard-overview"],
      ["My loans", "#farmer-loan-summary"],
      ["Loans", "#loan-module"],
      ["Marketplace", "#marketplace-module"],
      ["Loan payments", "#loan-payment-details"],
      ["Seasons", "#season-services"],
      ["My account", "#account-panel"]
    ];
    const nav = document.querySelector("#app-header .primary-nav");
    const mobile = document.querySelector("#app-header .mobile-nav__panel");
    const dashboardNav = document.getElementById("dashboard-nav");
    if (!nav || !mobile || !dashboardNav) return;

    [nav, mobile, dashboardNav].forEach(function (container) {
      container.replaceChildren();
      targets.forEach(function ([label, href], index) {
        const link = node("a", "nav-link", label);
        link.href = href;
        if (index === 0 && (container === nav || container === dashboardNav)) link.setAttribute("aria-current", "page");
        link.addEventListener("click", function () {
          [nav, mobile, dashboardNav].forEach(function (group) {
            group.querySelectorAll(".nav-link").forEach(function (item) {
              if (item.getAttribute("href") === href) item.setAttribute("aria-current", "page");
              else item.removeAttribute("aria-current");
            });
          });
          const menu = document.querySelector("#app-header .mobile-nav");
          if (menu) menu.open = false;
        });
        container.append(link);
      });
    });
  }

  function setLoading(target, label) {
    target.setAttribute("aria-busy", "true");
    target.replaceChildren(node("p", "dashboard-loading", label));
  }

  function setEmpty(target, message) {
    target.setAttribute("aria-busy", "false");
    target.replaceChildren(node("p", "dashboard-empty", message));
  }

  function setError(target, message, retry) {
    target.setAttribute("aria-busy", "false");
    const state = node("div", "dashboard-error");
    state.append(node("p", "", message));
    const button = node("button", "button button--secondary button--small dashboard-retry", "Try again");
    button.type = "button";
    button.addEventListener("click", retry);
    state.append(button);
    target.replaceChildren(state);
  }

  async function fetchCollection(path) {
    const response = await window.nasmsAuth.authorizedFetch(path, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error("Request failed");
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Unexpected response");
    return data;
  }

  function valueText(value) {
    return value === null || value === undefined || value === "" ? "Not provided" : String(value);
  }

  function renderAccount(user) {
    accountDetails.replaceChildren();
    [
      ["Name", user.userName],
      ["Email address", user.emailAddress],
      ["Role", user.role]
    ].forEach(function ([label, value]) {
      const item = node("div", "dashboard-profile__item");
      item.append(node("dt", "", label));
      item.append(node("dd", "", valueText(value)));
      accountDetails.append(item);
    });
  }

  function addMeta(record, label, value) {
    record.querySelector(".dashboard-record__meta").append(node("span", "", label + ": " + valueText(value)));
  }

  function loanRecord(item) {
    const record = node("article", "dashboard-record");
    record.append(node("h3", "dashboard-record__title", "Loan " + valueText(item.id)));
    record.append(node("div", "dashboard-record__meta"));
    addMeta(record, "Status", item.status);
    addMeta(record, "Amount (KES)", item.amount);
    addMeta(record, "Remaining balance (KES)", item.remainingBalance);
    addMeta(record, "Due date", item.dueDate);
    if (item.farmingSeason) addMeta(record, "Season", item.farmingSeason.seasonName);
    return record;
  }

  function listingRecord(item) {
    const record = node("article", "dashboard-record");
    record.append(node("h3", "dashboard-record__title", item.productName || "Marketplace listing"));

    record.append(node("div", "dashboard-record__meta"));
    addMeta(record, "Price", item.price);
    const action = node("a", "button button--secondary button--small", "Browse listings");
    action.href = "#marketplace-module";
    record.append(action);

    addMeta(record, "Quantity", item.quantity);
    if (item.sellerName) addMeta(record, "Seller", item.sellerName);
    return record;
  }

  function seasonRecord(item) {
    const record = node("article", "dashboard-record");
    record.append(node("h3", "dashboard-record__title", item.seasonName || "Farming season"));
    record.append(node("div", "dashboard-record__meta"));
    addMeta(record, "Start", item.startDate);
    addMeta(record, "End", item.endDate);
    addMeta(record, "Closed", item.closed);
    return record;
  }

  async function loadSection(path, targetId, emptyMessage, errorMessage, renderItem) {
    const target = document.getElementById(targetId);
    setLoading(target, "Loading NASMS information...");
    try {
      const items = await fetchCollection(path);
      target.setAttribute("aria-busy", "false");
      if (items.length === 0) {
        setEmpty(target, emptyMessage);
        return;
      }
      target.replaceChildren(...items.map(renderItem));
    } catch {
      setError(target, errorMessage, function () {
        loadSection(path, targetId, emptyMessage, errorMessage, renderItem);
      });
    }
  }

  async function loadPackageOverview() {
    const target = document.getElementById("loan-package-list");
    setLoading(target, "Loading NASMS loan packages...");
    try {
      const packages = await fetchCollection("/api/loan-package");
      target.setAttribute("aria-busy", "false");
      if (packages.length === 0) {
        setEmpty(target, "No loan packages are currently listed.");
        return;
      }
      const overview = node("article", "dashboard-record");
      overview.append(node("p", "dashboard-record__title", packages.length + (packages.length === 1 ? " package" : " packages") + " currently listed by NASMS."));
      const action = node("a", "button button--secondary button--small dashboard-loan-link", "View packages and apply");
      action.href = "#loan-module";
      overview.append(action);
      target.replaceChildren(overview);
    } catch {
      setError(target, "Unable to load loan packages. Please try again.", loadPackageOverview);
    }
  }

  function render(user) {
    if (!root || !roleMessage) return;
    if (user.role !== "FARMER") {
      root.hidden = true;
      currentUser = null;
      roleMessage.hidden = false;
      roleMessage.textContent = "This dashboard is for farmer accounts. Administrator-specific pages are separate.";
      return;
    }

    currentUser = user;
    roleMessage.hidden = true;
    root.hidden = false;
    document.getElementById("dashboard-title").textContent = "Welcome, " + (user.userName || user.emailAddress);
    document.getElementById("dashboard-account-welcome").textContent =
      "Welcome back, " + (user.userName || user.emailAddress) + ".";
    renderAccount(user);
    populateNavigation();
    loadPackageOverview();
    loadSection("/api/market-list/", "market-listings", "No marketplace listings are currently available.", "Unable to load marketplace listings. Please try again.", listingRecord);
    loadSection("/api/seasons", "farming-seasons", "No farming seasons are currently listed.", "Unable to load farming seasons. Please try again.", seasonRecord);
  }

  function setLoans(items) {
    if (!currentUser || currentUser.role !== "FARMER") return;
    loanSummary.setAttribute("aria-busy", "false");
    if (!items.length) {
      setEmpty(loanSummary, "NASMS returned no loan records for this farmer.");
      return;
    }
    loanSummary.replaceChildren(...items.map(loanRecord));
  }

  function setLoansLoading() {
    if (!currentUser || currentUser.role !== "FARMER") return;
    setLoading(loanSummary, "Loading your loan records from NASMS...");
  }

  function setLoanError(message) {
    if (!currentUser || currentUser.role !== "FARMER") return;
    setError(loanSummary, message || "Unable to load your loan records.", function () {
      const input = document.getElementById("loan-national-id");
      const module = document.getElementById("loan-module");
      if (window.nasmsLoans) window.nasmsLoans.open();
      if (input) input.focus({ preventScroll: true });
      if (module) module.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function clearLoans() {
    if (!currentUser || currentUser.role !== "FARMER") return;
    setEmpty(loanSummary, "Load your records in Loan services to see loans linked to your farmer account.");
  }

  window.nasmsDashboard = Object.freeze({
    render: render,
    setLoansLoading: setLoansLoading,
    setLoans: setLoans,
    setLoanError: setLoanError,
    clearLoans: clearLoans
  });
})();
