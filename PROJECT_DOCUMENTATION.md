# Bihar Skill Intern - Master Project Documentation

Version: 1.0  
Last updated: 2026-06-30  
Repository root: `BIHAR SKILL INTERN`

## 1. Project Overview

Bihar Skill Intern is a web-based internship, training, payment, reporting, and certificate management platform. It provides a public landing page, student registration and login, student dashboard, course learning, daily internship proof upload, report generation, marksheet/certificate pages, and an admin dashboard for managing students, courses, payments, notices, internship proofs, and certificate status.

The project is deployed as a static frontend on GitHub Pages with a separate Node.js/Express backend deployed on Render. The backend uses MySQL for persistent production data and Razorpay for registration payments.

## 2. Objectives

- Provide students with an online internship registration and learning workflow.
- Support registration payment and post-payment account creation.
- Allow students to access courses, track progress, upload activity proof, and generate internship documentation.
- Give admins tools to manage students, courses, notices, payment amount, internship proofs, and certificate unlock/approval.
- Preserve student data and maintain production compatibility with existing MySQL databases.
- Keep the frontend lightweight and deployable as static files.

## 3. Feature Summary

### Public Features

- Landing page with trust-building sections, testimonials, statistics, certificate showcase, FAQ, and WhatsApp help link.
- Student registration.
- Student login.
- Forgot/reset password.
- Razorpay registration payment.
- Payment receipt and registration documents.
- Public certificate/verification-style pages.
- 404 page.

### Student Features

- Student dashboard.
- Course enrollment and course cards.
- Course learning page with material and quiz workflow.
- Progress tracking.
- Activity/daily proof upload.
- Internship report generation.
- Attendance view.
- Marksheet view.
- Profile management.
- Certificate page.

### Admin Features

- Admin login.
- Dashboard statistics.
- Student list with search and filters.
- Student detail modal.
- Course management.
- Bulk course assignment.
- Course material and Q&A management.
- Registration payment amount manager.
- Internship proof review.
- Notice/announcement manager.
- Admin control center with payment overview, progress tracker, quiz report, certificate verification, course analytics, pending actions, and activity log.
- CSV exports.
- Early unlock of quiz/certificate for a student.

## 4. Complete Folder Structure

```text
BIHAR SKILL INTERN/
|-- 404.html
|-- admin-dashboard.html
|-- admin-login.html
|-- api-config.js
|-- attendance.html
|-- certificate.html
|-- CNAME
|-- consent-form.html
|-- course-learning.html
|-- courses.html
|-- daily-proof.html
|-- forgot-password.html
|-- google2f513bdccf175942.html
|-- index.html
|-- instagram.html
|-- internship-report.html
|-- local-frontend-server.js
|-- login.html
|-- logo.png
|-- marksheet.html
|-- payment-receipt.html
|-- payment-success.html
|-- payment.html
|-- POSK.html
|-- premium-ui.css
|-- profile.html
|-- register.html
|-- registration-documents.html
|-- render.yaml
|-- report.html
|-- reset-password.html
|-- robots.txt
|-- sitemap.xml
|-- style.css
|-- assets/
|   |-- all-courses-data.js
|   |-- qrcode-generator.js
|   `-- certificates/
|       |-- authorized-signature-stamp.png
|       |-- authorized-signature.png
|       |-- bihar-skill-intern-logo.png
|       |-- bihar-skill-interns-official-stamp.png
|       |-- iso-9001-certified.png
|       |-- iso-9001-official-stamp.png
|       `-- iso-9001-transparent-stamp.png
|-- backend/
|   |-- database_schema.sql
|   |-- package.json
|   |-- package-lock.json
|   |-- server.js
|   |-- start-backend.bat
|   |-- config/
|   |   |-- database.js
|   |   |-- schema.js
|   |   `-- settings.js
|   |-- middleware/
|   |   |-- auth.js
|   |   |-- errorHandler.js
|   |   |-- requestLogger.js
|   |   `-- validation.js
|   |-- routes/
|   |   |-- admin.js
|   |   |-- auth.js
|   |   |-- certificates.js
|   |   |-- courses.js
|   |   |-- payments.js
|   |   `-- students.js
|   |-- scripts/
|   |   |-- backup-database.js
|   |   |-- import-schema.js
|   |   `-- restore-database.js
|   `-- utils/
|       |-- audit.js
|       |-- backup.js
|       |-- compat.js
|       |-- db.js
|       |-- ids.js
|       `-- security.js
|-- ops/
|   |-- .backup-env.ps1
|   |-- db-backup-config.ps1
|   `-- logs/
|       `-- maintenance.log
`-- scripts/
    |-- backup-aiven-db.ps1
    |-- check-backend-health.ps1
    `-- run-maintenance.ps1
```

