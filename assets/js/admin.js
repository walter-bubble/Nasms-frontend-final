(function () {
  "use strict";

  const root = document.getElementById("admin-dashboard");
  if (!root) return;

  const collections = {
    seasons: { path: "/api/seasons", target: "admin-seasons-state", empty: "No farming seasons were returned." },
    farmers: { path: "/api/farmers/", target: "admin-farmers-state", empty: "No farmer records were returned." },
    packages: { path: "/api/loan-package", target: "admin-package-state", empty: "No loan packages were returned." },
    loans: { path: "/api/loans", target: "admin-loans-state", empty: "No loan records were returned." },
    produce: { path: "/api/product/", target: "admin-produce-state", empty: "No produce records were returned." },
    listings: { path: "/api/market-list/", target: "admin-listings-state", empty: "No marketplace listings were returned." },
    transactions: { path: "/api/market/transactions/", target: "admin-transactions-state", empty: "No market transactions were returned." }
  };
  const records = {};
  const filters = {
    farmers: document.getElementById("admin-farmer-filter"),
    loans: document.getElementById("admin-loan-filter"),
    produce: document.getElementById("admin-produce-filter")
  };
  const packageForm = document.getElementById("admin-package-form");
  const packageMessage = document.getElementById("admin-package-message");
  const produceMessage = document.getElementById("admin-produce-message");
  const packageSubmit = document.getElementById("admin-package-submit");
  const packageCancel = document.getElementById("admin-package-cancel");
  const packageTitle = document.getElementById("admin-package-form-title");
  const seasonForm = document.getElementById("admin-season-form");
  const seasonMessage = document.getElementById("admin-season-message");
  const seasonSubmit = document.getElementById("admin-season-submit");
  const seasonCancel = document.getElementById("admin-season-cancel");
  const seasonTitle = document.getElementById("admin-season-form-title");
  const seasonBudgetField = document.getElementById("admin-season-budget-field");
  const seasonBudget = document.getElementById("admin-season-budget");
  const seasonEditNote = document.getElementById("admin-season-edit-note");
  const seasonStatus = document.getElementById("admin-season-status");
  const packageSeasonStatus = document.getElementById("admin-package-season-status");
  let editingPackageId = null;
  let packageBusy = false;
  let editingSeasonId = null;
  let seasonBusy = false;

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function display(value) {
    return value === null || value === undefined || value === "" ? "Not provided" : String(value);
  }

  function setNotice(target, message, kind) {
    target.textContent = message || "";
    target.hidden = !message;
    target.classList.remove("notice--success", "notice--warning", "notice--error");
    if (kind) target.classList.add("notice--" + kind);
  }

  function setLoading(target, message) {
    target.setAttribute("aria-busy", "true");
    target.replaceChildren(node("p", "dashboard-loading", message));
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

  async function readResponse(response) {
    const body = await response.text();
    if (!response.ok) {
      let detail = body;
      try {
        const parsed = body ? JSON.parse(body) : null;
        detail = typeof parsed === "string" ? parsed : parsed && (parsed.message || parsed.error) || body;
      } catch {}
      throw new Error("NASMS request failed (" + response.status + "). " + (detail || "Please try again."));
    }
    let result;
    try {
      result = body ? JSON.parse(body) : null;
    } catch {
      throw new Error("NASMS returned an unreadable response.");
    }
    if (!Array.isArray(result)) throw new Error("NASMS returned an unexpected record list.");
    return result;
  }

  async function fetchRecords(path) {
    const response = await window.nasmsAuth.authorizedFetch(path, {
      headers: { Accept: "application/json" }
    });
    return readResponse(response);
  }

  async function request(path, method, payload) {
    const options = {
      method: method,
      headers: { Accept: "application/json" }
    };
    if (payload !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(payload);
    }
    const response = await window.nasmsAuth.authorizedFetch(path, options);
    const body = await response.text();
    if (!response.ok) {
      let detail = body;
      try {
        const parsed = body ? JSON.parse(body) : null;
        detail = typeof parsed === "string" ? parsed : parsed && (parsed.message || parsed.error) || body;
      } catch {}
      throw new Error("NASMS request failed (" + response.status + "). " + (detail || "Please try again."));
    }
  }

  function filtered(collection, query, searchFields) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return collection;
    return collection.filter(function (record) {
      return searchFields.map(function (field) {
        return display(field(record));
      }).join(" ").toLocaleLowerCase().includes(needle);
    });
  }

  function setCount(id, collection) {
    document.getElementById(id).textContent = String(collection.length);
  }

  function card(title, facts, action) {
    const item = node("article", "admin-record");
    const heading = node("div", "admin-record__heading");
    heading.append(node("h3", "admin-record__title", title));
    if (action) heading.append(action);
    item.append(heading);
    const details = node("dl", "admin-record__facts");
    facts.forEach(function (entry) {
      const term = node("dt", "", entry[0]);
      const value = node("dd", "", display(entry[1]));
      details.append(term, value);
    });
    item.append(details);
    return item;
  }

  function actionButton(label, className, handler) {
    const button = node("button", className || "button button--secondary button--small", label);
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  }

  function paymentStatusClass(status) {
    if (status === "COMPLETED") return "badge--success";
    if (status === "FAILED") return "badge--danger";
    if (status === "PENDING") return "badge--warning";
    return "badge--neutral";
  }

  function loanStatusClass(status) {
    if (status === "APPROVED" || status === "COMPLETED") return "badge--success";
    if (status === "OVERDUE" || status === "CANCELED") return "badge--danger";
    if (status === "ACTIVE") return "badge--warning";
    return "badge--neutral";
  }

  function renderFarmers() {
    const target = document.getElementById(collections.farmers.target);
    const items = filtered(records.farmers || [], filters.farmers.value, [
      function (farmer) { return farmer.name; },
      function (farmer) { return farmer.email; },
      function (farmer) { return farmer.nationalId; },
      function (farmer) { return farmer.county; },
      function (farmer) { return farmer.phoneNumber; }
    ]);
    if (!items.length) {
      setEmpty(target, records.farmers.length ? "No farmers match this filter." : collections.farmers.empty);
      return;
    }
    target.setAttribute("aria-busy", "false");
    target.replaceChildren(...items.map(function (farmer) {
      return card(farmer.name || "Farmer", [
        ["Farmer record ID", farmer.id],
        ["National ID", farmer.nationalId],
        ["Email", farmer.email],
        ["Phone", farmer.phoneNumber],
        ["County", farmer.county],
        ["Farm size", farmer.farmSize],
        ["Title number", farmer.titleNumber]
      ]);
    }));
  }

  function packagePayload() {
    return {
      description: packageForm.elements.description.value.trim(),
      amount: Number(packageForm.elements.amount.value),
      interestRate: Number(packageForm.elements.interestRate.value),
      durationMonths: Number(packageForm.elements.durationMonths.value),
      monthlyPenalty: Number(packageForm.elements.monthlyPenalty.value),
      minimumFarmSize: Number(packageForm.elements.minimumFarmSize.value),
      maximumFarmSize: Number(packageForm.elements.maximumFarmSize.value)
    };
  }

  function editPackage(item) {
    editingPackageId = item.id;
    packageForm.elements.description.value = item.description || "";
    packageForm.elements.amount.value = item.amount ?? "";
    packageForm.elements.interestRate.value = item.interestRate ?? "";
    packageForm.elements.durationMonths.value = item.durationMonths ?? "";
    packageForm.elements.monthlyPenalty.value = item.monthlyPenalty ?? "";
    packageForm.elements.minimumFarmSize.value = item.minimumFarmSize ?? "";
    packageForm.elements.maximumFarmSize.value = item.maximumFarmSize ?? "";
    packageTitle.textContent = "Edit loan package " + item.id;
    packageSubmit.textContent = "Save package";
    packageCancel.hidden = false;
    setNotice(packageMessage, "", "");
    document.getElementById("admin-package-form-title").scrollIntoView({ behavior: "smooth", block: "center" });
    packageForm.elements.description.focus({ preventScroll: true });
  }

  function resetPackageForm() {
    editingPackageId = null;
    packageForm.reset();
    packageTitle.textContent = "Add a loan package";
    packageSubmit.textContent = "Create package";
    packageCancel.hidden = true;
    setNotice(packageMessage, "", "");
  }

  function renderPackages() {
    const target = document.getElementById(collections.packages.target);
    const items = records.packages || [];
    setCount("admin-count-packages", items);
    if (!items.length) {
      setEmpty(target, collections.packages.empty);
      return;
    }
    target.setAttribute("aria-busy", "false");
    target.replaceChildren(...items.map(function (item) {
      const actions = node("div", "cluster admin-record__actions");
      actions.append(actionButton("Edit", "button button--secondary button--small", function () {
        editPackage(item);
      }));
      actions.append(actionButton("Delete", "button button--danger button--small", async function () {
        if (!window.confirm("Delete loan package " + display(item.description) + "? This cannot be undone.")) return;
        await mutatePackage("/api/loan-package/" + encodeURIComponent(item.id), "DELETE", null, "Loan package deleted.");
      }));
      return card(item.description || "Loan package", [
        ["Package ID", item.id],
        ["Amount (KES)", item.amount],
        ["Interest rate (%)", item.interestRate],
        ["Duration (months)", item.durationMonths],
        ["Monthly penalty", item.monthlyPenalty],
        ["Farm size range", display(item.minimumFarmSize) + " – " + display(item.maximumFarmSize)],
        ["Season", item.farmingSeason && item.farmingSeason.seasonName]
      ], actions);
    }));
  }

  function currentDate() {
    const today = new Date();
    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-");
  }

  function seasonIsActive(season, today) {
    if (typeof season.active === "boolean") return season.active;
    return season.closed !== true &&
      typeof season.startDate === "string" &&
      typeof season.endDate === "string" &&
      season.startDate <= today &&
      season.endDate >= today;
  }

  function seasonState(season, today) {
    if (seasonIsActive(season, today)) return ["Active", "admin-season-badge--active"];
    if (season.closed === true) return ["Closed", "admin-season-badge--closed"];
    if (!season.startDate || !season.endDate) return ["Inactive · dates unavailable", "admin-season-badge--inactive"];
    if (season.startDate > today) return ["Upcoming · inactive", "admin-season-badge--inactive"];
    if (season.endDate < today) return ["Ended · inactive", "admin-season-badge--inactive"];
    return ["Inactive", "admin-season-badge--inactive"];
  }

  function updatePackageSeasonStatus() {
    if (!Array.isArray(records.seasons)) {
      setNotice(packageSeasonStatus, "Unable to check active season. Refresh Seasons before creating a loan package.", "error");
      return;
    }
    const active = records.seasons.filter(function (season) {
      return seasonIsActive(season, currentDate());
    });
    if (active.length === 1) {
      setNotice(packageSeasonStatus, "Active season: " + display(active[0].seasonName) + ". New loan packages will be assigned to this season.", "success");
    } else if (active.length > 1) {
      setNotice(packageSeasonStatus, "Multiple seasons match the backend active-date rule. Loan package creation may fail because NASMS expects one active season.", "warning");
    } else {
      setNotice(packageSeasonStatus, "There is no active season in the current NASMS season list. Create or update a season before creating loan packages.", "warning");
    }
  }

  function editSeason(season) {
    editingSeasonId = season.id;
    seasonForm.elements.seasonName.value = season.seasonName || "";
    seasonForm.elements.startDate.value = season.startDate || "";
    seasonForm.elements.endDate.value = season.endDate || "";
    seasonBudget.value = season.budget ?? "";
    seasonBudget.disabled = true;
    seasonBudgetField.querySelector("label").textContent = "Budget (unchanged)";
    seasonTitle.textContent = "Edit season " + display(season.id);
    seasonSubmit.textContent = "Save season dates";
    seasonCancel.hidden = false;
    seasonEditNote.hidden = false;
    setNotice(seasonMessage, "", "");
    seasonForm.scrollIntoView({ behavior: "smooth", block: "center" });
    seasonForm.elements.seasonName.focus({ preventScroll: true });
  }

  function resetSeasonForm() {
    editingSeasonId = null;
    seasonForm.reset();
    seasonBudget.disabled = false;
    seasonBudget.required = true;
    seasonBudgetField.querySelector("label").textContent = "Budget (KES)";
    seasonTitle.textContent = "Create a farming season";
    seasonSubmit.textContent = "Create season";
    seasonCancel.hidden = true;
    seasonEditNote.hidden = true;
    setNotice(seasonMessage, "", "");
  }

  function renderSeasons() {
    const target = document.getElementById(collections.seasons.target);
    const items = records.seasons || [];
    const today = currentDate();
    const active = items.filter(function (season) {
      return seasonIsActive(season, today);
    });
    if (active.length === 1) {
      setNotice(seasonStatus, "Current active season: " + display(active[0].seasonName) + ".", "success");
    } else if (active.length > 1) {
      setNotice(seasonStatus, "More than one season matches the backend active-date rule. Review the date ranges so package creation can identify one active season.", "warning");
    } else {
      setNotice(seasonStatus, "No season is currently active. A season must be open and today's date must fall between its start and end dates.", "warning");
    }
    updatePackageSeasonStatus();
    if (!items.length) {
      setEmpty(target, collections.seasons.empty);
      return;
    }
    target.setAttribute("aria-busy", "false");
    target.replaceChildren(...items.map(function (season) {
      const status = seasonState(season, today);
      const badge = node("span", "badge admin-season-badge " + status[1], status[0]);
      const actions = node("div", "cluster admin-record__actions");
      actions.append(actionButton("Edit dates", "button button--secondary button--small", function () {
        editSeason(season);
      }));
      actions.append(actionButton("Delete", "button button--danger button--small", async function () {
        if (!window.confirm("Delete farming season " + display(season.seasonName) + " (record " + display(season.id) + ")? This cannot be undone.")) return;
        if (editingSeasonId === season.id) resetSeasonForm();
        await mutateSeason("/api/seasons/" + encodeURIComponent(season.id), "DELETE", null, "Farming season deleted.");
      }));
      const item = card(season.seasonName || "Farming season", [
        ["Season ID", season.id],
        ["Start date", season.startDate],
        ["End date", season.endDate],
        ["Budget (KES)", season.budget],
        ["Closed", season.closed],
        ["Active", seasonIsActive(season, today)]
      ], actions);
      item.querySelector(".admin-record__heading").append(badge);
      if (seasonIsActive(season, today)) item.classList.add("admin-season-record--active");
      return item;
    }));
  }

  async function mutateSeason(path, method, payload, successMessage) {
    if (seasonBusy) return;
    seasonBusy = true;
    seasonSubmit.disabled = true;
    seasonCancel.disabled = true;
    seasonForm.setAttribute("aria-busy", "true");
    setNotice(seasonMessage, method === "DELETE" ? "Deleting season..." : "Saving season...", "");
    try {
      await request(path, method, payload);
      if (method !== "DELETE") resetSeasonForm();
      else setNotice(seasonMessage, successMessage, "success");
      await load("seasons");
      if (method !== "DELETE") setNotice(seasonMessage, successMessage, "success");
    } catch (error) {
      if (error.message !== "Authentication expired") {
        setNotice(seasonMessage, error.message || "NASMS could not save this season.", "error");
      }
    } finally {
      seasonBusy = false;
      seasonSubmit.disabled = false;
      seasonCancel.disabled = false;
      seasonForm.setAttribute("aria-busy", "false");
    }
  }

  async function submitSeason(event) {
    event.preventDefault();
    setNotice(seasonMessage, "", "");
    if (!seasonForm.reportValidity()) return;
    const startDate = seasonForm.elements.startDate.value;
    const endDate = seasonForm.elements.endDate.value;
    if (endDate < startDate) {
      setNotice(seasonMessage, "End date must be on or after the start date.", "error");
      seasonForm.elements.endDate.focus();
      return;
    }
    const payload = {
      seasonName: seasonForm.elements.seasonName.value.trim(),
      startDate: startDate,
      endDate: endDate
    };
    if (!payload.seasonName) {
      setNotice(seasonMessage, "Enter a season name.", "error");
      seasonForm.elements.seasonName.focus();
      return;
    }
    const method = editingSeasonId === null ? "POST" : "PUT";
    const action = editingSeasonId === null ? "create this farming season" : "update this farming season's name and dates";
    if (editingSeasonId === null) payload.budget = Number(seasonBudget.value);
    if (!window.confirm("Confirm " + action + "?")) return;
    const path = editingSeasonId === null
      ? "/api/seasons"
      : "/api/seasons/" + encodeURIComponent(editingSeasonId);
    await mutateSeason(path, method, payload, editingSeasonId === null ? "Farming season created." : "Farming season updated.");
  }

  function renderLoans() {
    const target = document.getElementById(collections.loans.target);
    const allLoans = records.loans || [];
    setCount("admin-count-loans", allLoans);
    const items = filtered(allLoans, filters.loans.value, [
      function (loan) { return loan.id; },
      function (loan) { return loan.status; },
      function (loan) { return loan.farmer && loan.farmer.name; },
      function (loan) { return loan.farmer && loan.farmer.nationalId; },
      function (loan) { return loan.farmingSeason && loan.farmingSeason.seasonName; }
    ]);
    if (!items.length) {
      setEmpty(target, allLoans.length ? "No loan records match this filter." : collections.loans.empty);
      return;
    }
    target.setAttribute("aria-busy", "false");
    target.replaceChildren(...items.map(function (loan) {
      const item = card("Loan " + display(loan.id), [
        ["Farmer", loan.farmer && loan.farmer.name],
        ["National ID", loan.farmer && loan.farmer.nationalId],
        ["Season", loan.farmingSeason && loan.farmingSeason.seasonName],
        ["Amount (KES)", loan.amount],
        ["Total payment", loan.totalPayment],
        ["Remaining balance", loan.remainingBalance],
        ["Due date", loan.dueDate],
        ["Created", loan.createdAt]
      ]);
      const status = node("span", "badge " + loanStatusClass(loan.status), display(loan.status));
      item.querySelector(".admin-record__heading").append(status);
      return item;
    }));
  }

  function renderProduce() {
    const target = document.getElementById(collections.produce.target);
    const allProducts = records.produce || [];
    const items = filtered(allProducts, filters.produce.value, [
      function (product) { return product.name; },
      function (product) { return product.productCode; }
    ]);
    if (!items.length) {
      setEmpty(target, allProducts.length ? "No produce records match this filter." : collections.produce.empty);
      return;
    }
    target.setAttribute("aria-busy", "false");
    target.replaceChildren(...items.map(function (product) {
      const remove = actionButton("Remove product", "button button--danger button--small", async function () {
        if (!window.confirm("Remove product " + display(product.name) + " (record " + display(product.id) + ")? This cannot be undone.")) return;
        try {
          setNotice(produceMessage, "Removing product...", "");
          await request("/api/product/" + encodeURIComponent(product.id), "DELETE");
          setNotice(produceMessage, "Product removed.", "success");
          await load("produce");
        } catch (error) {
          if (error.message !== "Authentication expired") {
            setNotice(produceMessage, error.message || "Unable to remove this product.", "error");
          }
        }
      });
      return card(product.name || "Produce record", [
        ["Product ID", product.id],
        ["Product code", product.productCode],
        ["Quantity", product.quantityUnit],
        ["Unit price (KES)", product.unitPrice_ksh],
        ["Farmer", product.farmer && product.farmer.name],
        ["Farmer ID", product.farmer && product.farmer.id]
      ], remove);
    }));
  }

  function renderListings() {
    const target = document.getElementById(collections.listings.target);
    const items = records.listings || [];
    if (!items.length) {
      setEmpty(target, collections.listings.empty);
      return;
    }
    target.setAttribute("aria-busy", "false");
    target.replaceChildren(...items.map(function (listing) {
      return card(listing.productName || "Marketplace listing", [
        ["Listing ID", listing.id],
        ["Product code", listing.productCode],
        ["Seller", listing.sellerName],
        ["Seller type", listing.sellerType],
        ["Quantity", listing.quantity],
        ["Price", listing.price],
        ["Created", listing.created]
      ]);
    }));
  }

  function renderTransactions() {
    const target = document.getElementById(collections.transactions.target);
    const items = records.transactions || [];
    setCount("admin-count-transactions", items);
    if (!items.length) {
      setEmpty(target, collections.transactions.empty);
      return;
    }
    target.setAttribute("aria-busy", "false");
    target.replaceChildren(...items.map(function (transaction) {
      return card("Transaction " + display(transaction.id), [
        ["Product", transaction.productName],
        ["Product code", transaction.productCode],
        ["Seller", transaction.sellerName],
        ["Buyer", transaction.buyerName],
        ["Quantity requested", transaction.quantityRequested],
        ["Price", transaction.price],
        ["Transaction date", transaction.transactionDate]
      ]);
    }));
  }

  function renderPayments() {
    const target = document.getElementById("admin-payments-state");
    const loans = records.loans || [];
    const payments = loans.flatMap(function (loan) {
      return (Array.isArray(loan.loanPayments) ? loan.loanPayments : []).map(function (payment) {
        return { loanId: loan.id, farmerName: loan.farmer && loan.farmer.name, payment: payment };
      });
    });
    if (!payments.length) {
      setEmpty(target, loans.length
        ? "No payment records were included in the returned loan details."
        : "No loan records are available to inspect for included payment records.");
      return;
    }
    target.setAttribute("aria-busy", "false");
    target.replaceChildren(...payments.map(function (record) {
      const item = card("Loan " + display(record.loanId) + " repayment", [
        ["Farmer", record.farmerName],
        ["Amount to pay", record.payment.amountToPay],
        ["Total amount paid", record.payment.totalAmountPaid],
        ["Remaining balance", record.payment.remainingBalance],
        ["Method", record.payment.paymentMethod],
        ["Transaction code", record.payment.transactionCode || record.payment.mpesaReceiptNumber],
        ["Payment date", record.payment.paymentDate]
      ]);
      const status = node("span", "badge " + paymentStatusClass(record.payment.status), display(record.payment.status));
      item.querySelector(".admin-record__heading").append(status);
      return item;
    }));
  }

  const renderers = {
    seasons: renderSeasons,
    farmers: renderFarmers,
    packages: renderPackages,
    loans: function () { renderLoans(); renderPayments(); },
    produce: renderProduce,
    listings: renderListings,
    transactions: renderTransactions
  };

  async function load(key) {
    const config = collections[key];
    const target = document.getElementById(config.target);
    setLoading(target, "Loading records from NASMS...");
    if (key === "loans") setLoading(document.getElementById("admin-payments-state"), "Loading payment records...");
    try {
      const result = await fetchRecords(config.path);
      records[key] = result;
      if (key === "farmers") setCount("admin-count-farmers", result);
      renderers[key]();
    } catch (error) {
      if (error.message === "Authentication expired") return;
      setError(target, error.message || "Unable to load records from NASMS.", function () { load(key); });
      if (key === "seasons") {
        records.seasons = undefined;
        updatePackageSeasonStatus();
      }
      if (key === "loans") {
        setError(document.getElementById("admin-payments-state"), "Loan records could not be loaded, so included payment records are unavailable.", function () { load("loans"); });
      }
    }
  }

  async function mutatePackage(path, method, payload, successMessage) {
    if (packageBusy) return;
    packageBusy = true;
    packageSubmit.disabled = true;
    packageCancel.disabled = true;
    packageForm.setAttribute("aria-busy", "true");
    setNotice(packageMessage, method === "DELETE" ? "Deleting package..." : "Saving package...", "");
    try {
      await request(path, method, payload);
      if (method !== "DELETE") resetPackageForm();
      else setNotice(packageMessage, successMessage, "success");
      await load("packages");
      if (method !== "DELETE") setNotice(packageMessage, successMessage, "success");
    } catch (error) {
      if (error.message !== "Authentication expired") setNotice(packageMessage, error.message || "NASMS could not save this package.", "error");
    } finally {
      packageBusy = false;
      packageSubmit.disabled = false;
      packageCancel.disabled = false;
      packageForm.setAttribute("aria-busy", "false");
    }
  }

  async function submitPackage(event) {
    event.preventDefault();
    setNotice(packageMessage, "", "");
    if (!packageForm.reportValidity()) return;
    const payload = packagePayload();
    if (payload.minimumFarmSize > payload.maximumFarmSize) {
      setNotice(packageMessage, "Minimum farm size cannot exceed maximum farm size.", "error");
      packageForm.elements.minimumFarmSize.focus();
      return;
    }
    const action = editingPackageId === null ? "create" : "update";
    if (!window.confirm("Confirm " + action + " of this loan package?")) return;
    const path = editingPackageId === null
      ? "/api/loan-package/loan"
      : "/api/loan-package/" + encodeURIComponent(editingPackageId);
    await mutatePackage(path, editingPackageId === null ? "POST" : "PUT", payload, "Loan package saved.");
  }

  function populateNavigation() {
    const nav = document.querySelector("#app-header .primary-nav");
    const mobile = document.querySelector("#app-header .mobile-nav__panel");
    if (!nav || !mobile) return;
    const links = [
      ["Admin dashboard", "#admin-dashboard"],
      ["Overview", "#admin-overview"],
      ["Farmers", "#admin-farmers"],
      ["Seasons", "#admin-seasons"],
      ["Loan packages", "#admin-packages"],
      ["Loan records", "#admin-loans"],
      ["Produce", "#admin-produce"],
      ["Transactions", "#admin-transactions"],
      ["Repayments", "#admin-payments"]
    ];
    [nav, mobile].forEach(function (container) {
      container.replaceChildren();
      links.forEach(function (entry) {
        const link = node("a", "nav-link", entry[0]);
        link.href = entry[1];
        if (entry[1] === "#admin-overview") link.setAttribute("aria-current", "page");
        link.addEventListener("click", function () {
          [nav, mobile].forEach(function (group) {
            group.querySelectorAll(".nav-link").forEach(function (item) {
              if (item.getAttribute("href") === entry[1]) item.setAttribute("aria-current", "page");
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

  function refreshAll() {
    return Promise.all(Object.keys(collections).map(load));
  }

  document.getElementById("admin-refresh-all").addEventListener("click", refreshAll);
  document.querySelectorAll("[data-admin-retry]").forEach(function (button) {
    button.addEventListener("click", function () { load(button.dataset.adminRetry); });
  });
  Object.keys(filters).forEach(function (key) {
    filters[key].addEventListener("input", renderers[key]);
  });
  packageForm.addEventListener("submit", submitPackage);
  packageCancel.addEventListener("click", resetPackageForm);
  seasonForm.addEventListener("submit", submitSeason);
  seasonCancel.addEventListener("click", resetSeasonForm);

  window.nasmsAdmin = Object.freeze({
    render: function (user) {
      if (!user || user.role !== "ADMIN") {
        root.hidden = true;
        return;
      }
      root.hidden = false;
      document.getElementById("farmer-dashboard").hidden = true;
      const message = document.getElementById("dashboard-role-message");
      if (message) message.hidden = true;
      document.getElementById("admin-title").textContent = "Welcome, " + (user.userName || user.emailAddress);
      populateNavigation();
      refreshAll();
    }
  });
})();
