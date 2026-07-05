const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { validateStudentRegistration, validateLogin, validateForgotPassword, validateResetPassword, validateAdminRegistration } = require('../middleware/validation');
const { verifyToken } = require('../middleware/auth');
const { syncCompletedPaymentsForStudent } = require('./payments');
const { withTransaction } = require('../utils/db');
const { buildRegistrationId, buildStudentCode } = require('../utils/ids');
const { normalizeEmail, saveDataUrlFile, recordUploadedFile } = require('../utils/security');
const { compatColumnExists, studentActiveClause, updateStudentGeneratedIds, updatePendingRegistrationId, safeRecordUploadedFile } = require('../utils/compat');

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

const normalizeDateOnly = (value) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const text = String(value).trim();
    const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
};

// Student Registration
router.post('/register', validateStudentRegistration, async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            password,
            dob,
            gender,
            college,
            course = '',
            district,
            rollNo,
            rollno,
            guardian,
            address,
            pincode,
            university,
            degree,
            department,
            majorSubject,
            semester,
            session,
            emergencyName,
            emergencyPhone,
            relationship,
            profileImage,
            signature
        } = req.body;

        const cleanEmail = normalizeEmail(email);
        const hashedPassword = await bcrypt.hash(password, 12);
        const savedStudent = await withTransaction(req.db, async connection => {
            const activeClause = await studentActiveClause(connection);
            const [existingUser] = await connection.query(
                `SELECT id FROM students WHERE LOWER(email) = ?${activeClause} LIMIT 1 FOR UPDATE`,
                [cleanEmail]
            );

            if (existingUser.length > 0) {
                const error = new Error('Email already registered');
                error.statusCode = 400;
                throw error;
            }

            const studentColumns = [
                'firstName', 'lastName', 'email', 'phone', 'password', 'dob', 'gender', 'college', 'course', 'district',
                'rollNo', 'guardian', 'address', 'pincode', 'university', 'degree', 'department', 'semester', 'session',
                'emergencyName', 'emergencyPhone', 'relationship', 'profileImage', 'signature'
            ];
            const studentValues = [
                firstName,
                lastName,
                cleanEmail,
                phone,
                hashedPassword,
                dob,
                gender,
                college,
                course,
                district,
                rollNo || rollno || '',
                guardian || '',
                address || '',
                pincode || '',
                university || 'Veer Kunwar Singh University',
                degree || '',
                department || '',
                semester || '',
                session || '',
                emergencyName || '',
                emergencyPhone || '',
                relationship || '',
                profileImage || '',
                signature || ''
            ];
            if (await compatColumnExists(connection, 'students', 'majorSubject')) {
                const departmentIndex = studentColumns.indexOf('department');
                studentColumns.splice(departmentIndex + 1, 0, 'majorSubject');
                studentValues.splice(departmentIndex + 1, 0, majorSubject || '');
            }
            const [result] = await connection.query(
                `INSERT INTO students (${studentColumns.join(', ')}, createdAt)
                 VALUES (${studentColumns.map(() => '?').join(', ')}, NOW())`,
                studentValues
            );

            const studentId = result.insertId;
            const studentCode = buildStudentCode(studentId);
            const registrationId = buildRegistrationId(studentId);
            const profileFile = await saveDataUrlFile({ dataUrl: profileImage, category: 'profile-images', ownerId: studentId, originalName: 'profile-image' });
            const signatureFile = await saveDataUrlFile({ dataUrl: signature, category: 'signatures', ownerId: studentId, originalName: 'signature' });
            if (profileFile) await safeRecordUploadedFile(connection, recordUploadedFile, profileFile, { ownerType: 'student', ownerId: studentId, entityType: 'students', entityId: studentId, fieldName: 'profileImage' });
            if (signatureFile) await safeRecordUploadedFile(connection, recordUploadedFile, signatureFile, { ownerType: 'student', ownerId: studentId, entityType: 'students', entityId: studentId, fieldName: 'signature' });
            await updateStudentGeneratedIds(connection, studentId, {
                studentCode,
                registrationId,
                profileImagePath: profileFile?.relativePath || null,
                signaturePath: signatureFile?.relativePath || null
            });

            return { id: studentId, studentCode, registrationId };
        });

        const token = jwt.sign(
            { id: savedStudent.id, email: cleanEmail, role: 'student' },
            getJwtSecret(),
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );
        
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            token,
            student: {
                id: savedStudent.id,
                studentCode: savedStudent.studentCode,
                registrationId: savedStudent.registrationId,
                firstName,
                lastName,
                email: cleanEmail,
                phone,
                dob,
                gender,
                college,
                course,
                district,
                rollNo: rollNo || rollno || '',
                rollno: rollNo || rollno || '',
                guardian: guardian || '',
                address: address || '',
                pincode: pincode || '',
                university: university || 'Veer Kunwar Singh University',
                degree: degree || '',
                department: department || '',
                majorSubject: majorSubject || '',
                semester: semester || '',
                session: session || '',
                emergencyName: emergencyName || '',
                emergencyPhone: emergencyPhone || '',
                relationship: relationship || '',
                profileImage: profileImage || '',
                signature: signature || ''
            }
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Registration failed',
            error: error.message
        });
    }
});

