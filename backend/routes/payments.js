const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const { verifyToken, isStudent } = require('../middleware/auth');
const { getRegistrationAmount } = require('../config/settings');

const getJwtSecret = () => {
    if (process.env.JWT_SECRET) {
        return process.env.JWT_SECRET;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production');
    }

    return 'bihar-skill-intern-dev-secret';
};

function getRazorpayConfig() {
    return {
        keyId: process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY || '',
        keySecret: process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || ''
    };
}

function getFrontendUrl(req) {
    const frontend = req.query.frontend || req.body.frontend || process.env.FRONTEND_URL || 'https://biharskillinterns-afk.github.io/bihar-skill-intern';
    try {
        return new URL(String(frontend)).origin + new URL(String(frontend)).pathname.replace(/\/?$/, '/');
    } catch (error) {
        return 'https://biharskillinterns-afk.github.io/bihar-skill-intern/';
    }
}

function getValidAmount(amount) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;
    return Math.round(numericAmount);
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
    const { keySecret } = getRazorpayConfig();
    if (!keySecret) {
        throw new Error('Payment verification is not configured');
    }

    const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

    return expectedSignature === signature;
}

function getOptionalUser(req) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return null;

    try {
        return jwt.verify(token, getJwtSecret());
    } catch (error) {
        return null;
    }
}

async function getDefaultCourseId(connection) {
    const [courses] = await connection.query(
        'SELECT id FROM courses WHERE status = "active" ORDER BY id ASC LIMIT 1'
    );

    return courses[0]?.id || null;
}

async function findStudentId(connection, req, studentEmail) {
    const user = getOptionalUser(req);
    if (user?.role === 'student' && user.id) {
        return user.id;
    }

    if (!studentEmail) return null;

    const [students] = await connection.query(
        'SELECT id FROM students WHERE email = ? LIMIT 1',
        [studentEmail]
    );

    return students[0]?.id || null;
}

async function savePendingRegistrationPayment(req, paymentData) {
    let connection;
    try {
        connection = await req.db.getConnection();
        const studentId = await findStudentId(connection, req, paymentData.studentEmail);
        const courseId = await getDefaultCourseId(connection);

        if (!studentId || !courseId) {
            return;
        }

        await connection.query(
            `INSERT INTO payments
                (studentId, courseId, amount, paymentMethod, gatewayOrderId, status, notes, createdAt)
             VALUES (?, ?, ?, 'upi', ?, 'pending', ?, NOW())`,
            [
                studentId,
                courseId,
                paymentData.amount,
                paymentData.razorpayOrderId,
                JSON.stringify({
                    purpose: 'registration_fee',
                    localOrderId: paymentData.localOrderId || '',
                    studentEmail: paymentData.studentEmail || ''
                })
            ]
        );
    } catch (error) {
        console.warn('Unable to save pending Razorpay payment:', error.message);
    } finally {
        if (connection) connection.release();
    }
}

