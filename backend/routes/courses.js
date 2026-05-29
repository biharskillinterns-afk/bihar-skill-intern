const express = require('express');
const router = express.Router();
const { verifyToken, isStudent } = require('../middleware/auth');

// Get all courses
router.get('/', async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        const [courses] = await connection.query('SELECT * FROM courses WHERE status = "active"');
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
            'SELECT id FROM courses WHERE id = ? AND status = "active"',
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

module.exports = router;