## 5. Technology Stack

### Frontend

- HTML5 static pages.
- CSS in page files plus `style.css` and `premium-ui.css`.
- Vanilla JavaScript.
- Browser localStorage/window.name fallback for some frontend state.
- `api-config.js` as the central frontend API client.
- QR generation support via `assets/qrcode-generator.js`.

### Backend

- Node.js.
- Express.js.
- MySQL via `mysql2/promise`.
- JWT authentication via `jsonwebtoken`.
- Password hashing via `bcryptjs`.
- Request validation via `express-validator`.
- Razorpay SDK.
- Nodemailer for email/password reset support.
- CORS, centralized logging, error handling, schema compatibility helpers.

### Deployment

- Frontend: GitHub Pages with custom domain `biharskillinterns.in`.
- Backend: Render web service from `backend/`.
- Database: External MySQL-compatible service configured through environment variables.
- Payment gateway: Razorpay.

## 6. Frontend Architecture

The frontend is a static multi-page application. Each page owns its markup, CSS, and page-specific JavaScript. Common API communication is centralized in `api-config.js`.

### Frontend Layers

- Public pages: `index.html`, `instagram.html`, `404.html`.
- Authentication pages: `register.html`, `login.html`, `forgot-password.html`, `reset-password.html`, `admin-login.html`.
- Student pages: `courses.html`, `course-learning.html`, `profile.html`, `daily-proof.html`, `attendance.html`, `marksheet.html`, `certificate.html`.
- Document/report pages: `report.html`, `internship-report.html`, `consent-form.html`, `registration-documents.html`, `payment-receipt.html`.
- Payment pages: `payment.html`, `payment-success.html`.
- Admin page: `admin-dashboard.html`.
- Shared frontend API client: `api-config.js`.

### API Client

`api-config.js` detects and calls the backend API. It includes helpers for:

- Student registration/login/profile.
- Student courses/progress/proofs.
- Admin students/stats/proofs/courses/payment amount.
- Payment order, status, verification, and history.
- Certificate retrieval/download.

## 7. Backend Architecture

The backend entry point is `backend/server.js`.

### Server Responsibilities

- Load environment variables.
- Configure CORS.
- Parse JSON and URL-encoded bodies.
- Mount Razorpay webhook route before JSON body parsing.
- Serve uploaded files from `/uploads`.
- Attach database pool to requests.
- Expose `/api/health`.
- Mount route modules:
  - `/api/auth`
  - `/api/students`
  - `/api/admin`
  - `/api/courses`
  - `/api/payments`
  - `/api/certificates`
- Use not found and centralized error handlers.
- Start schema sync unless `SKIP_SCHEMA_SYNC=true`.
- Schedule daily database backup if enabled.

### Backend Modules