// Save registration details temporarily. The real student login is created only after payment is completed.
router.post('/pending-registration', validateStudentRegistration, async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            password,
            dob,
            gender,
            college,
            course = '',
            district,
            rollNo,
            rollno,
            guardian,
            address,
            pincode,
            university,
            degree,
            department,
            majorSubject,
            semester,
            session,
            emergencyName,
            emergencyPhone,
            relationship,
            profileImage,
            signature
        } = req.body;

        const cleanEmail = normalizeEmail(email);
        const hashedPassword = await bcrypt.hash(password, 12);
        const pending = await withTransaction(req.db, async connection => {
            const activeClause = await studentActiveClause(connection);
            const [existingUser] = await connection.query(
                `SELECT id FROM students WHERE LOWER(email) = ?${activeClause} LIMIT 1 FOR UPDATE`,
                [cleanEmail]
            );

            if (existingUser.length > 0) {
                const error = new Error('Email already registered');
                error.statusCode = 400;
                throw error;
            }

            await connection.query('DELETE FROM pending_registrations WHERE LOWER(email) = ?', [cleanEmail]);
            const pendingColumns = [
                'firstName', 'lastName', 'email', 'phone', 'password', 'dob', 'gender', 'college', 'course', 'district',
                'rollNo', 'guardian', 'address', 'pincode', 'university', 'degree', 'department', 'semester', 'session',
                'emergencyName', 'emergencyPhone', 'relationship', 'profileImage', 'signature'
            ];
            const pendingValues = [
                firstName,
                lastName,
                cleanEmail,
                phone,
                hashedPassword,
                dob,
                gender,
                college,
                course,
                district,
                rollNo || rollno || '',
                guardian || '',
                address || '',
                pincode || '',
                university || 'Veer Kunwar Singh University',
                degree || '',
                department || '',
                semester || '',
                session || '',
                emergencyName || '',
                emergencyPhone || '',
                relationship || '',
                profileImage || '',
                signature || ''
            ];
            if (await compatColumnExists(connection, 'pending_registrations', 'majorSubject')) {
                const departmentIndex = pendingColumns.indexOf('department');
                pendingColumns.splice(departmentIndex + 1, 0, 'majorSubject');
                pendingValues.splice(departmentIndex + 1, 0, majorSubject || '');
            }
            const [result] = await connection.query(
                `INSERT INTO pending_registrations (${pendingColumns.join(', ')}, expiresAt, createdAt)
                 VALUES (${pendingColumns.map(() => '?').join(', ')}, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW())`,
                pendingValues
            );

            const registrationId = buildRegistrationId(result.insertId);
            await updatePendingRegistrationId(connection, result.insertId, registrationId);
            return { id: result.insertId, registrationId };
        });

        res.status(201).json({
            success: true,
            message: 'Registration details saved. Complete payment to create your login.',
            pendingRegistrationId: pending.id,
            registrationId: pending.registrationId,
            student: {
                id: `pending_${pending.id}`,
                pendingRegistrationId: pending.id,
                registrationId: pending.registrationId,
                firstName,
                lastName,
                email: cleanEmail,
                phone,
                dob,
                gender,
                college,
                course,
                district,
                rollNo: rollNo || rollno || '',
                rollno: rollNo || rollno || '',
                guardian: guardian || '',
                address: address || '',
                pincode: pincode || '',
                university: university || 'Veer Kunwar Singh University',
                degree: degree || '',
                department: department || '',
                majorSubject: majorSubject || '',
                semester: semester || '',
                session: session || '',
                emergencyName: emergencyName || '',
                emergencyPhone: emergencyPhone || '',
                relationship: relationship || '',
                profileImage: profileImage || '',
                signature: signature || '',
                paymentStatus: 'pending'
            }
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Registration could not be saved',
            error: error.message
        });
    }
});

