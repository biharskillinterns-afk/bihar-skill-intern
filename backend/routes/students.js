const express = require('express');
const router = express.Router();
const { verifyToken, isStudent } = require('../middleware/auth');
const { addColumnIfMissing, withTransaction } = require('../utils/db');
const { saveDataUrlFile, recordUploadedFile } = require('../utils/security');
const { internshipProofInsertShape, safeRecordUploadedFile } = require('../utils/compat');

const REQUIRED_APPROVED_PROOF_DAYS = 5;
const ACTIVITY_PROOF_DAYS = 15;
const MIN_ACTIVITY_SCREENSHOTS = 5;
const MIN_ACTIVITY_IMAGE_BYTES = 20 * 1024;
const MAX_ACTIVITY_IMAGE_BYTES = 30 * 1024;

async function ensureStudentCourseUnlockColumns(connection) {
    try {
        await connection.query('ALTER TABLE student_courses ADD COLUMN adminUnlockedAt TIMESTAMP NULL');
    } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') {
            console.warn('adminUnlockedAt column unavailable; continuing with legacy unlock behavior:', error.message);
        }
    }

    try {
        await connection.query('ALTER TABLE student_courses ADD COLUMN adminUnlockedBy INT NULL');
    } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') {
            console.warn('adminUnlockedBy column unavailable; continuing with legacy unlock behavior:', error.message);
        }
    }
}

function normalizeDateInput(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return normalizeDateInput(date);
}

function estimateDataUrlBytes(value) {
    const text = String(value || '');
    const base64 = text.includes(',') ? text.split(',').pop() : text;
    const padding = (base64.match(/=+$/) || [''])[0].length;
    return Math.floor((base64.length * 3) / 4) - padding;
}