- `config/database.js`: MySQL pool, SSL handling, database creation helper.
- `config/schema.js`: schema import and runtime compatibility schema checks.
- `config/settings.js`: registration payment amount settings.
- `middleware/auth.js`: JWT verification, admin/student authorization.
- `middleware/errorHandler.js`: async handler, 404 handler, error response handler.
- `middleware/requestLogger.js`: API logging.
- `middleware/validation.js`: express-validator rules.
- `routes/auth.js`: student/admin authentication and password reset.
- `routes/students.js`: student profile, courses, progress, proofs.
- `routes/courses.js`: public courses, enrollment, progress update.
- `routes/admin.js`: admin settings, students, stats, proofs, courses.
- `routes/payments.js`: Razorpay registration and student payment flows.
- `routes/certificates.js`: student certificate retrieval.
- `utils/audit.js`: admin audit logging.
- `utils/backup.js`: database backup scheduling and creation.
- `utils/compat.js`: runtime schema compatibility checks.
- `utils/db.js`: transaction and schema helper utilities.
- `utils/ids.js`: student, registration, and certificate ID helpers.
- `utils/security.js`: input sanitization and uploaded file storage.

## 8. Database Design

Primary database: MySQL.

Main tables:

- `students`
- `pending_registrations`
- `admins`
- `courses`
- `student_courses`
- `payments`
- `certificates`
- `attendance`
- `internship_proofs`
- `marks`
- `notifications`
- `audit_logs`
- `password_resets`

Runtime-added/compatibility tables:

- `uploaded_files`
- `admin_audit_logs`
- `api_request_logs`

Important relationships:

- `student_courses.studentId` -> `students.id`
- `student_courses.courseId` -> `courses.id`
- `payments.studentId` -> `students.id`
- `payments.courseId` -> `courses.id`
- `certificates.studentId` -> `students.id`
- `certificates.courseId` -> `courses.id`
- `attendance.studentId` -> `students.id`
- `attendance.courseId` -> `courses.id`
- `internship_proofs.studentId` -> `students.id`
- `internship_proofs.courseId` -> `courses.id`

See `DATABASE_SCHEMA.md` for full table documentation.

## 9. API Documentation

The backend exposes REST endpoints under `/api`.

High-level groups:

- `/api/health`
- `/api/auth/*`
- `/api/students/*`
- `/api/courses/*`
- `/api/admin/*`
- `/api/payments/*`
- `/api/certificates/*`

See `API_REFERENCE.md` for endpoint-by-endpoint details.

## 10. Admin Panel Documentation

Admin files:

- `admin-login.html`
- `admin-dashboard.html`
- Backend route: `backend/routes/admin.js`

Admin login uses `/api/auth/admin/login`. Authenticated admin calls require JWT and admin role.

Main admin sections:

- Dashboard header and stats.
- Student Consent Form quick action.
- Payment Amount Manager.
- Course Management.
- Internship Proof Verification.
- Notice / Announcement Manager.
- Student List.
- Admin Control Center.
- Student Detail & Certificate Control modal.
- Course creation and management modals.
- Bulk course assignment.
- Q&A and material management.

Known admin limitations:

- Some UI features still use localStorage for operational data.
- Certificate generation from admin is not a complete backend-driven flow.
- Refund and Razorpay reconciliation admin UI is not complete.
- Admin roles exist in the database but do not have a full role management interface.

## 11. Student Portal Documentation

Student files:

- `register.html`
- `login.html`
- `courses.html`
- `course-learning.html`
- `profile.html`
- `daily-proof.html`
- `attendance.html`
- `marksheet.html`
- `certificate.html`
- `report.html`
- `internship-report.html`

Student workflow:

1. Register or create pending registration.
2. Complete payment.
3. Login.
4. Select/enroll course.
5. Complete course material and quiz.
6. Upload activity proof.
7. Generate/view report, attendance, marksheet, and certificate.

## 12. Payment Flow

Payment gateway: Razorpay.

### Registration Payment Flow

1. Student enters registration details.
2. Frontend calls payment order creation.
3. Backend creates Razorpay order through `/api/payments/registration-order`.
4. Razorpay Checkout handles payment.
5. Frontend verifies through `/api/payments/registration-verify`.
6. Backend marks payment completed and can promote pending registration into a student account.
7. Webhook `/api/payments/webhook` can also process captured/authorized payment events.
8. Registration status can be checked through `/api/payments/registration-status/:orderId`.

