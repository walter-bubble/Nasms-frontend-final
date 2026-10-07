# NASMS Frontend Foundation

This folder contains the page-neutral static foundation for the NASMS frontend. It uses plain HTML and CSS, with no package manager, external asset dependency, mock data, or page behavior.

## Structure

- `index.html` is the document shell and empty `#nasms-app` mount point.
- `assets/css/tokens.css` defines palette, typography, spacing, radius, shadow, and motion tokens.
- `assets/css/base.css` defines resets, accessible defaults, typography, focus states, and reduced-motion behavior.
- `assets/css/components.css` defines reusable layout, navigation, button, form, card, badge, notice, empty-state, and table styles.

## Styling hooks

Use `app-shell`, `page-container`, `grid`, `stack`, and `cluster` for layout. Shared controls use `button` variants, `control`, `field`, `card`, `panel`, `badge`, and `notice` classes. Navigation styles are exposed through `site-header`, `brand`, `primary-nav`, `nav-link`, and the native `details.mobile-nav` pattern. The mobile navigation can expand without JavaScript.

The component stylesheet adapts around 68rem, 44rem, and 25rem viewport widths. It includes keyboard focus treatment and respects reduced-motion preferences.

## Backend boundary

No API URL, endpoint, authentication flow, or application behavior is configured here. The next integration phase should use the audited Spring Boot contracts: public `POST /api/auth/login` and `POST /api/auth/register`, authenticated `GET /api/auth/me`, bearer JWT for protected routes, and backend roles `FARMER` and `ADMIN`. The backend currently allows CORS from `localhost:3000`, `localhost:5173`, and `127.0.0.1:5500`.

This frontend folder is separate from the backend repository and is not automatically served by Spring Boot. No backend files were changed.
