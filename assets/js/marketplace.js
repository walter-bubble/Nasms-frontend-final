(function () {
  "use strict";

  const module = document.getElementById("marketplace-module");
  const listingsTarget = document.getElementById("marketplace-listings");
  const searchForm = document.getElementById("market-search-form");
  const searchInput = document.getElementById("market-product-search");
  const showAllButton = document.getElementById("market-show-all");
  const listingStatus = document.getElementById("market-listing-status");
  const sellerProfileForm = document.getElementById("market-seller-profile-form");
  const sellerNationalId = document.getElementById("market-seller-national-id");
  const sellerTools = document.getElementById("market-seller-tools");
  const sellerProfileStatus = document.getElementById("market-seller-profile-status");
  const sellerProfileButton = document.getElementById("market-load-seller");
  const sellForm = document.getElementById("market-sell-form");
  const sellProductInput = document.getElementById("market-sale-product");
  const sellProductCodeInput = document.getElementById("market-sale-product-code");
  const sellQuantityInput = document.getElementById("market-sale-quantity");
  const sellPriceInput = document.getElementById("market-sale-price");
  const sellSubmit = document.getElementById("market-sell-submit");
  const sellStatus = document.getElementById("market-sell-status");
  const ownListingsTarget = document.getElementById("market-my-listings");
  const refreshOwnListingsButton = document.getElementById("market-refresh-own-listings");
  let currentUser = null;
  let currentSearch = "";
  let currentFarmer = null;
  const marketplacePhotos = [
    { src: "assets/images/loans/young-seedlings.jpg", alt: "Illustrative photo of young crops growing in prepared soil" },
    { src: "assets/images/loans/golden-crop-field.jpg", alt: "Illustrative photo of a golden crop field at sunset" },
    { src: "assets/images/loans/fresh-produce.jpg", alt: "Illustrative photo of freshly harvested vegetables" }
  ];

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setNotice(target, message, type) {
    target.textContent = message || "";
    target.hidden = !message;
    target.classList.remove("notice--success", "notice--warning", "notice--error");
    if (type) target.classList.add("notice--" + type);
  }

  function setFieldError(input, message) {
    const error = document.getElementById(input.id + "-error");
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (error) {
      error.textContent = message || "";
      error.hidden = !message;
    }
  }

  function loading(message) {
    listingsTarget.setAttribute("aria-busy", "true");
    listingsTarget.replaceChildren(node("p", "dashboard-loading", message));
  }

  function setOwnListingsState(message, busy) {
    ownListingsTarget.setAttribute("aria-busy", String(Boolean(busy)));
    ownListingsTarget.replaceChildren(node("p", busy ? "dashboard-loading" : "dashboard-empty", message));
  }

  function setListingError(message) {
    listingsTarget.setAttribute("aria-busy", "false");
    const state = node("div", "dashboard-error");
    state.append(node("p", "", message));
    const retry = node("button", "button button--secondary button--small dashboard-retry", "Try again");
    retry.type = "button";
    retry.addEventListener("click", function () { loadListings(currentSearch); });
    state.append(retry);
    listingsTarget.replaceChildren(state);
  }

  async function request(path, options) {
    return window.nasmsAuth.authorizedFetch(path, Object.assign({
      headers: { Accept: "application/json" }
    }, options || {}));
  }

  async function backendMessage(response) {
    const raw = await response.text();
    try {
      const result = raw ? JSON.parse(raw) : null;
      if (typeof result === "string") return result;
      return result && (result.message || result.error) || "";
    } catch {
      return raw;
    }
  }

  function detail(label, value) {
    const item = node("div", "market-listing-fact");
    item.append(node("dt", "", label));
    item.append(node("dd", "", value === null || value === undefined || value === "" ? "Not provided" : String(value)));
    return item;
  }

  function createListingCard(listing, index, owned) {
    const card = node("article", "market-listing-card");
    card.classList.add("market-listing-card--photo");
    const visual = node("div", "market-listing-card__visual");
    const image = node("img", "");
    const photo = marketplacePhotos[index % marketplacePhotos.length];
    image.src = photo.src;
    image.alt = photo.alt;
    image.loading = "lazy";
    visual.append(image);
    visual.append(node("span", "market-listing-card__photo-label", "Farm produce"));
    card.append(visual);

    const top = node("div", "market-listing-card__top");
    const identity = node("div", "stack");
    identity.append(node("p", "eyebrow", listing.sellerType || "Marketplace listing"));
    identity.append(node("h4", "", listing.productName || "Produce listing"));
    if (listing.productCode) identity.append(node("p", "market-listing-code", listing.productCode));
    top.append(identity);
    const mark = node("span", "market-produce-mark", (listing.productName || "P").trim().charAt(0).toUpperCase());
    mark.setAttribute("aria-hidden", "true");
    top.append(mark);
    card.append(top);

    const facts = node("dl", "market-listing-facts");
    facts.append(detail("Price per unit (KES)", listing.price));
    facts.append(detail("Available quantity", listing.quantity));
    if (listing.sellerName) facts.append(detail("Seller", listing.sellerName));
    if (listing.created) facts.append(detail("Listed", listing.created));
    card.append(facts);

    const orderForm = node("form", "market-order-form");
    orderForm.noValidate = true;
    const field = node("div", "field");
    const label = node("label", "field__label", "Quantity");
    const input = node("input", "control");
    input.type = "number";
    input.name = "quantity";
    input.min = "0";
    input.step = "any";
    input.inputMode = "decimal";
    input.max = String(listing.quantity);
    input.required = true;
    const error = node("p", "field__error market-quantity-error", "");
    error.hidden = true;
    const submit = node("button", "button button--primary", "Buy / Order");
    submit.type = "submit";
    submit.disabled = !(listing.productCode && Number(listing.quantity) > 0);
    if (!submit.disabled) label.htmlFor = "";
    const inputId = "market-quantity-" + String(listing.id || listing.productCode || "item").replace(/[^a-zA-Z0-9_-]/g, "-");
    input.id = inputId;
    label.htmlFor = inputId;
    error.id = inputId + "-error";
    input.setAttribute("aria-describedby", error.id);
    field.append(label, input, error);
    orderForm.append(field, submit);
    orderForm.addEventListener("submit", function (event) {
      event.preventDefault();
      placeListingOrder(listing, input, error, submit, orderForm);
    });
    card.append(orderForm);
    if (!(Number(listing.quantity) > 0)) card.append(node("p", "market-unavailable", "No available quantity is listed."));

    if (owned) {
      const editToggle = node("button", "button button--secondary button--small", "Edit listing");
      editToggle.type = "button";
      editToggle.setAttribute("aria-expanded", "false");
      const editForm = node("form", "market-listing-edit-form");
      editForm.hidden = true;
      editForm.noValidate = true;
      const nameField = node("label", "field");
      const nameLabel = node("span", "field__label", "Product name");
      const nameInput = node("input", "control");
      nameInput.name = "productName";
      nameInput.required = true;
      nameInput.value = listing.productName || "";
      nameField.append(nameLabel, nameInput);

      const codeField = node("label", "field");
      const codeLabel = node("span", "field__label", "Product code");
      const codeInput = node("input", "control");
      codeInput.name = "productCode";
      codeInput.required = true;
      codeInput.value = listing.productCode || "";
      codeField.append(codeLabel, codeInput);

      const editFacts = node("div", "field-row");
      const quantityField = node("label", "field");
      const quantityLabel = node("span", "field__label", "Available quantity");
      const quantityInput = node("input", "control");
      quantityInput.name = "quantity";
      quantityInput.type = "number";
      quantityInput.min = "0";
      quantityInput.step = "any";
      quantityInput.required = true;
      quantityInput.value = String(listing.quantity);
      quantityField.append(quantityLabel, quantityInput);

      const priceField = node("label", "field");
      const priceLabel = node("span", "field__label", "Price per unit (KES)");
      const priceInput = node("input", "control");
      priceInput.name = "price";
      priceInput.type = "number";
      priceInput.min = "0";
      priceInput.step = "any";
      priceInput.required = true;
      priceInput.value = String(listing.price);
      priceField.append(priceLabel, priceInput);
      editFacts.append(quantityField, priceField);

      const save = node("button", "button button--primary button--small", "Save listing");
      save.type = "submit";
      const editStatus = node("p", "notice market-status");
      editStatus.hidden = true;
      editStatus.setAttribute("role", "status");
      editStatus.setAttribute("aria-live", "polite");
      editToggle.addEventListener("click", function () {
        editForm.hidden = !editForm.hidden;
        editToggle.setAttribute("aria-expanded", String(!editForm.hidden));
      });
      editForm.addEventListener("submit", function (event) {
        event.preventDefault();
        updateListing(listing, {
          productName: nameInput.value.trim(),
          productCode: codeInput.value.trim(),
          quantity: Number(quantityInput.value),
          price: Number(priceInput.value)
        }, save, editStatus);
      });
      const editActions = node("div", "cluster");
      editActions.append(save);
      editForm.append(nameField, codeField, editFacts, editStatus, editActions);
      card.append(editToggle, editForm);
    }
    return card;
  }

  async function loadListings(search) {
    currentSearch = (search || "").trim();
    setNotice(listingStatus, "", "");
    loading(currentSearch ? "Searching marketplace listings..." : "Loading marketplace listings...");
    const path = currentSearch
      ? "/api/market-list/product/" + encodeURIComponent(currentSearch)
      : "/api/market-list/";
    try {
      const response = await request(path);
      if (!response.ok) throw new Error("Marketplace listings could not be loaded.");
      const listings = await response.json();
      if (!Array.isArray(listings)) throw new Error("NASMS returned an unexpected marketplace response.");
      listingsTarget.setAttribute("aria-busy", "false");
      if (listings.length === 0) {
        listingsTarget.replaceChildren(node("p", "dashboard-empty", currentSearch ? "No listing was returned for that exact product name." : "No marketplace listings are currently available."));
        return;
      }
      listingsTarget.replaceChildren(...listings.map(function (listing, index) {
        return createListingCard(listing, index, false);
      }));
    } catch (error) {
      setListingError(error.message || "Unable to load marketplace listings. Please try again.");
    }
  }

  async function loadMyListings() {
    if (!currentFarmer || currentFarmer.id === undefined) {
      setOwnListingsState("Verify your farmer profile to load your listings.", false);
      return;
    }
    ownListingsTarget.setAttribute("aria-busy", "true");
    ownListingsTarget.replaceChildren(node("p", "dashboard-loading", "Loading your listings from NASMS..."));
    refreshOwnListingsButton.disabled = true;
    try {
      const response = await request("/api/market-list/seller/" + encodeURIComponent(currentFarmer.id));
      if (!response.ok) throw new Error(await backendMessage(response) || "Your listings could not be loaded.");
      const listings = await response.json();
      if (!Array.isArray(listings)) throw new Error("NASMS returned an unexpected seller-listing response.");
      ownListingsTarget.setAttribute("aria-busy", "false");
      if (!listings.length) {
        ownListingsTarget.replaceChildren(node("p", "dashboard-empty", "NASMS returned no listings for your seller account."));
        return;
      }
      ownListingsTarget.replaceChildren(...listings.map(function (listing, index) {
        return createListingCard(listing, index, true);
      }));
    } catch (error) {
      ownListingsTarget.setAttribute("aria-busy", "false");
      const state = node("div", "dashboard-error");
      state.append(node("p", "", error.message || "Unable to load your listings."));
      const retry = node("button", "button button--secondary button--small", "Try again");
      retry.type = "button";
      retry.addEventListener("click", loadMyListings);
      state.append(retry);
      ownListingsTarget.replaceChildren(state);
    } finally {
      refreshOwnListingsButton.disabled = false;
    }
  }

  async function loadSellerWorkspace(event) {
    event.preventDefault();
    setNotice(sellerProfileStatus, "", "");
    const nationalId = sellerNationalId.value.trim();
    if (!/^\d+$/.test(nationalId)) {
      setFieldError(sellerNationalId, "Enter your farmer National ID using digits only.");
      sellerNationalId.focus();
      return;
    }
    setFieldError(sellerNationalId, "");
    sellerProfileForm.setAttribute("aria-busy", "true");
    sellerProfileButton.disabled = true;
    sellerProfileButton.textContent = "Verifying farmer...";
    sellerTools.hidden = true;
    currentFarmer = null;
    try {
      const response = await request("/api/farmers/search/" + encodeURIComponent(nationalId));
      if (!response.ok) {
        const message = await backendMessage(response);
        if (response.status === 403) throw new Error("That farmer National ID does not belong to the signed-in farmer.");
        if (response.status === 404) throw new Error("NASMS did not find a farmer record for that National ID.");
        throw new Error(message || "NASMS could not verify your farmer profile.");
      }
      const farmer = await response.json();
      if (!farmer || farmer.id === undefined || !farmer.name) throw new Error("NASMS returned an incomplete farmer profile.");
      currentFarmer = farmer;
      sellerTools.hidden = false;
      sellSubmit.disabled = false;
      setNotice(sellerProfileStatus, "Farmer profile verified. Showing listings for " + farmer.name + ".", "success");
      await loadMyListings();
    } catch (error) {
      setNotice(sellerProfileStatus, error.message || "Unable to verify your farmer profile. Please try again.", "error");
      setOwnListingsState("Seller profile was not verified; listings are not loaded.", false);
    } finally {
      sellerProfileForm.setAttribute("aria-busy", "false");
      sellerProfileButton.disabled = false;
      sellerProfileButton.textContent = "Load my listings";
    }
  }

  function validatePositiveNumber(input, label) {
    const number = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(number) || number <= 0) {
      setFieldError(input, label + " must be greater than zero.");
      input.focus();
      return null;
    }
    setFieldError(input, "");
    return number;
  }

  async function publishListing(event) {
    event.preventDefault();
    setNotice(sellStatus, "", "");
    const productName = sellProductInput.value.trim();
    const productCode = sellProductCodeInput.value.trim();
    if (!productName) {
      setFieldError(sellProductInput, "Enter the product name.");
      sellProductInput.focus();
      return;
    }
    setFieldError(sellProductInput, "");
    if (!productCode) {
      setFieldError(sellProductCodeInput, "Enter an existing NASMS product code.");
      sellProductCodeInput.focus();
      return;
    }
    setFieldError(sellProductCodeInput, "");
    const quantity = validatePositiveNumber(sellQuantityInput, "Quantity");
    if (quantity === null) return;
    const price = validatePositiveNumber(sellPriceInput, "Price per unit");
    if (price === null) return;

    const payload = {
      productCode: productCode,
      sellerName: currentFarmer.name,
      sellerId: currentFarmer.id,
      sellerType: currentUser.role,
      productName: productName,
      quantity: quantity,
      price: price
    };
    sellForm.setAttribute("aria-busy", "true");
    sellSubmit.disabled = true;
    sellSubmit.textContent = "Publishing...";
    try {
      const response = await request("/api/market-list", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await backendMessage(response) || "NASMS could not publish this listing.");
      const savedListing = await response.json();
      if (!savedListing || String(savedListing.productCode) !== String(productCode)) {
        throw new Error("NASMS returned an unexpected listing response.");
      }
      sellQuantityInput.value = "";
      sellPriceInput.value = "";
      await Promise.all([loadMyListings(), loadListings(currentSearch)]);
      setNotice(sellStatus, "NASMS published " + (savedListing.productName || productName) + " as listing " + savedListing.id + ".", "success");
    } catch (error) {
      setNotice(sellStatus, error.message || "Unable to publish this listing. Please try again.", "error");
    } finally {
      sellForm.setAttribute("aria-busy", "false");
      sellSubmit.disabled = !currentFarmer;
      sellSubmit.textContent = "Publish listing";
    }
  }

  async function updateListing(listing, values, button, status) {
    setNotice(status, "", "");
    if (!values.productName || !values.productCode) {
      setNotice(status, "Product name and product code are required.", "error");
      return;
    }
    if (!Number.isFinite(values.quantity) || values.quantity <= 0 || !Number.isFinite(values.price) || values.price <= 0) {
      setNotice(status, "Quantity and price per unit must both be greater than zero.", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "Saving...";
    try {
      const response = await request("/api/market-list/" + encodeURIComponent(listing.id), {
        method: "PUT",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          productCode: values.productCode,
          sellerName: listing.sellerName || currentFarmer.name,
          sellerId: currentFarmer.id,
          sellerType: listing.sellerType || currentUser.role,
          productName: values.productName,
          quantity: values.quantity,
          price: values.price
        })
      });
      if (!response.ok) throw new Error(await backendMessage(response) || "NASMS could not update this listing.");
      setNotice(status, "Listing updated in NASMS.", "success");
      await Promise.all([loadMyListings(), loadListings(currentSearch)]);
    } catch (error) {
      setNotice(status, error.message || "Unable to update this listing. Please try again.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Save listing";
    }
  }

  async function placeListingOrder(listing, input, error, submit, form) {
    error.hidden = true;
    input.setAttribute("aria-invalid", "false");
    const quantity = Number(input.value);
    const stock = Number(listing.quantity);
    if (!input.value.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      error.textContent = "Enter a quantity greater than zero.";
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    if (quantity > stock) {
      error.textContent = "Quantity cannot exceed the available quantity shown for this listing.";
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    if (!listing.productCode) {
      setNotice(listingStatus, "This listing does not include a product code required by the order endpoint.", "error");
      return;
    }

    form.setAttribute("aria-busy", "true");
    submit.disabled = true;
    submit.textContent = "Placing order...";
    try {
      const response = await request("/api/orders/submit", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ productCode: listing.productCode, quantity: quantity })
      });
      if (!response.ok) {
        await backendMessage(response);
        throw new Error("NASMS could not complete this order. The listing or available stock may have changed. Please reload the listings and try again.");
      }
      const transaction = await response.json();
      if (!transaction || transaction.productCode !== listing.productCode) throw new Error("NASMS returned an unexpected order response.");
      const successMessage = "Order completed. NASMS recorded " + transaction.quantityRequested + " for " + (transaction.productName || listing.productName) + ". Transaction " + transaction.id + ".";
      await loadListings(currentSearch);
      setNotice(listingStatus, successMessage, "success");
    } catch (requestError) {
      setNotice(listingStatus, requestError.message || "Unable to place the order. Check your connection and try again.", "error");
    } finally {
      form.setAttribute("aria-busy", "false");
      submit.disabled = !(listing.productCode && Number(listing.quantity) > 0);
      submit.textContent = "Buy / Order";
    }
  }



  function open() {
    if (!currentUser || currentUser.role !== "FARMER") return;
    module.hidden = false;
    module.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("marketplace-title").focus({ preventScroll: true });
    if (!listingsTarget.dataset.loaded) loadListings("");
  }

  searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    loadListings(searchInput.value);
  });
  showAllButton.addEventListener("click", function () {
    searchInput.value = "";
    loadListings("");
  });
  sellerProfileForm.addEventListener("submit", loadSellerWorkspace);
  sellerNationalId.addEventListener("input", function () {
    if (currentFarmer) {
      currentFarmer = null;
      sellerTools.hidden = true;
      sellSubmit.disabled = true;
      setNotice(sellerProfileStatus, "Load your seller profile again after changing the National ID.", "warning");
      setOwnListingsState("Verify your farmer profile to load your listings.", false);
    }
    setFieldError(sellerNationalId, "");
  });
  sellForm.addEventListener("submit", publishListing);
  refreshOwnListingsButton.addEventListener("click", loadMyListings);
  document.addEventListener("click", function (event) {
    const link = event.target.closest('a[href="#marketplace-module"]');
    if (!link) return;
    event.preventDefault();
    open();
  });

  window.nasmsMarketplace = Object.freeze({
    render: function (user) {
      currentUser = user;
      if (!user || user.role !== "FARMER") module.hidden = true;
    },
    open: open
  });
})();
