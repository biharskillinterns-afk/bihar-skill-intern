# Bihar Skill Intern - API Reference

Base path: `/api`

Most protected endpoints require:

```http
Authorization: Bearer <jwt>
```

Common response shape:

```json
{
  "success": true
}
```

Error response shape:

```json
{
  "success": false,
  "message": "Error message"
}
```

## Health

### GET `/api/health`

Checks backend and database readiness.

Auth: none

Returns backend health, database state, and runtime status.

## Auth API

### POST `/api/auth/register`

Creates a student account directly.

Auth: none

Body includes student registration fields:

- `firstName`
- `lastName`
- `email`
- `phone`
- `password`
- `dob`
- `gender`
- `college`
- optional profile fields

### POST `/api/auth/pending-registration`

Stores registration details before payment completion.

Auth: none

Used by the registration/payment flow.

### POST `/api/auth/login`

Student login.

Auth: none

Body:

```json
{
  "email": "student@example.com",
  "password": "password"
}
```

Returns JWT token and student object.

### POST `/api/auth/forgot-password`

Creates password reset token and attempts email delivery.

Auth: none

### POST `/api/auth/reset-password`

Resets password using reset token.

Auth: none

### POST `/api/auth/reset-password-by-details`

Fallback reset using registration details.

Auth: none

### POST `/api/auth/admin/register`

Creates admin user.

Auth: none, restricted by first-admin/setup-key behavior.

### POST `/api/auth/admin/login`

Admin login.

Auth: none

Returns JWT token and admin object.

### GET `/api/auth/verify`

Verifies current JWT.

Auth: student or admin

## Student API

### GET `/api/students/profile`

Returns current student profile.

Auth: student

### PUT `/api/students/profile`

Updates current student profile.

Auth: student

### GET `/api/students/courses`

Returns enrolled courses for current student.

Auth: student

### GET `/api/students/progress`

Returns course progress rows for current student.

Auth: student

### GET `/api/students/proofs`

Returns current student's internship proof uploads.

Auth: student

### POST `/api/students/proofs`

Uploads one daily internship proof.

Auth: student

Body:

- `courseId`
- `proofDate`
- `internshipMode`
- `topic`
- `workDescription`
- `screenshot`
- `fileName`

### POST `/api/students/proofs/bulk`

Uploads multiple activity proof screenshots and maps them to attendance dates.

Auth: student

Body:

- `courseId`
- `startDate`
- `internshipMode`
- `topic`
- `workDescription`
- `screenshots`

## Course API

### GET `/api/courses`

Returns active courses.

Auth: none

### GET `/api/courses/:id`

Returns one course.

Auth: none

### POST `/api/courses/:id/enroll`

Enrolls current student in a course.

Auth: student

### PUT `/api/courses/:id/progress`

Updates current student course progress, quiz result, marks, grade, and certificate number when compatible columns exist.

Auth: student

## Admin API

### GET `/api/admin/settings/payment-amount`

Returns configured registration payment amount.

Auth: admin

### PUT `/api/admin/settings/payment-amount`

Updates registration payment amount.

Auth: admin

Body:

```json
{
  "amount": 299
}
```

### POST `/api/admin/settings/payment-amount/reset`

Resets registration payment amount to default.

Auth: admin

### GET `/api/admin/students`

Returns admin student list with latest payment summary.

Auth: admin

### GET `/api/admin/students/:id`

Returns detailed student data.

Auth: admin

### DELETE `/api/admin/students/:id`

Soft archives/deactivates a student.

Auth: admin

### PUT `/api/admin/students/:studentId/courses/:courseId/unlock`

Adds or removes early unlock for quiz/certificate/report access.

Auth: admin

Body:

```json
{
  "unlock": true
}
```

### GET `/api/admin/stats`

Returns dashboard totals.

Auth: admin

### GET `/api/admin/proofs?status=pending`

Returns internship proof submissions.

Auth: admin

Query:

- `status`: `pending`, `approved`, `rejected`, or blank.

### PUT `/api/admin/proofs/:id/review`

Approves or rejects an internship proof.

Auth: admin

Body:

```json
{
  "status": "approved",
  "adminRemarks": "Optional remark"
}
```

### GET `/api/admin/courses`

Returns all courses for admin.

Auth: admin

### POST `/api/admin/courses`

Creates a course.

Auth: admin

### PUT `/api/admin/courses/:id`

Updates a course and merges questions/material where supported by code.

Auth: admin

### DELETE `/api/admin/courses/:id`

Deletes a course only if no students are enrolled.

Auth: admin

## Payment API

### POST `/api/payments/registration-order`

Creates Razorpay registration order.

Auth: none

### GET `/api/payments/registration-amount`

Returns current registration payment amount.

Auth: none

### POST `/api/payments/registration-verify`

Verifies Razorpay payment signature and completes registration payment.

Auth: none

### POST `/api/payments/registration-callback`

Handles payment callback-style registration completion.

Auth: none

### GET `/api/payments/registration-status/:orderId`

Checks registration payment/order status.

Auth: none

### POST `/api/payments/registration-reconcile`

Attempts registration payment reconciliation.

Auth: none

### GET `/api/payments/registration-debug`

Debug endpoint for registration details.

Auth: none

### POST `/api/payments/initiate`

Creates a local pending payment record for a student.

Auth: student

### POST `/api/payments/verify`

Marks local payment record completed.

Auth: student

### GET `/api/payments/history`

Returns current student payment history.

Auth: student

### POST `/api/payments/webhook`

Razorpay webhook endpoint mounted before JSON body parser.

Auth: Razorpay signature verification.

## Certificate API

### GET `/api/certificates/`

Returns certificates for current student.

Auth: student

### GET `/api/certificates/:id`

Returns one certificate for current student.

Auth: student

### GET `/api/certificates/:id/download`

Current backend placeholder for certificate PDF download.

Auth: student

## Frontend API Client Mapping

`api-config.js` exposes:

- `registerStudent`
- `loginStudent`
- `loginAdmin`
- `verifyToken`
- `getStudentProfile`
- `updateStudentProfile`
- `getStudentCourses`
- `getStudentProgress`
- `getStudentProofs`
- `uploadStudentProof`
- `uploadActivityProofs`
- `updateCourseProgress`
- `getAllStudents`
- `getStudent`
- `deleteStudent`
- `getDashboardStats`
- `getInternshipProofs`
- `reviewInternshipProof`
- `updateStudentCourseUnlock`
- `getAdminPaymentAmount`
- `updateAdminPaymentAmount`
- `resetAdminPaymentAmount`
- `getAllCourses`
- `getCourse`
- `enrollCourse`
- `initiatePayment`
- `createRegistrationPaymentOrder`
- `getRegistrationPaymentAmount`
- `getRegistrationPaymentStatus`
- `verifyPayment`
- `verifyRegistrationPayment`
- `getPaymentHistory`
- `getCertificates`
- `getCertificate`
- `downloadCertificate`

