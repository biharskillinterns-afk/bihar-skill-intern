const express = require('express');
const router = express.Router();
const { verifyToken, isStudent } = require('../middleware/auth');

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

module.exports = router;
