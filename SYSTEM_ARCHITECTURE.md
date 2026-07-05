# Bihar Skill Intern - System Architecture

## Architecture Summary

Bihar Skill Intern uses a static frontend and API backend architecture:

- Static frontend hosted from repository root through GitHub Pages.
- Node.js/Express backend hosted from `backend/` through Render.
- MySQL database hosted externally and accessed by backend environment variables.
- Razorpay used for payment order creation, Checkout verification, and webhook processing.

## High-level Diagram

```text
Browser
  |
  | HTML/CSS/JS from GitHub Pages
  v
Static Frontend
  |
  | REST API over HTTPS
  v
Express API on Render
  |
  | mysql2/promise pool
  v
MySQL Database
  |
  | payment order/signature/webhook
  v
Razorpay
```

## Frontend Architecture

The frontend is a static multi-page application. Each page is a standalone HTML file. The shared API client is `api-config.js`.

### Public Layer

- `index.html`
- `instagram.html`
- `404.html`
- `robots.txt`
- `sitemap.xml`
- `CNAME`

### Authentication Layer

- `register.html`
- `login.html`
- `forgot-password.html`
- `reset-password.html`
- `admin-login.html`

### Student Portal Layer

- `courses.html`
- `course-learning.html`
- `daily-proof.html`
- `profile.html`
- `attendance.html`
- `marksheet.html`
- `certificate.html`
- `report.html`
- `internship-report.html`

### Admin Layer

- `admin-dashboard.html`

### Shared Assets

- `logo.png`
- `premium-ui.css`
- `style.css`
- `assets/all-courses-data.js`
- `assets/qrcode-generator.js`
- `assets/certificates/*`

## Backend Architecture

### Entry Point

`backend/server.js`

Responsibilities:

- Load `.env`.
- Configure Express.
- Configure CORS.
- Attach DB pool to requests.
- Add request logging and sanitization.
- Mount API routes.
- Provide health check.
- Start schema checks when enabled.
- Schedule backups.

### Route Modules

```text
/api/auth         -> backend/routes/auth.js
/api/students     -> backend/routes/students.js
/api/admin        -> backend/routes/admin.js
/api/courses      -> backend/routes/courses.js
/api/payments     -> backend/routes/payments.js
/api/certificates -> backend/routes/certificates.js
```

### Middleware

- `auth.js`: JWT verification and role checks.
- `validation.js`: express-validator input validation.
- `requestLogger.js`: request logging and optional database log persistence.
- `errorHandler.js`: centralized API errors and 404.

### Utilities

- `db.js`: transaction wrapper and schema helper functions.
- `compat.js`: safe runtime schema detection.
- `security.js`: sanitization and file storage helpers.
- `ids.js`: generated IDs.
- `audit.js`: admin audit logs.
- `backup.js`: database backup scheduling.

## Runtime Request Flow

```text
Frontend page
  |
  v
api-config.js APIService
  |
  v
Express route
  |
  v
Middleware: auth/validation/sanitization/logging
  |
  v
Route handler
  |
  v
MySQL transaction/query
  |
  v
JSON response
```

## Authentication Flow

```text
Login form
  |
  v
/api/auth/login or /api/auth/admin/login
  |
  v
Password checked with bcrypt
  |
  v
JWT created
  |
  v
Frontend stores token
  |
  v
Protected API calls use Authorization: Bearer <token>
```

## Payment Flow

```text
Registration form
  |
  v
Create pending registration
  |
  v
Create Razorpay order
  |
  v
Razorpay Checkout
  |
  v
Verify signature or process webhook
  |
  v
Mark payment completed
  |
  v
Promote pending registration to student
```

## Internship Proof Flow

```text
Student uploads proof
  |
  v
/api/students/proofs or /api/students/proofs/bulk
  |
  v
File/data stored and DB row created
  |
  v
Admin reviews proof
  |
  v
/api/admin/proofs/:id/review
  |
  v
Proof approved/rejected
  |
  v
Approved proof can mark attendance
```

## Certificate Flow

```text
Course progress/quiz result
  |
  v
Certificate number/result data
  |
  v
Student certificate page
  |
  v
Admin can approve/block/auto status in dashboard
```

## Deployment Architecture

### GitHub Pages

- Publishes repository root.
- Serves frontend pages and static assets.
- Uses `CNAME` for custom domain.
- Serves `robots.txt` and `sitemap.xml`.

### Render

- Uses `render.yaml`.
- Service root: `backend`.
- Build command: `npm install`.
- Start command: `npm start`.
- Production environment variables are set in Render dashboard.

### Database

- External MySQL.
- Connected through `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`.
- SSL can be enabled with `DB_SSL=true`.

## Production Safety Controls

- `SKIP_SCHEMA_SYNC=true` can skip automatic schema sync.
- Runtime compatibility checks allow legacy schemas to keep working.
- Transaction helper is used for critical operations.
- Backups can be scheduled through backend backup utility.
- Uploaded files are stored under backend uploads path; cloud storage is recommended for long-term production durability.

