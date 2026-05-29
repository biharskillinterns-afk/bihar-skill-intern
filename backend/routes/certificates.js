const express = require('express');
const router = express.Router();
const { verifyToken, isStudent } = require('../middleware/auth');

// Get student certificates
router.get('/', verifyToken, isStudent, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        const [certificates] = await connection.query(
            `SELECT cert.*, c.courseName, CONCAT(s.firstName, ' ', s.lastName) AS studentName
             FROM certificates cert
             JOIN courses c ON cert.courseId = c.id
             JOIN students s ON cert.studentId = s.id
             WHERE cert.studentId = ?
             ORDER BY cert.issuedDate DESC`,
            [req.user.id]
        );
        connection.release();
        
        res.json({
            success: true,
            certificates
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch certificates',
            error: error.message
        });
    }
});

// Get certificate by ID
router.get('/:id', verifyToken, isStudent, async (req, res) => {
    try {
        const connection = await req.db.getConnection();
        const [certificates] = await connection.query(
            `SELECT cert.*, c.courseName, CONCAT(s.firstName, ' ', s.lastName) AS studentName
             FROM certificates cert
             JOIN courses c ON cert.courseId = c.id
             JOIN students s ON cert.studentId = s.id
             WHERE cert.id = ? AND cert.studentId = ?`,
            [req.params.id, req.user.id]
        );
        connection.release();
        
        if (certificates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Certificate not found'
            });
        }
        
        res.json({
            success: true,
            certificate: certificates[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch certificate',
            error: error.message
        });
    }
});

// Generate certificate PDF
router.get('/:id/download', verifyToken, isStudent, async (req, res) => {
    try {
        // In production, use a library like puppeteer or pdfkit to generate PDF
        res.json({
            success: true,
            message: 'PDF generation will be implemented',
            // Return download link when implemented
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate PDF',
            error: error.message
        });
    }
});

module.exports = router;
