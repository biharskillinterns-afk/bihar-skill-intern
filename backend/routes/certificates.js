const express = require('express');
const router = express.Router();
const { verifyToken, isStudent } = require('../middleware/auth');

// Public certificate verification by certificate number or internal certificate id.
router.get('/verify/:id', async (req, res) => {
    let connection;
    try {
        const certificateId = String(req.params.id || '').trim();
        if (!certificateId) {
            return res.status(400).json({
                success: false,
                message: 'Certificate ID is required'
            });
        }

        connection = await req.db.getConnection();
        const numericId = /^\d+$/.test(certificateId) ? Number(certificateId) : 0;
        const [certificates] = await connection.query(
            `SELECT cert.id, cert.certificateNumber, cert.issuedDate, cert.status,
                    c.courseName, CONCAT(s.firstName, ' ', s.lastName) AS studentName,
                    s.rollNo
             FROM certificates cert
             JOIN courses c ON cert.courseId = c.id
             JOIN students s ON cert.studentId = s.id
             WHERE cert.certificateNumber = ? OR cert.id = ?
             LIMIT 1`,
            [certificateId, numericId]
        );

        if (certificates.length > 0) {
            return res.json({
                success: true,
                certificate: certificates[0]
            });
        }

        const [courseCertificates] = await connection.query(
            `SELECT sc.id, sc.certificateNumber, sc.enrolledAt AS issuedDate,
                    'issued' AS status, c.courseName,
                    CONCAT(s.firstName, ' ', s.lastName) AS studentName,
                    s.rollNo
             FROM student_courses sc
             JOIN courses c ON sc.courseId = c.id
             JOIN students s ON sc.studentId = s.id
             WHERE sc.certificateNumber = ?
             LIMIT 1`,
            [certificateId]
        );

        if (courseCertificates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Certificate not found'
            });
        }

        res.json({
            success: true,
            certificate: courseCertificates[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to verify certificate',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

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
