const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');

// Get all students
router.get('/students', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        const [students] = await connection.query(
            `SELECT id, firstName, lastName, email, phone, dob, gender, college, course, district, state, status, createdAt
             FROM students`
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
            `SELECT id, firstName, lastName, email, phone, dob, gender, college, course, district, state, profileImage, bio, status, createdAt, updatedAt
             FROM students WHERE id = ?`,
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

// Get dashboard stats
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        
        const [totalStudents] = await connection.query('SELECT COUNT(*) as count FROM students');
        const [totalCourses] = await connection.query('SELECT COUNT(*) as count FROM courses');
        const [totalCertificates] = await connection.query('SELECT COUNT(*) as count FROM certificates WHERE status = "issued"');
        const [totalPayments] = await connection.query('SELECT SUM(amount) as total FROM payments WHERE status = "completed"');
        
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

// Course Management Routes

// Get all courses
router.get('/courses', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
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
            prerequisites,
            status
        } = req.body;
        const finalCourseName = courseName || name;
        const finalSyllabus = syllabus || material || '';
        
        if (!finalCourseName || !description) {
            return res.status(400).json({
                success: false,
                message: 'Course name and description are required'
            });
        }
        
        const connection = await req.db.getConnection();
        
        const [result] = await connection.query(
            `INSERT INTO courses (courseName, description, duration, syllabus, prerequisites, status, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [finalCourseName, description, duration || 30, finalSyllabus, prerequisites || '', status || 'active']
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
            prerequisites,
            status
        } = req.body;
        const finalCourseName = courseName || name;
        const finalSyllabus = syllabus || material || '';
        
        const connection = await req.db.getConnection();
        
        const [result] = await connection.query(
            `UPDATE courses
             SET courseName = ?, description = ?, duration = ?, syllabus = ?, prerequisites = ?, status = ?
             WHERE id = ?`,
            [finalCourseName, description, duration || 30, finalSyllabus, prerequisites || '', status || 'active', req.params.id]
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