async function markRegistrationPaymentCompleted(req, paymentData) {
    let connection;
    try {
        connection = await req.db.getConnection();
        const studentId = await findStudentId(connection, req, paymentData.studentEmail);
        const courseId = await getDefaultCourseId(connection);

        if (!studentId || !courseId) {
            return false;
        }

        const [existingPayments] = await connection.query(
            'SELECT id FROM payments WHERE gatewayOrderId = ? AND studentId = ? LIMIT 1',
            [paymentData.razorpayOrderId, studentId]
        );

        await connection.beginTransaction();
        try {
            if (existingPayments.length > 0) {
                await connection.query(
                    `UPDATE payments
                     SET status = 'completed',
                         gatewayPaymentId = ?,
                         completedAt = NOW()
                     WHERE id = ?`,
                    [paymentData.razorpayPaymentId, existingPayments[0].id]
                );
            } else {
                await connection.query(
                    `INSERT INTO payments
                        (studentId, courseId, amount, paymentMethod, gatewayPaymentId, gatewayOrderId, status, notes, createdAt, completedAt)
                     VALUES (?, ?, ?, 'upi', ?, ?, 'completed', ?, NOW(), NOW())`,
                    [
                        studentId,
                        courseId,
                        paymentData.amount,
                        paymentData.razorpayPaymentId,
                        paymentData.razorpayOrderId,
                        JSON.stringify({
                            purpose: 'registration_fee',
                            studentEmail: paymentData.studentEmail || ''
                        })
                    ]
                );
            }

            await connection.query(
                `INSERT IGNORE INTO student_courses (studentId, courseId, enrolledAt, progress)
                 VALUES (?, ?, NOW(), 0)`,
                [studentId, courseId]
            );

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        console.warn('Unable to mark Razorpay payment completed:', error.message);
        return false;
    } finally {
        if (connection) connection.release();
    }
}

router.post('/registration-order', async (req, res) => {
    try {
        const { studentName, studentEmail, studentPhone, localOrderId } = req.body;
        const { keyId, keySecret } = getRazorpayConfig();
        const payableAmount = await getRegistrationAmount(req.db);

        if (!keyId || !keySecret) {
            return res.status(500).json({
                success: false,
                message: 'Razorpay keys are not configured on the server'
            });
        }

        const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret
        });

        const receipt = String(localOrderId || `bsi_reg_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
        const order = await razorpay.orders.create({
            amount: payableAmount * 100,
            currency: 'INR',
            receipt,
            notes: {
                purpose: 'registration_fee',
                studentName: String(studentName || ''),
                studentEmail: String(studentEmail || ''),
                studentPhone: String(studentPhone || '')
            }
        });

        await savePendingRegistrationPayment(req, {
            amount: payableAmount,
            razorpayOrderId: order.id,
            localOrderId,
            studentEmail
        });

        res.json({
            success: true,
            message: 'Razorpay registration order created',
            amount: payableAmount,
            currency: order.currency,
            razorpayKey: keyId,
            razorpayOrderId: order.id
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create registration payment order',
            error: error.message
        });
    }
});

router.get('/registration-amount', async (req, res) => {
    try {
        const amount = await getRegistrationAmount(req.db);
        res.json({
            success: true,
            amount,
            currency: 'INR'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch registration amount',
            error: error.message
        });
    }
});

router.post('/registration-verify', async (req, res) => {
    try {
        const { razorpayPaymentId, razorpayOrderId, razorpaySignature, studentEmail, amount } = req.body;

        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
            return res.status(400).json({
                success: false,
                message: 'Payment ID, order ID, and signature are required'
            });
        }

        if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        const databaseUpdated = await markRegistrationPaymentCompleted(req, {
            razorpayPaymentId,
            razorpayOrderId,
            studentEmail,
            amount: getValidAmount(amount) || 299
        });

        res.json({
            success: true,
            message: 'Registration payment verified successfully',
            paymentStatus: 'completed',
            databaseUpdated
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to verify registration payment',
            error: error.message
        });
    }
});

router.post('/registration-callback', async (req, res) => {
    const frontendUrl = getFrontendUrl(req);
    try {
        const razorpayPaymentId = req.body.razorpay_payment_id;
        const razorpayOrderId = req.body.razorpay_order_id;
        const razorpaySignature = req.body.razorpay_signature;
        const studentEmail = req.query.studentEmail || req.body.studentEmail || '';
        const amount = getValidAmount(req.query.amount || req.body.amount) || await getRegistrationAmount(req.db);

        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
            return res.redirect(`${frontendUrl}payment.html?payment=failed&reason=missing_payment_details`);
        }

        if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
            return res.redirect(`${frontendUrl}payment.html?payment=failed&reason=invalid_signature`);
        }

        await markRegistrationPaymentCompleted(req, {
            razorpayPaymentId,
            razorpayOrderId,
            studentEmail,
            amount
        });

        const redirectUrl = new URL('payment-success.html', frontendUrl);
        redirectUrl.searchParams.set('payment', 'success');
        redirectUrl.searchParams.set('razorpay_payment_id', razorpayPaymentId);
        redirectUrl.searchParams.set('razorpay_order_id', razorpayOrderId);
        res.redirect(303, redirectUrl.toString());
    } catch (error) {
        const redirectUrl = new URL('payment.html', frontendUrl);
        redirectUrl.searchParams.set('payment', 'failed');
        redirectUrl.searchParams.set('reason', error.message || 'verification_failed');
        res.redirect(303, redirectUrl.toString());
    }
});

// Create a local payment record. The frontend can also complete registration without backend.
router.post('/initiate', verifyToken, isStudent, async (req, res) => {
    let connection;
    try {
        const { courseId, amount } = req.body;
        const payableAmount = getValidAmount(amount);

        if (!payableAmount) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }

        connection = await req.db.getConnection();

        const courseParams = courseId ? [courseId] : [];
        const courseQuery = courseId
            ? 'SELECT id, fee FROM courses WHERE id = ? AND status = "active"'
            : 'SELECT id, fee FROM courses WHERE status = "active" ORDER BY id ASC LIMIT 1';
        const [courses] = await connection.query(courseQuery, courseParams);

        if (courses.length === 0) {
            return res.status(404).json({
                success: false,
                message: courseId ? 'Course not found or inactive' : 'No active course found for payment'
            });
        }

        const courseFee = Number(courses[0].fee || 0);
        const resolvedCourseId = courses[0].id;
        const finalAmount = courseId && courseFee > 0 ? courseFee : payableAmount;

        const [result] = await connection.query(
            `INSERT INTO payments (studentId, courseId, amount, status, createdAt)
             VALUES (?, ?, ?, 'pending', NOW())`,
            [req.user.id, resolvedCourseId, finalAmount]
        );

        res.json({
            success: true,
            message: 'Local payment record created',
            paymentId: result.insertId,
            amount: finalAmount,
            currency: 'INR'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to initiate payment',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

// Mark a local payment record as completed.
router.post('/verify', verifyToken, isStudent, async (req, res) => {
    let connection;
    try {
        const { paymentId } = req.body;

        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: 'Payment ID is required'
            });
        }

        connection = await req.db.getConnection();

        const [payments] = await connection.query(
            `SELECT id, status FROM payments WHERE id = ? AND studentId = ?`,
            [paymentId, req.user.id]
        );

        if (payments.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        if (payments[0].status === 'completed') {
            return res.json({
                success: true,
                message: 'Payment already completed'
            });
        }

        await connection.beginTransaction();
        try {
            await connection.query(
                `UPDATE payments SET status = 'completed', completedAt = NOW() WHERE id = ? AND studentId = ?`,
                [paymentId, req.user.id]
            );

            const [paymentRows] = await connection.query(
                'SELECT courseId FROM payments WHERE id = ? AND studentId = ?',
                [paymentId, req.user.id]
            );

            if (paymentRows.length > 0) {
                await connection.query(
                    `INSERT IGNORE INTO student_courses (studentId, courseId, enrolledAt, progress)
                     VALUES (?, ?, NOW(), 0)`,
                    [req.user.id, paymentRows[0].courseId]
                );
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        }

        res.json({
            success: true,
            message: 'Payment completed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to complete payment',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/history', verifyToken, isStudent, async (req, res) => {
    let connection;
    try {
        connection = await req.db.getConnection();
        const [payments] = await connection.query(
            `SELECT p.*, c.courseName FROM payments p
             JOIN courses c ON p.courseId = c.id
             WHERE p.studentId = ? ORDER BY p.createdAt DESC`,
            [req.user.id]
        );

        res.json({
            success: true,
            payments
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payment history',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