### Student Payment Flow

- `/api/payments/initiate`
- `/api/payments/verify`
- `/api/payments/history`

Known payment limitation:

- Refund management exists as a possible `payments.status` value but no complete admin refund workflow is implemented.

## 13. Certificate Flow

Certificate functionality is split across frontend result pages, student course completion, and backend certificate retrieval.

Certificate-related frontend pages:

- `certificate.html`
- `POSK.html`
- `marksheet.html`
- `courses.html`
- `admin-dashboard.html`

Backend certificate routes:

- `GET /api/certificates/`
- `GET /api/certificates/:id`
- `GET /api/certificates/:id/download`

Known limitation:

- `/api/certificates/:id/download` currently returns a placeholder-style JSON response instead of a fully generated backend PDF.

## 14. Authentication Flow

### Student Auth

- Registration: `/api/auth/register`
- Pending registration: `/api/auth/pending-registration`
- Login: `/api/auth/login`
- Token verification: `/api/auth/verify`

Student tokens include role `student`.

### Admin Auth

- Admin registration: `/api/auth/admin/register`
- Admin login: `/api/auth/admin/login`
- Token verification: `/api/auth/verify`

Admin tokens include role `admin` or `super_admin`.

JWT secret must be set in production.

## 15. Security Features

Implemented or partially implemented:

- bcrypt password hashing.
- JWT authentication.
- Role checks for admin/student routes.
- Active account checks.
- Request validation for auth inputs.
- Central request sanitization.
- MySQL parameterized queries.
- Centralized error handling.
- CORS allowlist.
- API request logging.
- Admin audit logging for selected admin actions.
- Uploaded file storage with generated names and metadata support.
- Production requirement for `JWT_SECRET`.

Security limitations:

- No complete admin role/permission UI.
- No 2FA.
- Some frontend state is stored in localStorage.
- Full CSRF strategy is not documented or implemented for cookie auth because auth uses bearer tokens.

## 16. Deployment Architecture

```text
User Browser
  |
  | Static HTML/CSS/JS
  v
GitHub Pages + Custom Domain
  |
  | HTTPS API calls
  v
Render Node.js Backend
  |
  | MySQL TCP/SSL
  v
External MySQL Database
  |
  | Payment API/Webhooks
  v
Razorpay
```

Frontend deployment:

- GitHub Pages publishes repository root.
- `CNAME` configures custom domain.
- `robots.txt` and `sitemap.xml` are in repository root.

Backend deployment:

- Render service defined in `render.yaml`.
- Root directory: `backend`.
- Build: `npm install`.
- Start: `npm start`.
- Production uses `SKIP_SCHEMA_SYNC=true` by default in `render.yaml`.

## 17. Environment Variables

