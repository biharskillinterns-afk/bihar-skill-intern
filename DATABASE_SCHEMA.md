# Bihar Skill Intern - Database Schema Documentation

Database engine: MySQL

Schema sources:

- `backend/database_schema.sql`
- `backend/config/schema.js`

## Schema Strategy

The project has a baseline SQL schema and runtime compatibility checks. Production can skip automatic schema sync by setting:

```text
SKIP_SCHEMA_SYNC=true
```

Runtime code can detect missing columns/tables and use legacy behavior for some features.

## Tables

## `students`

Stores student accounts and profile data.

Important columns:

- `id`
- `firstName`
- `lastName`
- `email`
- `phone`
- `password`
- `dob`
- `gender`
- `college`
- `course`
- `district`
- `state`
- `rollNo`
- `guardian`
- `address`
- `pincode`
- `university`
- `degree`
- `department`
- `semester`
- `session`
- `profileImage`
- `signature`
- `status`
- `createdAt`
- `updatedAt`

Runtime compatibility columns:

- `studentCode`
- `registrationId`
- `profileImagePath`
- `signaturePath`
- `deletedAt`

Indexes:

- `idx_email`
- `idx_status`
- `idx_students_studentCode`
- `idx_students_registrationId`
- `idx_students_deletedAt`

## `pending_registrations`

Stores registration data before successful payment.

Important columns:

- `id`
- student identity/profile fields
- `password`
- `profileImage`
- `signature`
- `createdAt`
- `expiresAt`

Runtime columns:

- `registrationId`
- `profileImagePath`
- `signaturePath`

Indexes:

- `idx_pending_email`
- `idx_pending_created`
- `idx_pending_registrationId`

## `admins`

Stores admin users.

Important columns:

- `id`
- `email`
- `password`
- `fullName`
- `phone`
- `role`
- `lastLogin`
- `status`
- `createdAt`
- `updatedAt`

Roles:

- `super_admin`
- `admin`
- `moderator`

Indexes:

- `idx_email`
- `idx_role`

## `courses`

Stores internship/course definitions.

Important columns:

- `id`
- `courseName`
- `description`
- `duration`
- `instructor`
- `level`
- `certificate`
- `fee`
- `maxStudents`
- `enrolledStudents`
- `status`
- `syllabus`
- `prerequisites`
- `createdAt`
- `updatedAt`

Runtime optional column:

- `questions`

Indexes:

- `idx_status`
- `idx_level`

## `student_courses`

Stores course enrollment/progress.

Important columns:

- `id`
- `studentId`
- `courseId`
- `enrolledAt`
- `progress`
- `completedAt`
- `status`
- `marks`
- `grade`
- `certificateNumber`
- `quizData`

Runtime/admin unlock columns:

- `adminUnlockedAt`
- `adminUnlockedBy`

Constraints:

- Unique enrollment: `studentId`, `courseId`

Indexes:

- `idx_status`
- `idx_student_courses_certificate`

## `payments`

Stores payment records.

Important columns:

- `id`
- `studentId`
- `courseId`
- `amount`
- `paymentMethod`
- `gatewayPaymentId`
- `gatewayOrderId`
- `status`
- `notes`
- `createdAt`
- `completedAt`

Status values:

- `pending`
- `completed`
- `failed`
- `refunded`

Indexes:

- `idx_status`
- `idx_studentId`
- `idx_payments_order`
- `idx_payments_gateway_payment`

## `certificates`

Stores issued certificate records.

Important columns:

- `id`
- `studentId`
- `courseId`
- `certificateNumber`
- `issuedDate`
- `expiryDate`
- `status`
- `verificationCode`
- `certificateData`

Status values:

- `issued`
- `revoked`
- `suspended`

Indexes:

- `idx_studentId`
- `idx_certificateNumber`

## `attendance`

Stores attendance records.

Important columns:

- `id`
- `studentId`
- `courseId`
- `attendanceDate`
- `status`
- `remarks`
- `markedAt`

Unique key:

- `studentId`, `courseId`, `attendanceDate`

## `internship_proofs`

Stores student activity proof uploads.

Important columns:

- `id`
- `studentId`
- `courseId`
- `proofDate`
- `internshipMode`
- `topic`
- `workDescription`
- `screenshot`
- `fileName`
- `status`
- `adminRemarks`
- `uploadedAt`
- `reviewedAt`
- `reviewedBy`

Runtime optional columns:

- `screenshotPath`
- `fileMimeType`
- `fileSizeBytes`

Indexes:

- `idx_student_proof_status`
- `idx_proof_date`
- `idx_proof_status`
- `idx_proofs_student_course_date`

## `marks`

Stores course marks/grades.

Important columns:

- `id`
- `studentId`
- `courseId`
- `assignmentMarks`
- `midtermMarks`
- `finalMarks`
- `totalMarks`
- `grade`
- `remarks`
- `submittedAt`

Unique key:

- `studentId`, `courseId`

## `notifications`

Stores notification records.

Important columns:

- `id`
- `userId`
- `userType`
- `title`
- `message`
- `type`
- `isRead`
- `createdAt`

## `audit_logs`

Legacy/general audit log table.

Important columns:

- `id`
- `userId`
- `userType`
- `action`
- `description`
- `ipAddress`
- `userAgent`
- `createdAt`

## `password_resets`

Stores password reset tokens.

Important columns:

- `id`
- `email`
- `token`
- `expiresAt`
- `used`
- `createdAt`

## `uploaded_files`

Runtime-created table for uploaded file metadata.

Important columns:

- `id`
- `ownerType`
- `ownerId`
- `entityType`
- `entityId`
- `fieldName`
- `originalName`
- `storedName`
- `relativePath`
- `mimeType`
- `sizeBytes`
- `sha256`
- `createdAt`

## `admin_audit_logs`

Runtime-created table for admin action audit logging.

Important columns:

- `id`
- `adminId`
- `action`
- `entityType`
- `entityId`
- `beforeValue`
- `afterValue`
- `ipAddress`
- `userAgent`
- `createdAt`

## `api_request_logs`

Runtime-created table for API request logging.

Important columns:

- `id`
- `method`
- `path`
- `statusCode`
- `durationMs`
- `userId`
- `userRole`
- `ipAddress`
- `userAgent`
- `createdAt`

## Views

### `student_progress_view`

Combines students, enrollments, courses, and marks.

### `payment_summary_view`

Combines payments, students, and courses.

## Default Seed Courses

Default courses include:

- Skill Development
- Social Work
- Population Study
- Disaster Management
- Digital Literacy
- Web Development
- Cyber Security
- Entrepreneurship
- Financial Literacy
- Agriculture
- Healthcare
- Teacher Training
- Tourism
- HR Management

