const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const { getRegistrationAmount, setRegistrationAmount, DEFAULT_REGISTRATION_AMOUNT } = require('../config/settings');

function normalizeProofStatus(status) {
    return ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
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

async function ensureCourseQuestionsColumn(connection) {
    try {
        await connection.query('ALTER TABLE courses ADD COLUMN questions LONGTEXT NULL');
    } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
}

function parseQuestions(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function mergeQuestions(existingQuestions, incomingQuestions) {
    const merged = [];
    const seen = new Set();
    [...parseQuestions(existingQuestions), ...parseQuestions(incomingQuestions)].forEach(question => {
        if (!question || typeof question !== 'object') return;
        const text = String(question.q || question.question || question.text || '').trim().toLowerCase();
        const options = Array.isArray(question.options) ? question.options.join('|').toLowerCase() : '';
        const key = `${text}::${options}`;
        if (!text || seen.has(key)) return;
        seen.add(key);
        merged.push(question);
    });
    return merged;
}

function mergeCourseMaterial(existingMaterial = '', incomingMaterial = '') {
    const current = String(existingMaterial || '').trim();
    const next = String(incomingMaterial || '').trim();
    if (!next) return current;
    if (!current) return next;
    if (current.includes(next)) return current;
    return `${current}\n\n--- Added Material ---\n\n${next}`;
}

router.get('/settings/payment-amount', verifyToken, isAdmin, async (req, res) => {
    try {
        const amount = await getRegistrationAmount(req.db);
        res.json({
            success: true,
            amount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payment amount',
            error: error.message
        });
    }
});

router.put('/settings/payment-amount', verifyToken, isAdmin, async (req, res) => {
    try {
        const amount = await setRegistrationAmount(req.db, req.body.amount);
        res.json({
            success: true,
            amount,
            message: `Registration payment amount updated to ₹${amount}`
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to update payment amount'
        });
    }
});

router.post('/settings/payment-amount/reset', verifyToken, isAdmin, async (req, res) => {
    try {
        const amount = await setRegistrationAmount(req.db, DEFAULT_REGISTRATION_AMOUNT);
        res.json({
            success: true,
            amount,
            message: `Registration payment amount reset to ₹${amount}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to reset payment amount',
            error: error.message
        });
    }
});

// Get all students
router.get('/students', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        const [students] = await connection.query(
            `SELECT s.id, s.firstName, s.lastName, s.email, s.phone, s.dob, s.gender, s.college,
                    s.course, s.district, s.state, s.rollNo, s.rollNo AS rollno, s.pincode,
                    s.status, s.createdAt, p.status AS paymentStatus, p.amount AS paymentAmount,
                    p.gatewayPaymentId AS razorpayPaymentId, p.gatewayOrderId AS razorpayOrderId,
                    p.completedAt AS paymentCompletedAt, p.createdAt AS paymentCreatedAt
             FROM students s
             LEFT JOIN (
                SELECT p1.*
                FROM payments p1
                INNER JOIN (
                    SELECT studentId, MAX(id) AS latestPaymentId
                    FROM payments
                    GROUP BY studentId
                ) latest ON latest.latestPaymentId = p1.id
             ) p ON p.studentId = s.id
             ORDER BY s.createdAt DESC`
        );
        connection.release();
        
        res.json({
            success: true,
            total: students.length,
            students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch students',
            error: error.message
        });
    }
});

// Get student by ID
router.get('/students/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        const [students] = await connection.query(
            `SELECT s.id, s.firstName, s.lastName, s.email, s.phone, s.dob, s.gender, s.college,
                    s.course, s.district, s.state, s.rollNo, s.rollNo AS rollno, s.guardian, s.address,
                    s.pincode, s.university, s.degree, s.department, s.semester, s.session,
                    s.emergencyName, s.emergencyPhone, s.relationship, s.profileImage, s.signature,
                    s.bio, s.status, s.createdAt, s.updatedAt, p.status AS paymentStatus,
                    p.amount AS paymentAmount, p.gatewayPaymentId AS razorpayPaymentId,
                    p.gatewayOrderId AS razorpayOrderId, p.completedAt AS paymentCompletedAt,
                    p.createdAt AS paymentCreatedAt
             FROM students s
             LEFT JOIN (
                SELECT p1.*
                FROM payments p1
                INNER JOIN (
                    SELECT studentId, MAX(id) AS latestPaymentId
                    FROM payments
                    GROUP BY studentId
                ) latest ON latest.latestPaymentId = p1.id
             ) p ON p.studentId = s.id
             WHERE s.id = ?`,
            [req.params.id]
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
            message: 'Failed to fetch student',
            error: error.message
        });
    }
});

// Delete student
router.delete('/students/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        const [result] = await connection.query('DELETE FROM students WHERE id = ?', [req.params.id]);
        connection.release();
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Student deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete student',
            error: error.message
        });
    }
});

router.put('/students/:studentId/courses/:courseId/unlock', verifyToken, isAdmin, async (req, res) => {
    let connection;
    try {
        const { studentId, courseId } = req.params;
        const unlock = req.body.unlock !== false;

        connection = await req.db.getConnection();
        await ensureStudentCourseUnlockColumns(connection);

        const [students] = await connection.query('SELECT id FROM students WHERE id = ? LIMIT 1', [studentId]);
        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        const [courses] = await connection.query('SELECT id, courseName FROM courses WHERE id = ? LIMIT 1', [courseId]);
        if (courses.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        if (unlock) {
            await connection.query(
                `INSERT INTO student_courses
                    (studentId, courseId, enrolledAt, progress, status, adminUnlockedAt, adminUnlockedBy)
                 VALUES (?, ?, NOW(), 0, 'enrolled', NOW(), ?)
                 ON DUPLICATE KEY UPDATE
                    adminUnlockedAt = NOW(),
                    adminUnlockedBy = VALUES(adminUnlockedBy)`,
                [studentId, courseId, req.user.id]
            );
        } else {
            await connection.query(
                `UPDATE student_courses
                 SET adminUnlockedAt = NULL, adminUnlockedBy = NULL
                 WHERE studentId = ? AND courseId = ?`,
                [studentId, courseId]
            );
        }

        res.json({
            success: true,
            message: unlock
                ? 'Quiz, marksheet, certificate, and report unlocked for this student.'
                : 'Admin early unlock removed for this student.',
            studentId,
            courseId,
            courseName: courses[0].courseName,
            adminUnlocked: unlock
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update student course unlock',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

// Get dashboard stats
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        
        const [totalStudents] = await connection.query('SELECT COUNT(*) as count FROM students');
        const [totalCourses] = await connection.query('SELECT COUNT(*) as count FROM courses');
        const [totalCertificates] = await connection.query("SELECT COUNT(*) as count FROM certificates WHERE status = 'issued'");
        const [totalPayments] = await connection.query("SELECT SUM(amount) as total FROM payments WHERE status = 'completed'");
        
        connection.release();
        
        res.json({
            success: true,
            stats: {
                totalStudents: totalStudents[0].count,
                totalCourses: totalCourses[0].count,
                totalCertificates: totalCertificates[0].count,
                totalPayments: totalPayments[0].total || 0
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch stats',
            error: error.message
        });
    }
});

// Get internship work proofs for verification
router.get('/proofs', verifyToken, isAdmin, async (req, res) => {
    try {
        const status = req.query.status ? normalizeProofStatus(req.query.status) : null;
        const connection = await req.db.getConnection();
        await ensureInternshipProofsTable(connection);
        const params = [];
        const statusClause = status ? 'WHERE p.status = ?' : '';
        if (status) params.push(status);

        const [proofs] = await connection.query(
            `SELECT p.id, p.studentId, p.courseId, p.proofDate, p.internshipMode, p.topic,
                    p.workDescription, p.screenshot, p.fileName, p.status, p.adminRemarks,
                    p.uploadedAt, p.reviewedAt, c.courseName,
                    CONCAT(s.firstName, ' ', s.lastName) AS studentName,
                    s.email, s.phone, s.rollNo
             FROM internship_proofs p
             JOIN students s ON s.id = p.studentId
             LEFT JOIN courses c ON c.id = p.courseId
             ${statusClause}
             ORDER BY
                CASE p.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                p.uploadedAt DESC
             LIMIT 200`,
            params
        );
        connection.release();

        res.json({
            success: true,
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

// Approve or reject an internship work proof
router.put('/proofs/:id/review', verifyToken, isAdmin, async (req, res) => {
    let connection;
    try {
        const status = normalizeProofStatus(req.body.status);
        if (status === 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Review status must be approved or rejected.'
            });
        }

        connection = await req.db.getConnection();
        await ensureInternshipProofsTable(connection);
        const [proofRows] = await connection.query(
            'SELECT * FROM internship_proofs WHERE id = ? LIMIT 1',
            [req.params.id]
        );

        if (proofRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Proof not found'
            });
        }

        const proof = proofRows[0];
        await connection.query(
            `UPDATE internship_proofs
             SET status = ?, adminRemarks = ?, reviewedAt = NOW(), reviewedBy = ?
             WHERE id = ?`,
            [status, req.body.adminRemarks || '', req.user.id, req.params.id]
        );

        if (status === 'approved' && proof.courseId) {
            await connection.query(
                `INSERT INTO attendance (studentId, courseId, attendanceDate, status, remarks, markedAt)
                 VALUES (?, ?, ?, 'present', ?, NOW())
                 ON DUPLICATE KEY UPDATE
                    status = 'present',
                    remarks = VALUES(remarks),
                    markedAt = NOW()`,
                [
                    proof.studentId,
                    proof.courseId,
                    proof.proofDate,
                    `Approved work proof #${proof.id}`
                ]
            );
        }

        res.json({
            success: true,
            message: `Proof ${status}.`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to review proof',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

// Course Management Routes

// Get all courses
router.get('/courses', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        await ensureCourseQuestionsColumn(connection);
        const [courses] = await connection.query('SELECT * FROM courses ORDER BY createdAt DESC');
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

// Add new course
router.post('/courses', verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            name,
            courseName,
            description,
            duration,
            material,
            syllabus,
            questions,
            prerequisites,
            status
        } = req.body;
        const finalCourseName = courseName || name;
        const finalSyllabus = syllabus || material || '';
        const finalQuestions = Array.isArray(questions) ? JSON.stringify(questions) : (questions || null);
        
        if (!finalCourseName || !description) {
            return res.status(400).json({
                success: false,
                message: 'Course name and description are required'
            });
        }
        
        const connection = await req.db.getConnection();
        await ensureCourseQuestionsColumn(connection);
        
        const [result] = await connection.query(
            `INSERT INTO courses (courseName, description, duration, syllabus, questions, prerequisites, status, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [finalCourseName, description, duration || 30, finalSyllabus, finalQuestions, prerequisites || '', status || 'active']
        );
        
        connection.release();
        
        res.json({
            success: true,
            message: 'Course added successfully',
            courseId: result.insertId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to add course',
            error: error.message
        });
    }
});

// Update course
router.put('/courses/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            name,
            courseName,
            description,
            duration,
            material,
            syllabus,
            questions,
            prerequisites,
            status
        } = req.body;
        const finalQuestions = Array.isArray(questions) ? JSON.stringify(questions) : (questions || null);
        
        const connection = await req.db.getConnection();
        await ensureCourseQuestionsColumn(connection);

        const [existingRows] = await connection.query(
            'SELECT courseName, description, duration, syllabus, questions, prerequisites, status FROM courses WHERE id = ? LIMIT 1',
            [req.params.id]
        );

        if (existingRows.length === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        const existing = existingRows[0];
        const finalCourseName = courseName || name || existing.courseName;
        const finalSyllabus = syllabus || material || '';
        const mergedSyllabus = mergeCourseMaterial(existingRows[0].syllabus, finalSyllabus);
        const mergedQuestions = finalQuestions
            ? JSON.stringify(mergeQuestions(existingRows[0].questions, finalQuestions))
            : existingRows[0].questions;
        
        const [result] = await connection.query(
            `UPDATE courses
             SET courseName = ?, description = ?, duration = ?, syllabus = ?, questions = ?, prerequisites = ?, status = ?
             WHERE id = ?`,
            [
                finalCourseName,
                description || existing.description,
                duration || existing.duration || 30,
                mergedSyllabus,
                mergedQuestions,
                prerequisites || existing.prerequisites || '',
                status || existing.status || 'active',
                req.params.id
            ]
        );
        
        connection.release();
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Course updated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update course',
            error: error.message
        });
    }
});

// Delete course
router.delete('/courses/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        
        // Check if students are enrolled
        const [enrolled] = await connection.query(
            'SELECT COUNT(*) as count FROM student_courses WHERE courseId = ?',
            [req.params.id]
        );
        
        if (enrolled[0].count > 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'Cannot delete course with enrolled students'
            });
        }
        
        const [result] = await connection.query('DELETE FROM courses WHERE id = ?', [req.params.id]);
        connection.release();
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Course deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete course',
            error: error.message
        });
    }
});

module.exports = router;
