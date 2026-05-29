const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { validateStudentRegistration, validateLogin, validateForgotPassword, validateResetPassword, validateAdminRegistration } = require('../middleware/validation');
const { verifyToken } = require('../middleware/auth');

const getJwtSecret = () => {
    if (process.env.JWT_SECRET) {
        return process.env.JWT_SECRET;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production');
    }

    return 'bihar-skill-intern-dev-secret';
};
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost';

// Student Registration
router.post('/register', validateStudentRegistration, async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, dob, gender, college, course = '', district } = req.body;
        
        const connection = await req.db.getConnection();
        
        // Check if user already exists
        const [existingUser] = await connection.query('SELECT id FROM students WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert student
        const [result] = await connection.query(
            `INSERT INTO students (firstName, lastName, email, phone, password, dob, gender, college, course, district, createdAt) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [firstName, lastName, email, phone, hashedPassword, dob, gender, college, course, district]
        );
        
        connection.release();

        const token = jwt.sign(
            { id: result.insertId, email, role: 'student' },
            getJwtSecret(),
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );
        
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            token,
            student: {
                id: result.insertId,
                firstName,
                lastName,
                email,
                phone
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

// Student Login
router.post('/login', validateLogin, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const connection = await req.db.getConnection();
        const [students] = await connection.query('SELECT * FROM students WHERE email = ?', [email]);
        
        if (students.length === 0) {
            connection.release();
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        const student = students[0];
        const isPasswordValid = await bcrypt.compare(password, student.password);
        
        if (!isPasswordValid) {
            connection.release();
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const [completedPayments] = await connection.query(
            'SELECT id FROM payments WHERE studentId = ? AND status = "completed" LIMIT 1',
            [student.id]
        );
        connection.release();

        const paymentStatus = completedPayments.length > 0 ? 'completed' : 'pending';
        
        // Generate JWT
        const token = jwt.sign(
            { id: student.id, email: student.email, role: 'student' },
            getJwtSecret(),
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            student: {
                id: student.id,
                firstName: student.firstName,
                lastName: student.lastName,
                email: student.email,
                phone: student.phone,
                paymentStatus
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

// Forgot Password
router.post('/forgot-password', validateForgotPassword, async (req, res) => {
    try {
        const { email } = req.body;
        
        const connection = await req.db.getConnection();
        
        // Check if user exists (student or admin)
        let user = null;
        let userType = '';
        
        const [students] = await connection.query('SELECT id, firstName, email FROM students WHERE email = ?', [email]);
        if (students.length > 0) {
            user = students[0];
            userType = 'student';
        } else {
            const [admins] = await connection.query('SELECT id, fullName, email FROM admins WHERE email = ?', [email]);
            if (admins.length > 0) {
                user = admins[0];
                userType = 'admin';
            }
        }
        
        if (!user) {
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'No account found with this email'
            });
        }
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        
        // Save token to database
        await connection.query(
            'INSERT INTO password_resets (email, token, expiresAt) VALUES (?, ?, ?)',
            [email, resetToken, expiresAt]
        );
        
        connection.release();
        
        // Send email
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        
        const resetUrl = `${FRONTEND_URL}/reset-password.html?token=${resetToken}`;
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset Request',
            html: `
                <h2>Password Reset Request</h2>
                <p>Hello ${user.firstName || user.fullName},</p>
                <p>You requested a password reset for your account.</p>
                <p>Click the link below to reset your password:</p>
                <a href="${resetUrl}">Reset Password</a>
                <p>This link will expire in 15 minutes.</p>
                <p>If you didn't request this, please ignore this email.</p>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        res.json({
            success: true,
            message: 'Password reset link sent to your email'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Failed to send reset email',
            error: error.message
        });
    }
});

// Reset Password
router.post('/reset-password', validateResetPassword, async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        const connection = await req.db.getConnection();
        
        // Find valid token
        const [resets] = await connection.query(
            'SELECT * FROM password_resets WHERE token = ? AND expiresAt > NOW() AND used = FALSE',
            [token]
        );
        
        if (resets.length === 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }
        
        const reset = resets[0];
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password (check both tables)
        let updateResult;
        const [studentUpdate] = await connection.query(
            'UPDATE students SET password = ? WHERE email = ?',
            [hashedPassword, reset.email]
        );
        
        if (studentUpdate.affectedRows === 0) {
            const [adminUpdate] = await connection.query(
                'UPDATE admins SET password = ? WHERE email = ?',
                [hashedPassword, reset.email]
            );
            updateResult = adminUpdate;
        } else {
            updateResult = studentUpdate;
        }
        
        if (updateResult.affectedRows === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Mark token as used
        await connection.query('UPDATE password_resets SET used = TRUE WHERE id = ?', [reset.id]);
        
        connection.release();
        
        res.json({
            success: true,
            message: 'Password reset successful'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Password reset failed',
            error: error.message
        });
    }
});

// Admin Registration
router.post('/admin/register', validateAdminRegistration, async (req, res) => {
    try {
        const { email, password, fullName, setupKey } = req.body;
        
        const connection = await req.db.getConnection();

        const [adminCountRows] = await connection.query('SELECT COUNT(*) AS count FROM admins');
        const hasAdmins = adminCountRows[0].count > 0;

        if (hasAdmins && process.env.ADMIN_REGISTRATION_KEY && setupKey !== process.env.ADMIN_REGISTRATION_KEY) {
            connection.release();
            return res.status(403).json({
                success: false,
                message: 'Admin registration is restricted'
            });
        }

        if (hasAdmins && !process.env.ADMIN_REGISTRATION_KEY) {
            connection.release();
            return res.status(403).json({
                success: false,
                message: 'Admin registration is disabled after setup'
            });
        }
        
        // Check if admin exists
        const [existingAdmin] = await connection.query('SELECT id FROM admins WHERE email = ?', [email]);
        if (existingAdmin.length > 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'Admin email already registered'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert admin
        const [result] = await connection.query(
            `INSERT INTO admins (email, password, fullName, role, createdAt) VALUES (?, ?, ?, ?, NOW())`,
            [email, hashedPassword, fullName, hasAdmins ? 'admin' : 'super_admin']
        );
        
        connection.release();
        
        res.status(201).json({
            success: true,
            message: 'Admin registration successful',
            adminId: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Admin registration failed',
            error: error.message
        });
    }
});

// Admin Login
router.post('/admin/login', validateLogin, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const connection = await req.db.getConnection();
        const [admins] = await connection.query('SELECT * FROM admins WHERE email = ?', [email]);
        connection.release();
        
        if (admins.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid admin credentials'
            });
        }
        
        const admin = admins[0];
        const isPasswordValid = await bcrypt.compare(password, admin.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid admin credentials'
            });
        }
        
        // Generate JWT
        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: 'admin' },
            getJwtSecret(),
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );
        
        res.json({
            success: true,
            message: 'Admin login successful',
            token,
            admin: {
                id: admin.id,
                email: admin.email,
                fullName: admin.fullName,
                role: admin.role
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Admin login failed',
            error: error.message
        });
    }
});

// Verify Token
router.get('/verify', verifyToken, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

module.exports = router;