Documented variables:

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_PORT`
- `DB_SSL`
- `DB_SSL_REJECT_UNAUTHORIZED`
- `DB_SSL_CA`
- `PORT`
- `NODE_ENV`
- `JWT_SECRET`
- `JWT_EXPIRE`
- `ADMIN_REGISTRATION_KEY`
- `ALLOW_DEMO_PAYMENTS`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `EMAIL_USER`
- `EMAIL_PASS`
- `FRONTEND_URL`
- `FRONTEND_URLS`
- `SKIP_SCHEMA_SYNC`
- `DB_BACKUP_ENABLED`
- `DB_BACKUP_DIR`
- `DB_BACKUP_RETENTION_DAYS`
- `SCHEMA_COMPAT_CACHE_MS`

Never commit real production secrets.

## 18. Third-party Services

- Razorpay: payment orders, Checkout, signatures, webhooks.
- MySQL-compatible database provider: production database.
- Render: backend hosting.
- GitHub Pages: static frontend hosting.
- Gmail/SMTP: optional password reset email.
- WhatsApp external channel/link.
- Instagram external link.

## 19. File Structure Summary

Root contains frontend pages and static assets. Backend contains Express API. `assets/` contains course data, QR code helper, and certificate images. `ops/` and `scripts/` contain local/maintenance utilities. Documentation files generated for this project are:

- `PROJECT_DOCUMENTATION.md`
- `SYSTEM_ARCHITECTURE.md`
- `API_REFERENCE.md`
- `DATABASE_SCHEMA.md`
- `PROJECT_SUMMARY.pdf`

## 20. All Pages Documentation

| Page | Purpose |
|---|---|
| `index.html` | Public landing page. |
| `register.html` | Student registration. |
| `login.html` | Student login. |
| `forgot-password.html` | Password recovery request. |
| `reset-password.html` | Password reset. |
| `admin-login.html` | Admin login. |
| `admin-dashboard.html` | Admin operations dashboard. |
| `courses.html` | Student dashboard. |
| `course-learning.html` | Course material and quiz. |
| `daily-proof.html` | Activity proof upload. |
| `profile.html` | Student profile and progress. |
| `attendance.html` | Attendance view. |
| `marksheet.html` | Marksheet/assessment page. |
| `certificate.html` | Certificate page. |
| `POSK.html` | Certificate of completion page. |
| `report.html` | Printable internship report. |
| `internship-report.html` | Internship completion report with screenshots. |
| `payment.html` | Razorpay payment entry page. |
| `payment-success.html` | Payment success confirmation. |
| `payment-receipt.html` | Payment receipt. |
| `registration-documents.html` | Registration documents/ID/receipt. |
| `consent-form.html` | Student consent form. |
| `instagram.html` | Instagram/social page. |
| `404.html` | Custom not found page. |
| `google2f513bdccf175942.html` | Google Search Console verification file. |

## 21. All Modules Documentation

Frontend modules:

- `api-config.js`: API base configuration and APIService.
- `assets/all-courses-data.js`: course data source.
- `assets/qrcode-generator.js`: QR code utility.
- `premium-ui.css`: shared premium styling.
- `style.css`: legacy/global styling.

Backend modules are listed in section 7.

## 22. Future Scope

- Full admin role and permission management.
- Server-backed notifications.
- Complete certificate PDF generation and regeneration.
- Refund management and payment reconciliation dashboard.
- Admin audit log viewer.
- Login history.
- Advanced analytics charts.
- Server-side pagination and filtering for large student lists.
- Cloud object storage for uploaded files.
- Automated test suite.
- CI/CD verification workflow.
- Centralized frontend component/style system.

## 23. Known Limitations

- Some frontend workflows still depend on localStorage.
- Admin analytics are lightweight and mostly summary-based.
- Certificate download backend is not a complete PDF generation service.
- Refund management is not fully implemented.
- Render local filesystem is not ideal for permanent uploads.
- Some admin functions have mixed backend/localStorage behavior.
- No complete automated test coverage is present.

## 24. Maintenance Guide

### Daily/Regular Checks

- Verify frontend loads at the custom domain.
- Verify `/api/health` returns healthy backend status.
- Verify registration, login, payment, and admin login.
- Verify Razorpay dashboard for failed/refunded payments.
- Verify database backup jobs.

### Before Deployment

1. Back up production MySQL database.
2. Confirm environment variables on Render.
3. Run backend syntax checks.
4. Run frontend inline script parse checks if frontend changed.
5. Confirm no unrelated files are included.
6. Deploy backend separately from frontend when possible.

### Backup and Restore

- Backup script: `backend/scripts/backup-database.js`.
- Restore script: `backend/scripts/restore-database.js`.
- PowerShell maintenance scripts exist in `scripts/` and `ops/`.

### Production Safety Notes

- Keep `SKIP_SCHEMA_SYNC=true` unless a controlled migration window is approved.
- Do not modify payment flow without Razorpay test/live verification.
- Do not change existing routes, IDs, storage keys, or API response formats unless a migration plan exists.
- Never commit `.env` with real secrets.

