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

function getRazorpayClient() {
    const { keyId, keySecret } = getRazorpayConfig();
    if (!keyId || !keySecret) {
        throw new Error('Razorpay keys are not configured on the server');
    }

    return new Razorpay({
        key_id: keyId,
        key_secret: keySecret
    });
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
        "SELECT id FROM courses WHERE status = 'active' ORDER BY id ASC LIMIT 1"
    );

    return courses[0]?.id || null;
}

async function getOrCreateDefaultCourseId(connection) {
    const activeCourseId = await getDefaultCourseId(connection);
    if (activeCourseId) return activeCourseId;

    const [anyCourses] = await connection.query('SELECT id FROM courses ORDER BY id ASC LIMIT 1');
    if (anyCourses[0]?.id) return anyCourses[0].id;

    const [result] = await connection.query(
        `INSERT INTO courses (courseName, description, duration, instructor, level, certificate, fee, status, syllabus, createdAt)
         VALUES (?, ?, 30, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active', '', NOW())`,
        [
            'Bihar Skill Interns Foundation',
            'Default registration course for Bihar Skill Interns students'
        ]
    );

    return result.insertId;
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

function normalizePhone(phone = '') {
    return String(phone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
}

function getPaymentEmail(payment = {}) {
    return String(
        payment.email ||
        payment.notes?.studentEmail ||
        payment.notes?.student_email ||
        ''
    ).trim().toLowerCase();
}

function getPaymentPhone(payment = {}) {
    return normalizePhone(payment.contact || payment.notes?.studentPhone || payment.notes?.student_phone || '');
}

function mapPaymentMethod(method = '') {
    const normalized = String(method).toLowerCase();
    if (normalized === 'card') return 'credit_card';
    if (normalized === 'netbanking') return 'net_banking';
    if (normalized === 'wallet') return 'wallet';
    if (normalized === 'upi') return 'upi';
    return 'upi';
}

async function findPaymentByOrder(connection, razorpayOrderId) {
    if (!razorpayOrderId) return null;

    const [payments] = await connection.query(
        `SELECT id, studentId, courseId, amount, gatewayOrderId
         FROM payments
         WHERE gatewayOrderId = ?
         ORDER BY id DESC LIMIT 1`,
        [razorpayOrderId]
    );

    return payments[0] || null;
}

async function savePendingRegistrationPayment(req, paymentData) {
    let connection;
    try {
        connection = await req.db.getConnection();
        const studentId = await findStudentId(connection, req, paymentData.studentEmail);
        const courseId = await getOrCreateDefaultCourseId(connection);

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
        const existingPayment = await findPaymentByOrder(connection, paymentData.razorpayOrderId);
        const studentId = existingPayment?.studentId || await findStudentId(connection, req, paymentData.studentEmail);
        const courseId = existingPayment?.courseId || await getOrCreateDefaultCourseId(connection);

        if (!studentId || !courseId) {
            return false;
        }

        await connection.beginTransaction();
        try {
            if (existingPayment) {
                await connection.query(
                    `UPDATE payments
                     SET status = 'completed',
                         gatewayPaymentId = ?,
                         paymentMethod = COALESCE(?, paymentMethod),
                         completedAt = NOW()
                     WHERE id = ?`,
                    [paymentData.razorpayPaymentId, paymentData.paymentMethod || null, existingPayment.id]
                );
            } else {
                await connection.query(
                    `INSERT INTO payments
                        (studentId, courseId, amount, paymentMethod, gatewayPaymentId, gatewayOrderId, status, notes, createdAt, completedAt)
                     VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, NOW(), NOW())`,
                    [
                        studentId,
                        courseId,
                        paymentData.amount || 0,
                        paymentData.paymentMethod || 'upi',
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
        req.paymentCompletionError = error.message;
        return false;
    } finally {
        if (connection) connection.release();
    }
}

async function syncCompletedPaymentsForStudent(db, studentId, studentEmail = '') {
    let connection;
    try {
        connection = await db.getConnection();
        const [students] = await connection.query(
            'SELECT id, email, phone, createdAt FROM students WHERE id = ? LIMIT 1',
            [studentId]
        );
        const student = students[0] || { email: studentEmail };
        const email = String(studentEmail || student.email || '').trim().toLowerCase();
        const phone = normalizePhone(student.phone || '');
        const [pendingPayments] = await connection.query(
            `SELECT id, amount, gatewayOrderId
             FROM payments
             WHERE studentId = ? AND status = 'pending' AND gatewayOrderId IS NOT NULL
             ORDER BY createdAt DESC LIMIT 5`,
            [studentId]
        );

        const razorpay = getRazorpayClient();
        let updated = false;
        for (const payment of pendingPayments) {
            const paymentsResponse = await razorpay.orders.fetchPayments(payment.gatewayOrderId);
            const successfulPayment = (paymentsResponse.items || []).find(item =>
                ['captured', 'authorized'].includes(item.status)
            );

            if (successfulPayment) {
                await markRegistrationPaymentCompleted(
                    { db, headers: {} },
                    {
                        razorpayPaymentId: successfulPayment.id,
                        razorpayOrderId: payment.gatewayOrderId,
                        studentEmail: email,
                        amount: payment.amount,
                        paymentMethod: mapPaymentMethod(successfulPayment.method)
                    }
                );
                updated = true;
            }
        }

        if (updated) return true;

        const createdAt = student.createdAt ? new Date(student.createdAt).getTime() : Date.now() - (24 * 60 * 60 * 1000);
        const from = Math.max(0, Math.floor((createdAt - (60 * 60 * 1000)) / 1000));
        const to = Math.floor(Date.now() / 1000);
        const recentPayments = await razorpay.payments.all({ from, to, count: 100 });
        const successfulPayment = (recentPayments.items || []).find(payment => {
            if (!['captured', 'authorized'].includes(payment.status)) return false;
            const paymentEmail = getPaymentEmail(payment);
            const paymentPhone = getPaymentPhone(payment);
            return (email && paymentEmail === email) || (phone && paymentPhone === phone);
        });

        if (successfulPayment?.order_id) {
            return await markRegistrationPaymentCompleted(
                { db, headers: {} },
                {
                    razorpayPaymentId: successfulPayment.id,
                    razorpayOrderId: successfulPayment.order_id,
                    studentEmail: email || getPaymentEmail(successfulPayment),
                    amount: getValidAmount(Number(successfulPayment.amount) / 100) || 0,
                    paymentMethod: mapPaymentMethod(successfulPayment.method)
                }
            );
        }

        return updated;
    } catch (error) {
        console.warn('Unable to sync completed Razorpay payments:', error.message);
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
            amount: getValidAmount(amount) || await getRegistrationAmount(req.db)
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

router.get('/registration-status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const studentEmail = req.query.studentEmail || '';
        const amount = getValidAmount(req.query.amount) || await getRegistrationAmount(req.db);

        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        const razorpay = getRazorpayClient();
        const paymentsResponse = await razorpay.orders.fetchPayments(orderId);
        const payments = paymentsResponse.items || [];
        const successfulPayment = payments.find(payment =>
            ['captured', 'authorized'].includes(payment.status)
        );

        if (!successfulPayment) {
            return res.json({
                success: true,
                status: 'pending'
            });
        }

        const databaseUpdated = await markRegistrationPaymentCompleted(req, {
            razorpayPaymentId: successfulPayment.id,
            razorpayOrderId: orderId,
            studentEmail: studentEmail || getPaymentEmail(successfulPayment),
            amount,
            paymentMethod: mapPaymentMethod(successfulPayment.method)
        });

        res.json({
            success: true,
            status: 'completed',
            paymentStatus: 'completed',
            databaseUpdated,
            razorpayPaymentId: successfulPayment.id,
            razorpayOrderId: orderId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payment status',
            error: error.message
        });
    }
});

router.post('/registration-reconcile', async (req, res) => {
    try {
        const { studentEmail = '', razorpayPaymentId = '', razorpayOrderId = '' } = req.body;

        if (!studentEmail || (!razorpayPaymentId && !razorpayOrderId)) {
            return res.status(400).json({
                success: false,
                message: 'Student email and Razorpay payment/order ID are required'
            });
        }

        const razorpay = getRazorpayClient();
        let successfulPayment = null;

        if (razorpayPaymentId) {
            const payment = await razorpay.payments.fetch(razorpayPaymentId);
            if (['captured', 'authorized'].includes(payment.status)) {
                successfulPayment = payment;
            }
        } else {
            const paymentsResponse = await razorpay.orders.fetchPayments(razorpayOrderId);
            successfulPayment = (paymentsResponse.items || []).find(payment =>
                ['captured', 'authorized'].includes(payment.status)
            );
        }

        if (!successfulPayment) {
            return res.status(404).json({
                success: false,
                message: 'Captured Razorpay payment not found'
            });
        }

        const paymentEmail = getPaymentEmail(successfulPayment);
        if (paymentEmail && paymentEmail !== String(studentEmail).trim().toLowerCase()) {
            return res.status(400).json({
                success: false,
                message: 'Payment email does not match student email'
            });
        }

        const databaseUpdated = await markRegistrationPaymentCompleted(req, {
            razorpayPaymentId: successfulPayment.id,
            razorpayOrderId: successfulPayment.order_id || razorpayOrderId,
            studentEmail,
            amount: getValidAmount(Number(successfulPayment.amount) / 100) || await getRegistrationAmount(req.db),
            paymentMethod: mapPaymentMethod(successfulPayment.method)
        });

        res.json({
            success: databaseUpdated,
            status: databaseUpdated ? 'completed' : 'not_updated',
            paymentStatus: databaseUpdated ? 'completed' : 'pending',
            databaseUpdated,
            error: databaseUpdated ? undefined : req.paymentCompletionError,
            razorpayPaymentId: successfulPayment.id,
            razorpayOrderId: successfulPayment.order_id || razorpayOrderId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to reconcile registration payment',
            error: error.message
        });
    }
});

router.get('/registration-debug', async (req, res) => {
    let connection;
    try {
        const studentEmail = String(req.query.studentEmail || '').trim().toLowerCase();
        if (!studentEmail) {
            return res.status(400).json({
                success: false,
                message: 'Student email is required'
            });
        }

        connection = await req.db.getConnection();
        const [students] = await connection.query(
            'SELECT id, email, phone, createdAt FROM students WHERE LOWER(email) = ? LIMIT 1',
            [studentEmail]
        );
        const [courses] = await connection.query(
            'SELECT id, courseName, status FROM courses ORDER BY id ASC LIMIT 5'
        );

        let payments = [];
        let enrollments = [];
        if (students[0]) {
            [payments] = await connection.query(
                `SELECT id, studentId, courseId, amount, status, gatewayOrderId, gatewayPaymentId, createdAt, completedAt
                 FROM payments WHERE studentId = ? ORDER BY id DESC LIMIT 10`,
                [students[0].id]
            );
            [enrollments] = await connection.query(
                'SELECT id, studentId, courseId, status, enrolledAt FROM student_courses WHERE studentId = ? ORDER BY id DESC LIMIT 10',
                [students[0].id]
            );
        }

        res.json({
            success: true,
            studentFound: Boolean(students[0]),
            student: students[0] || null,
            courses,
            payments,
            enrollments
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch registration debug details',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
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
            ? "SELECT id, fee FROM courses WHERE id = ? AND status = 'active'"
            : "SELECT id, fee FROM courses WHERE status = 'active' ORDER BY id ASC LIMIT 1";
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

async function handleRazorpayWebhook(req, res) {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (webhookSecret) {
            const signature = req.headers['x-razorpay-signature'];
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(req.body)
                .digest('hex');

            if (signature !== expectedSignature) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid webhook signature'
                });
            }
        }

        const payload = JSON.parse(req.body.toString('utf8'));
        const payment = payload.payload?.payment?.entity;
        const order = payload.payload?.order?.entity;

        if (payment && ['payment.captured', 'payment.authorized'].includes(payload.event)) {
            await markRegistrationPaymentCompleted(req, {
                razorpayPaymentId: payment.id,
                razorpayOrderId: payment.order_id,
                studentEmail: getPaymentEmail(payment),
                amount: getValidAmount(Number(payment.amount) / 100) || 0,
                paymentMethod: mapPaymentMethod(payment.method)
            });
        }

        if (order?.id && payload.event === 'order.paid') {
            const razorpay = getRazorpayClient();
            const paymentsResponse = await razorpay.orders.fetchPayments(order.id);
            const successfulPayment = (paymentsResponse.items || []).find(item =>
                ['captured', 'authorized'].includes(item.status)
            );

            if (successfulPayment) {
                await markRegistrationPaymentCompleted(req, {
                    razorpayPaymentId: successfulPayment.id,
                    razorpayOrderId: order.id,
                    studentEmail: getPaymentEmail(successfulPayment),
                    amount: getValidAmount(Number(successfulPayment.amount) / 100) || 0,
                    paymentMethod: mapPaymentMethod(successfulPayment.method)
                });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.warn('Razorpay webhook processing failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Webhook processing failed'
        });
    }
}

module.exports = router;
module.exports.syncCompletedPaymentsForStudent = syncCompletedPaymentsForStudent;
module.exports.handleRazorpayWebhook = handleRazorpayWebhook;
