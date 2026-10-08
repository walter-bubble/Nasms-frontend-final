# NASMS Frontend

NASMS is a responsive, plain HTML/CSS/JavaScript frontend for the Spring Boot service. It uses the backend's authentication and live records rather than mocked data, with a shared agricultural visual identity.

## Structure

- `index.html` contains sign-in, farmer, and administrator views.
- `assets/css/tokens.css` defines palette, typography, spacing, radius, shadow, and motion tokens.
- `assets/css/base.css` defines resets, accessible defaults, typography, focus states, and reduced-motion behavior.
- `assets/css/components.css` defines reusable layout, navigation, button, form, card, badge, notice, empty-state, and table styles.
- `assets/css/auth.css` styles authentication, registration, and farmer workflows; `assets/css/admin.css` styles the administrator workspace.
- `assets/js/` contains authentication and role-specific farmer and administrator features.

## Styling hooks

Use `app-shell`, `page-container`, `grid`, `stack`, and `cluster` for layout. Shared controls use `button` variants, `control`, `field`, `card`, `panel`, `badge`, and `notice` classes. Navigation styles are exposed through `site-header`, `brand`, `primary-nav`, `nav-link`, and the native `details.mobile-nav` pattern. The mobile navigation can expand without JavaScript.

The component stylesheet adapts around 68rem, 44rem, and 25rem viewport widths. It includes keyboard focus treatment and respects reduced-motion preferences.

## Backend boundary

`index.html` configures `http://localhost:8080` as the default API base. Login and role verification use public `POST /api/auth/login` and authenticated `GET /api/auth/me`; protected calls use the session's bearer JWT. The frontend supports only backend roles `FARMER` and `ADMIN`.

The administrator view uses the backend's farmer, loan, loan-package, product, marketplace-listing, and marketplace-transaction APIs. Loan-package create/update/delete is supported for ADMIN. New packages are assigned to the active season and checked against its remaining budget, but package updates do not repeat that budget check. Farmer profile administration is read-only because farmer profile mutation is scoped to the owning farmer. Product deletion is ADMIN-authorized. Loan records are read-only: the backend creates them as `ACTIVE` and has no approve/reject operation. Repayment records are displayed only when included with the administrator loan response; no separate payment-history endpoint exists.

Farmer marketplace actions use `GET /api/market-list/` (all listings), `GET /api/market-list/product/{productName}` (exact product-name search), `POST /api/market-list` (create), `GET /api/market-list/seller/{sellerId}` (owner-scoped listings), and `PUT /api/market-list/{id}` (update). Listing bodies use the `MarketListing` fields `productCode`, `sellerName`, `sellerId`, `sellerType`, `productName`, `quantity`, and `price`. The service checks the authenticated farmer against `sellerId` for create, read-by-seller, and update. The frontend resolves the farmer ID via owner-checked `GET /api/farmers/search/{nationalId}` rather than using the authenticated User ID. That endpoint returns a `Farmer` entity with its nested `User`; the frontend consumes only the farmer ID and name, but the backend still serializes the nested user fields in its response. Checkout uses `POST /api/orders/submit` with `BuyerOrderRequest` fields `productCode` and `quantity`; the backend requires quantity greater than zero, checks it against listing stock, decrements stock, and records a transaction. The UI limits purchase quantity to available listing stock.

The backend's separate `POST /api/product` accepts `ProductRequest` fields `name`, `quantity`, `unitPrice`, and `farmerId`, but its service does not assign a `productCode`. Checkout additionally requires a `Product` row matching the listing's code. The only product-list endpoint, `GET /api/product/`, is not farmer-scoped and returns product entities with nested farmer/user data, so the farmer UI does not fetch that collection. Sellers must use a code for an already-existing matching NASMS product when creating a listing. The UI does not fabricate product records or codes.

Administrator season management uses `GET /api/seasons`, `POST /api/seasons`, `PUT /api/seasons/{id}`, and `DELETE /api/seasons/{id}`. Creation sends `seasonName`, `startDate`, `endDate`, and `budget`; updates change only `seasonName`, `startDate`, and `endDate` because the backend ignores other fields in its update service. Create, update, and delete require ADMIN; reads require authentication. The UI uses the season model's computed `active` property, which reflects `closed` and whether today's date falls within the returned start/end dates. There is no separate activate/deactivate operation; `closed` defaults to false on creation and is not changed by the update service.

Other backend limitations are preserved: farmer-facing produce delivery is withheld because its request does not verify the current farmer's National ID and its order-history mapping has a missing path variable; the loan status values are `APPROVED`, `COMPLETED`, `OVERDUE`, `ACTIVE`, and `CANCELED` (there is no `PENDING` or `REJECTED` status). Farmer listing returns the `Farmer` entity with its nested `User` entity rather than a safe summary DTO; the frontend only renders selected profile fields and never renders the nested user/password fields, but the backend still sends them to the administrator client. Loan and payment entities reference each other without Jackson cycle annotations, so the admin loan response may fail serialization when payment relationships are populated. The payment panel does not substitute a fabricated history if this occurs.

The farmer dashboard displays the authenticated account fields returned by `GET /api/auth/me`. That response does not include a linked farmer profile or National ID. The farmer lookup endpoint requires a farmer-record ID, which is not returned as a distinct value by `/api/auth/me`; the loan lookup requires the farmer's National ID and enforces ownership. The frontend therefore displays farmer loans only after the existing loan lookup succeeds, rather than guessing either identifier. The produce-order history route declares a National ID path variable without including it in its mapping, so order history is not requested by the dashboard.

The backend CORS allowlist includes `localhost:3000`, `localhost:5173`, and `127.0.0.1:5500`.

This frontend folder is separate from the backend repository and is not automatically served by Spring Boot. No backend files were changed.