async function ensureInternshipProofsTable(connection) {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS internship_proofs (
            id INT PRIMARY KEY AUTO_INCREMENT,
            studentId INT NOT NULL,
            courseId INT NULL,
            proofDate DATE NOT NULL,
            internshipMode ENUM('online', 'offline') DEFAULT 'online',
            topic VARCHAR(255) NOT NULL,
            workDescription TEXT,
            screenshot LONGTEXT NOT NULL,
            fileName VARCHAR(255),
            status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
            adminRemarks TEXT,
            uploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewedAt TIMESTAMP NULL,
            reviewedBy INT NULL,
            INDEX idx_student_proof_status (studentId, status),
            INDEX idx_proof_date (proofDate),
            INDEX idx_proof_status (status)
        )
    `);
    try {
        await addColumnIfMissing(connection, 'internship_proofs', 'screenshotPath', 'VARCHAR(500) DEFAULT NULL');
        await addColumnIfMissing(connection, 'internship_proofs', 'fileMimeType', 'VARCHAR(120) DEFAULT NULL');
        await addColumnIfMissing(connection, 'internship_proofs', 'fileSizeBytes', 'INT DEFAULT NULL');
    } catch (error) {
        console.warn('Internship proof optional columns unavailable; continuing with legacy proof schema:', error.message);
    }
}

// Get student profile
router.get('/profile', verifyToken, isStudent, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        const [students] = await connection.query(
            `SELECT id, firstName, lastName, email, phone, dob, gender, college, course, district, state,
                    rollNo, rollNo AS rollno, guardian, address, pincode, university, degree, department, semester, session,
                    emergencyName, emergencyPhone, relationship, profileImage, signature, bio, status, createdAt, updatedAt
             FROM students WHERE id = ?`,
            [req.user.id]
        );
        connection.release();
        
        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        res.json({
            success: true,
            student: students[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile',
            error: error.message
        });
    }
});

// Update student profile
router.put('/profile', verifyToken, isStudent, async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            phone,
            college,
            course,
            rollNo,
            rollno,
            guardian,
            address,
            pincode,
            university,
            degree,
            department,
            semester,
            session,
            emergencyName,
            emergencyPhone,
            relationship,
            profileImage,
            signature
        } = req.body;
        const connection = await req.db.getConnection();
        
        await connection.query(
            `UPDATE students
             SET firstName = ?, lastName = ?, phone = ?, college = ?, course = ?,
                 rollNo = COALESCE(?, rollNo),
                 guardian = COALESCE(?, guardian),
                 address = COALESCE(?, address),
                 pincode = COALESCE(?, pincode),
                 university = COALESCE(?, university),
                 degree = COALESCE(?, degree),
                 department = COALESCE(?, department),
                 semester = COALESCE(?, semester),
                 session = COALESCE(?, session),
                 emergencyName = COALESCE(?, emergencyName),
                 emergencyPhone = COALESCE(?, emergencyPhone),
                 relationship = COALESCE(?, relationship),
                 profileImage = COALESCE(?, profileImage),
                 signature = COALESCE(?, signature)
             WHERE id = ?`,
            [
                firstName,
                lastName,
                phone,
                college,
                course,
                rollNo ?? rollno ?? null,
                guardian ?? null,
                address ?? null,
                pincode ?? null,
                university ?? null,
                degree ?? null,
                department ?? null,
                semester ?? null,
                session ?? null,
                emergencyName ?? null,
                emergencyPhone ?? null,
                relationship ?? null,
                profileImage ?? null,
                signature ?? null,
                req.user.id
            ]
        );
        
        connection.release();
        
        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
});

// Get student courses
router.get('/courses', verifyToken, isStudent, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        const [courses] = await connection.query(
            `SELECT c.* FROM courses c 
             JOIN student_courses sc ON c.id = sc.courseId 
             WHERE sc.studentId = ?`,
            [req.user.id]
        );
        connection.release();
        
        res.json({
            success: true,
            courses
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch courses',
            error: error.message
        });
    }
});

// Get student progress
router.get('/progress', verifyToken, isStudent, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        await ensureStudentCourseUnlockColumns(connection);
        const [progress] = await connection.query(
            `SELECT sc.*, c.courseName, c.duration FROM student_courses sc 
             JOIN courses c ON c.id = sc.courseId 
             WHERE sc.studentId = ?`,
            [req.user.id]
        );
        connection.release();
        
        res.json({
            success: true,
            progress
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch progress',
            error: error.message
        });
    }
});

// Get current student's internship work proofs
router.get('/proofs', verifyToken, isStudent, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        const [proofs] = await connection.query(
            `SELECT p.id, p.studentId, p.courseId, p.proofDate, p.internshipMode, p.topic,
                    p.workDescription, p.screenshot, p.fileName, p.status, p.adminRemarks,
                    p.uploadedAt, p.reviewedAt, c.courseName
             FROM internship_proofs p
             LEFT JOIN courses c ON c.id = p.courseId
             WHERE p.studentId = ?
             ORDER BY p.proofDate ASC, p.uploadedAt ASC`,
            [req.user.id]
        );
        connection.release();

        const approvedDays = new Set(
            proofs
                .filter(proof => proof.status === 'approved')
                .map(proof => normalizeDateInput(proof.proofDate))
                .filter(Boolean)
        );

        res.json({
            success: true,
            requiredApprovedDays: REQUIRED_APPROVED_PROOF_DAYS,
            approvedDays: approvedDays.size,
            certificateProofReady: approvedDays.size >= REQUIRED_APPROVED_PROOF_DAYS,
            proofs
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch internship proofs',
            error: error.message
        });
    }
});

// Upload a daily internship work proof
router.post('/proofs', verifyToken, isStudent, async (req, res) => {
    let connection;
    try {
        const {
            courseId,
            proofDate,
            internshipMode = 'online',
            topic,
            workDescription,
            screenshot,
            fileName
        } = req.body;

        const safeDate = normalizeDateInput(proofDate);
        const safeTopic = String(topic || '').trim();
        const safeScreenshot = String(screenshot || '').trim();

        if (!safeDate || !safeTopic || !safeScreenshot) {
            return res.status(400).json({
                success: false,
                message: 'Date, topic, and screenshot are required.'
            });
        }

        if (safeScreenshot.length > 2_800_000) {
            return res.status(413).json({
                success: false,
                message: 'Screenshot file is too large. Please upload a compressed image below 2 MB.'
            });
        }

        const result = await withTransaction(req.db, async tx => {
            connection = tx;
            await ensureInternshipProofsTable(connection);
            const storedScreenshot = await saveDataUrlFile({
                dataUrl: safeScreenshot,
                category: 'internship-proofs',
                ownerId: req.user.id,
                originalName: fileName || 'internship-proof'
            });
            const insertShape = await internshipProofInsertShape(connection);
            const optionalColumns = [];
            const optionalValues = [];
            if (insertShape.hasScreenshotPath) {
                optionalColumns.push('screenshotPath');
                optionalValues.push(storedScreenshot?.relativePath || null);
            }
            if (insertShape.hasFileMimeType) {
                optionalColumns.push('fileMimeType');
                optionalValues.push(storedScreenshot?.mimeType || null);
            }
            if (insertShape.hasFileSizeBytes) {
                optionalColumns.push('fileSizeBytes');
                optionalValues.push(storedScreenshot?.sizeBytes || null);
            }
            const [insertResult] = await connection.query(
                `INSERT INTO internship_proofs
                    (studentId, courseId, proofDate, internshipMode, topic, workDescription, screenshot, fileName${optionalColumns.length ? `, ${optionalColumns.join(', ')}` : ''}, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?${optionalValues.map(() => ', ?').join('')}, 'pending')`,
                [
                    req.user.id,
                    courseId || null,
                    safeDate,
                    internshipMode === 'offline' ? 'offline' : 'online',
                    safeTopic,
                    workDescription || '',
                    safeScreenshot,
                    fileName || '',
                    ...optionalValues
                ]
            );
            if (storedScreenshot) {
                await safeRecordUploadedFile(connection, recordUploadedFile, storedScreenshot, {
                    ownerType: 'student',
                    ownerId: req.user.id,
                    entityType: 'internship_proofs',
                    entityId: insertResult.insertId,
                    fieldName: 'screenshot'
                });
            }
            return insertResult;
        });

        res.json({
            success: true,
            message: 'Work proof uploaded. It will count as attendance after admin approval.',
            proofId: result.insertId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to upload internship proof',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

// Upload activity screenshots in one submission and auto-map them to attendance dates
router.post('/proofs/bulk', verifyToken, isStudent, async (req, res) => {
    let connection;
    try {
        const {
            courseId,
            startDate,
            internshipMode = 'online',
            topic,
            workDescription,
            screenshots = []
        } = req.body;

        const safeCourseId = courseId || null;
        const safeStartDate = normalizeDateInput(startDate) || normalizeDateInput(new Date());
        const safeTopic = String(topic || 'Activity Proof').trim();
        const safeMode = internshipMode === 'offline' ? 'offline' : 'online';

        if (!safeCourseId) {
            return res.status(400).json({
                success: false,
                message: 'Please select an enrolled course before uploading activity proof.'
            });
        }

        if (!Array.isArray(screenshots) || screenshots.length < MIN_ACTIVITY_SCREENSHOTS) {
            return res.status(400).json({
                success: false,
                message: `Please upload at least ${MIN_ACTIVITY_SCREENSHOTS} screenshots.`
            });
        }

        if (screenshots.length > ACTIVITY_PROOF_DAYS) {
            return res.status(400).json({
                success: false,
                message: `Please upload maximum ${ACTIVITY_PROOF_DAYS} screenshots in one submission.`
            });
        }

        for (const [index, item] of screenshots.entries()) {
            const screenshot = String(item?.screenshot || '').trim();
            const estimatedBytes = estimateDataUrlBytes(screenshot);
            if (!screenshot) {
                return res.status(400).json({
                    success: false,
                    message: `Screenshot ${index + 1} is missing.`
                });
            }

            if (estimatedBytes < MIN_ACTIVITY_IMAGE_BYTES || estimatedBytes > MAX_ACTIVITY_IMAGE_BYTES) {
                return res.status(400).json({
                    success: false,
                    message: `Screenshot ${index + 1} must be between 20 KB and 30 KB.`
                });
            }
        }

        connection = await req.db.getConnection();
        await connection.beginTransaction();
        await ensureInternshipProofsTable(connection);
        const [courses] = await connection.query(
            `SELECT sc.enrolledAt, c.courseName
             FROM student_courses sc
             JOIN courses c ON c.id = sc.courseId
             WHERE sc.studentId = ? AND sc.courseId = ?
             LIMIT 1`,
            [req.user.id, safeCourseId]
        );

        if (courses.length === 0) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: 'Please enroll in this course before uploading activity proof.'
            });
        }

        const enrollmentDate = normalizeDateInput(courses[0].enrolledAt);
        const baseDate = enrollmentDate || safeStartDate;
        const insertedIds = [];
        const insertShape = await internshipProofInsertShape(connection);
        for (const [index, item] of screenshots.entries()) {
            const storedScreenshot = await saveDataUrlFile({
                dataUrl: item.screenshot,
                category: 'internship-proofs',
                ownerId: req.user.id,
                originalName: item.fileName || `activity-proof-${index + 1}.jpg`
            });
            const optionalColumns = [];
            const optionalValues = [];
            if (insertShape.hasScreenshotPath) {
                optionalColumns.push('screenshotPath');
                optionalValues.push(storedScreenshot?.relativePath || null);
            }
            if (insertShape.hasFileMimeType) {
                optionalColumns.push('fileMimeType');
                optionalValues.push(storedScreenshot?.mimeType || null);
            }
            if (insertShape.hasFileSizeBytes) {
                optionalColumns.push('fileSizeBytes');
                optionalValues.push(storedScreenshot?.sizeBytes || null);
            }
            const [result] = await connection.query(
                `INSERT INTO internship_proofs
                    (studentId, courseId, proofDate, internshipMode, topic, workDescription, screenshot, fileName${optionalColumns.length ? `, ${optionalColumns.join(', ')}` : ''}, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?${optionalValues.map(() => ', ?').join('')}, 'pending')`,
                [
                    req.user.id,
                    safeCourseId,
                    addDays(baseDate, index),
                    safeMode,
                    `${safeTopic} - Day ${index + 1}`,
                    workDescription || `Activity proof for ${courses[0].courseName || 'selected course'} - Day ${index + 1}`,
                    item.screenshot,
                    item.fileName || `activity-proof-${index + 1}.jpg`,
                    ...optionalValues
                ]
            );
            if (storedScreenshot) {
                await safeRecordUploadedFile(connection, recordUploadedFile, storedScreenshot, {
                    ownerType: 'student',
                    ownerId: req.user.id,
                    entityType: 'internship_proofs',
                    entityId: result.insertId,
                    fieldName: 'screenshot'
                });
            }
            insertedIds.push(result.insertId);
        }

        await connection.commit();
        res.json({
            success: true,
            message: `${screenshots.length} activity proof screenshots uploaded. Dates were set from ${baseDate}. Attendance will count after admin approval.`,
            inserted: insertedIds.length,
            proofIds: insertedIds,
            attendanceStartDate: baseDate,
            attendanceEndDate: addDays(baseDate, ACTIVITY_PROOF_DAYS - 1)
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                // Transaction may already be closed.
            }
        }
        console.error('Activity proof bulk upload failed:', error);
        res.status(500).json({
            success: false,
            message: error.message ? `Failed to upload activity proofs: ${error.message}` : 'Failed to upload activity proofs',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