// Student Login
router.post('/login', validateLogin, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const connection = await req.db.getConnection();
        const activeClause = await studentActiveClause(connection);
        const [students] = await connection.query(`SELECT * FROM students WHERE email = ?${activeClause}`, [email]);
        
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
            "SELECT id FROM payments WHERE studentId = ? AND status = 'completed' LIMIT 1",
            [student.id]
        );
        connection.release();

        let paymentStatus = completedPayments.length > 0 ? 'completed' : 'pending';
        if (paymentStatus === 'pending') {
            const synced = await syncCompletedPaymentsForStudent(req.db, student.id, student.email);
            paymentStatus = synced ? 'completed' : 'pending';
        }
        
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
                dob: student.dob,
                gender: student.gender,
                college: student.college,
                course: student.course,
                district: student.district,
                state: student.state,
                rollNo: student.rollNo,
                rollno: student.rollNo,
                guardian: student.guardian,
                address: student.address,
                pincode: student.pincode,
                university: student.university,
                degree: student.degree,
                department: student.department,
                majorSubject: student.majorSubject || '',
                semester: student.semester,
                session: student.session,
                emergencyName: student.emergencyName,
                emergencyPhone: student.emergencyPhone,
                relationship: student.relationship,
                profileImage: student.profileImage,
                signature: student.signature,
                bio: student.bio,
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
        
        const activeClause = await studentActiveClause(connection);
        const [students] = await connection.query(`SELECT id, firstName, email FROM students WHERE email = ?${activeClause}`, [email]);
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
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        // Update password (check both tables)
        let updateResult;
        const [studentUpdate] = await connection.query(
            `UPDATE students SET password = ? WHERE email = ?${await studentActiveClause(connection)}`,
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

// Reset student password using registration details when email delivery is unavailable.
router.post('/reset-password-by-details', async (req, res) => {
    let connection;
    try {
        const { email, phone, dob, newPassword } = req.body;
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanPhone = String(phone || '').replace(/\D/g, '');
        const cleanDob = normalizeDateOnly(dob);

        if (!cleanEmail || !cleanPhone || !cleanDob || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email, phone, date of birth and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        connection = await req.db.getConnection();
        const [students] = await connection.query(
            `SELECT id, email, phone, dob FROM students WHERE LOWER(email) = ?${await studentActiveClause(connection)} LIMIT 1`,
            [cleanEmail]
        );

        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No student account found with this email'
            });
        }

        const student = students[0];
        const storedPhone = String(student.phone || '').replace(/\D/g, '');
        const storedDob = normalizeDateOnly(student.dob);

        if (storedPhone !== cleanPhone || storedDob !== cleanDob) {
            return res.status(403).json({
                success: false,
                message: 'Details do not match your registration record'
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await connection.query('UPDATE students SET password = ? WHERE id = ?', [hashedPassword, student.id]);

        res.json({
            success: true,
            message: 'Password reset successful. You can login with your new password now.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Password reset failed',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

// Admin Registration
router.post('/admin/register', validateAdminRegistration, async (req, res) => {
    try {
        const { password, fullName, setupKey } = req.body;
        const email = String(req.body.email || '').trim().toLowerCase();
        
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
        const hashedPassword = await bcrypt.hash(password, 12);
        
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
        const { password } = req.body;
        const email = String(req.body.email || '').trim().toLowerCase();
        
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
