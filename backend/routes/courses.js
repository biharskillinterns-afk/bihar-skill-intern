const express = require('express');
const router = express.Router();
const { verifyToken, isStudent } = require('../middleware/auth');
const { withTransaction } = require('../utils/db');
const { generateUniqueCertificateNumber } = require('../utils/ids');
const { compatColumnExists } = require('../utils/compat');

const QUIZ_UNLOCK_DAYS = 15;

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

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

async function ensureCourseQuestionsColumn(connection) {
    try {
        await connection.query('ALTER TABLE courses ADD COLUMN questions LONGTEXT NULL');
    } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
}

// Get all courses
router.get('/', async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        await ensureCourseQuestionsColumn(connection);
        const [courses] = await connection.query("SELECT * FROM courses WHERE status = 'active'");
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

// Get course by ID
router.get('/:id', async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        await ensureCourseQuestionsColumn(connection);
        const [courses] = await connection.query('SELECT * FROM courses WHERE id = ?', [req.params.id]);
        connection.release();
        
        if (courses.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        res.json({
            success: true,
            course: courses[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch course',
            error: error.message
        });
    }
});

// Enroll in course
router.post('/:id/enroll', verifyToken, isStudent, async (req, res) => {
    try {
        const connection = await req.db.getConnection();

        const [courses] = await connection.query(
            "SELECT id FROM courses WHERE id = ? AND status = 'active'",
            [req.params.id]
        );

        if (courses.length === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'Course not found or inactive'
            });
        }
        
        // Check if already enrolled
        const [existing] = await connection.query(
            'SELECT id FROM student_courses WHERE studentId = ? AND courseId = ?',
            [req.user.id, req.params.id]
        );
        
        if (existing.length > 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'Already enrolled in this course'
            });
        }
        
        // Enroll student
        const [result] = await connection.query(
            'INSERT INTO student_courses (studentId, courseId, enrolledAt, progress) VALUES (?, ?, NOW(), 0)',
            [req.user.id, req.params.id]
        );
        
        connection.release();
        
        res.json({
            success: true,
            message: 'Successfully enrolled in course'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to enroll',
            error: error.message
        });
    }
});

// Save course progress and completion result
router.put('/:id/progress', verifyToken, isStudent, async (req, res) => {
    let connection;
    try {
        const courseId = req.params.id;
        const {
            progress = 0,
            status,
            marks,
            grade,
            certificateNumber,
            quizData
        } = req.body;

        const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
        const finalStatus = status || (safeProgress >= 100 ? 'completed' : safeProgress > 0 ? 'in_progress' : 'enrolled');

        const result = await withTransaction(req.db, async tx => {
            connection = tx;
            await ensureStudentCourseUnlockColumns(connection);

            const [courses] = await connection.query(
                "SELECT id FROM courses WHERE id = ? AND status = 'active'",
                [courseId]
            );

            if (courses.length === 0) {
                const error = new Error('Course not found or inactive');
                error.statusCode = 404;
                throw error;
            }

            const hasAdminUnlockedAt = await compatColumnExists(connection, 'student_courses', 'adminUnlockedAt');
            const hasCertificateNumber = await compatColumnExists(connection, 'student_courses', 'certificateNumber');
            const hasGrade = await compatColumnExists(connection, 'student_courses', 'grade');
            const hasQuizData = await compatColumnExists(connection, 'student_courses', 'quizData');
            const selectOptionalColumns = [
                hasAdminUnlockedAt ? 'adminUnlockedAt' : 'NULL AS adminUnlockedAt',
                hasCertificateNumber ? 'certificateNumber' : 'NULL AS certificateNumber'
            ].join(', ');
            const [existingEnrollment] = await connection.query(
                `SELECT id, enrolledAt, ${selectOptionalColumns} FROM student_courses WHERE studentId = ? AND courseId = ? LIMIT 1 FOR UPDATE`,
                [req.user.id, courseId]
            );

            const enrolledAt = existingEnrollment[0]?.enrolledAt
                ? new Date(existingEnrollment[0].enrolledAt)
                : new Date();
            const quizUnlockAt = addDays(enrolledAt, QUIZ_UNLOCK_DAYS);

            const adminUnlocked = Boolean(existingEnrollment[0]?.adminUnlockedAt);
            if (finalStatus === 'completed' && !adminUnlocked && Date.now() < quizUnlockAt.getTime()) {
                const error = new Error(`Quiz can be completed only after ${QUIZ_UNLOCK_DAYS} days from enrollment.`);
                error.statusCode = 403;
                error.details = {
                    quizUnlockAt: quizUnlockAt.toISOString(),
                    enrolledAt: enrolledAt.toISOString()
                };
                throw error;
            }

            let finalCertificateNumber = certificateNumber || existingEnrollment[0]?.certificateNumber || null;
            if (finalStatus === 'completed' && hasCertificateNumber) {
                if (!finalCertificateNumber) {
                    finalCertificateNumber = await generateUniqueCertificateNumber(connection, req.user.id, courseId);
                } else {
                    const [duplicates] = await connection.query(
                        'SELECT id FROM student_courses WHERE certificateNumber = ? AND NOT (studentId = ? AND courseId = ?) LIMIT 1',
                        [finalCertificateNumber, req.user.id, courseId]
                    );
                    if (duplicates.length > 0) {
                        finalCertificateNumber = await generateUniqueCertificateNumber(connection, req.user.id, courseId);
                    }
                }
            }

            const columns = ['studentId', 'courseId', 'enrolledAt', 'progress', 'status', 'marks'];
            const valuesSql = ['?', '?', 'NOW()', '?', '?', '?'];
            const values = [req.user.id, courseId, safeProgress, finalStatus, marks ?? null];
            const updates = [
                'progress = VALUES(progress)',
                'status = VALUES(status)',
                'marks = VALUES(marks)'
            ];

            if (hasGrade) {
                columns.push('grade');
                valuesSql.push('?');
                values.push(grade || null);
                updates.push('grade = VALUES(grade)');
            }
            if (hasCertificateNumber) {
                columns.push('certificateNumber');
                valuesSql.push('?');
                values.push(finalCertificateNumber);
                updates.push('certificateNumber = VALUES(certificateNumber)');
            }
            if (hasQuizData) {
                columns.push('quizData');
                valuesSql.push('?');
                values.push(quizData ? JSON.stringify(quizData) : null);
                updates.push('quizData = VALUES(quizData)');
            }
            columns.push('completedAt');
            valuesSql.push("IF(? = 'completed', NOW(), NULL)");
            values.push(finalStatus);
            updates.push("completedAt = IF(VALUES(status) = 'completed', COALESCE(completedAt, NOW()), completedAt)");

            await connection.query(
                `INSERT INTO student_courses (${columns.join(', ')})
                 VALUES (${valuesSql.join(', ')})
                 ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
                values
            );

            return { enrolledAt, quizUnlockAt, adminUnlocked, certificateNumber: finalCertificateNumber };
        });

        res.json({
            success: true,
            message: 'Course progress saved',
            enrolledAt: result.enrolledAt.toISOString(),
            quizUnlockAt: result.quizUnlockAt.toISOString(),
            adminUnlocked: result.adminUnlocked,
            certificateNumber: result.certificateNumber
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Failed to save course progress',
            ...(error.details || {}),
            error: error.message
        });
    } finally {
        connection = null;
    }
});

module.exports = router;
