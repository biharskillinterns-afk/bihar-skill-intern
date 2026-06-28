const express = require('express');
const router = express.Router();
const { verifyToken, isStudent } = require('../middleware/auth');

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
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }

    try {
        await connection.query('ALTER TABLE student_courses ADD COLUMN adminUnlockedBy INT NULL');
    } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
}

// Get all courses
router.get('/', async (req, res) => {
    try {
        const connection = await req.db.getConnection();
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

        connection = await req.db.getConnection();
        await ensureStudentCourseUnlockColumns(connection);

        const [courses] = await connection.query(
            "SELECT id FROM courses WHERE id = ? AND status = 'active'",
            [courseId]
        );

        if (courses.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Course not found or inactive'
            });
        }

        const [existingEnrollment] = await connection.query(
            'SELECT id, enrolledAt, adminUnlockedAt FROM student_courses WHERE studentId = ? AND courseId = ? LIMIT 1',
            [req.user.id, courseId]
        );

        const enrolledAt = existingEnrollment[0]?.enrolledAt
            ? new Date(existingEnrollment[0].enrolledAt)
            : new Date();
        const quizUnlockAt = addDays(enrolledAt, QUIZ_UNLOCK_DAYS);

        const adminUnlocked = Boolean(existingEnrollment[0]?.adminUnlockedAt);
        if (finalStatus === 'completed' && !adminUnlocked && Date.now() < quizUnlockAt.getTime()) {
            return res.status(403).json({
                success: false,
                message: `Quiz can be completed only after ${QUIZ_UNLOCK_DAYS} days from enrollment.`,
                quizUnlockAt: quizUnlockAt.toISOString(),
                enrolledAt: enrolledAt.toISOString()
            });
        }

        await connection.query(
            `INSERT INTO student_courses
                (studentId, courseId, enrolledAt, progress, status, marks, grade, certificateNumber, quizData, completedAt)
             VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, IF(? = 'completed', NOW(), NULL))
             ON DUPLICATE KEY UPDATE
                progress = VALUES(progress),
                status = VALUES(status),
                marks = VALUES(marks),
                grade = VALUES(grade),
                certificateNumber = VALUES(certificateNumber),
                quizData = VALUES(quizData),
                completedAt = IF(VALUES(status) = 'completed', COALESCE(completedAt, NOW()), completedAt)`,
            [
                req.user.id,
                courseId,
                safeProgress,
                finalStatus,
                marks ?? null,
                grade || null,
                certificateNumber || null,
                quizData ? JSON.stringify(quizData) : null,
                finalStatus
            ]
        );

        res.json({
            success: true,
            message: 'Course progress saved',
            enrolledAt: enrolledAt.toISOString(),
            quizUnlockAt: quizUnlockAt.toISOString(),
            adminUnlocked
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to save course progress',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
