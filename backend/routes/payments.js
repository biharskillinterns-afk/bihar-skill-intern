const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const { verifyToken, isStudent } = require('../middleware/auth');
const { getRegistrationAmount } = require('../config/settings');
const { buildRegistrationId, buildStudentCode } = require('../utils/ids');
const { saveDataUrlFile, recordUploadedFile } = require('../utils/security');
const { compatColumnExists, studentActiveClause, updateStudentGeneratedIds, safeRecordUploadedFile } = require('../utils/compat');

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

function getRegistrationNoteValue(...sources) {
    for (const source of sources) {
        const notes = source?.notes || {};
        const value = notes.pendingRegistrationId ||
            notes.pending_registration_id ||
            notes.registrationId ||
            notes.registration_id;

        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }

    return '';
}

function getRegistrationEmailFromNotes(...sources) {
    for (const source of sources) {
        const notes = source?.notes || {};
        const value = source?.email ||
            notes.studentEmail ||
            notes.student_email ||
            notes.email;

        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim().toLowerCase();
        }
    }

    return '';
}

function getRegistrationPhoneFromNotes(...sources) {
    for (const source of sources) {
        const notes = source?.notes || {};
        const value = source?.contact ||
            notes.studentPhone ||
            notes.student_phone ||
            notes.phone;

        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return normalizePhone(value);
        }
    }

    return '';
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

function formatStudentResponse(student, paymentStatus = 'completed') {
    if (!student) return null;
    return {
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
        paymentStatus
    };
}

async function createStudentFromPendingRegistration(connection, pendingRegistrationId) {
    if (!pendingRegistrationId) return null;

    const [pendingRows] = await connection.query(
        `SELECT * FROM pending_registrations
         WHERE id = ? AND (expiresAt IS NULL OR expiresAt > NOW())
         LIMIT 1 FOR UPDATE`,
        [pendingRegistrationId]
    );

    if (pendingRows.length === 0) return null;
    const pending = pendingRows[0];

    const activeClause = await studentActiveClause(connection);
    const [existingStudents] = await connection.query(
        `SELECT * FROM students WHERE email = ?${activeClause} LIMIT 1 FOR UPDATE`,
        [pending.email]
    );
    if (existingStudents.length > 0) {
        await connection.query('DELETE FROM pending_registrations WHERE id = ?', [pending.id]);
        return existingStudents[0];
    }

    const studentColumns = [
        'firstName', 'lastName', 'email', 'phone', 'password', 'dob', 'gender', 'college', 'course', 'district',
        'rollNo', 'guardian', 'address', 'pincode', 'university', 'degree', 'department', 'semester', 'session',
        'emergencyName', 'emergencyPhone', 'relationship', 'profileImage', 'signature'
    ];
    const studentValues = [
        pending.firstName,
        pending.lastName,
        pending.email,
        pending.phone,
        pending.password,
        pending.dob,
        pending.gender,
        pending.college,
        pending.course || '',
        pending.district || '',
        pending.rollNo || '',
        pending.guardian || '',
        pending.address || '',
        pending.pincode || '',
        pending.university || 'Veer Kunwar Singh University',
        pending.degree || '',
        pending.department || '',
        pending.semester || '',
        pending.session || '',
        pending.emergencyName || '',
        pending.emergencyPhone || '',
        pending.relationship || '',
        pending.profileImage || '',
        pending.signature || ''
    ];
    if (await compatColumnExists(connection, 'students', 'majorSubject')) {
        const departmentIndex = studentColumns.indexOf('department');
        studentColumns.splice(departmentIndex + 1, 0, 'majorSubject');
        studentValues.splice(departmentIndex + 1, 0, pending.majorSubject || '');
    }
    const [result] = await connection.query(
        `INSERT INTO students (${studentColumns.join(', ')}, createdAt)
         VALUES (${studentColumns.map(() => '?').join(', ')}, NOW())`,
        studentValues
    );

    const studentId = result.insertId;
    const studentCode = buildStudentCode(studentId);
    const registrationId = pending.registrationId || buildRegistrationId(studentId);
    const profileFile = await saveDataUrlFile({ dataUrl: pending.profileImage, category: 'profile-images', ownerId: studentId, originalName: 'profile-image' });
    const signatureFile = await saveDataUrlFile({ dataUrl: pending.signature, category: 'signatures', ownerId: studentId, originalName: 'signature' });
    if (profileFile) await safeRecordUploadedFile(connection, recordUploadedFile, profileFile, { ownerType: 'student', ownerId: studentId, entityType: 'students', entityId: studentId, fieldName: 'profileImage' });
    if (signatureFile) await safeRecordUploadedFile(connection, recordUploadedFile, signatureFile, { ownerType: 'student', ownerId: studentId, entityType: 'students', entityId: studentId, fieldName: 'signature' });
    await updateStudentGeneratedIds(connection, studentId, {
        studentCode,
        registrationId,
        profileImagePath: profileFile?.relativePath || pending.profileImagePath || null,
        signaturePath: signatureFile?.relativePath || pending.signaturePath || null
    });
    await connection.query('DELETE FROM pending_registrations WHERE id = ?', [pending.id]);
    return {
        ...pending,
        id: studentId,
        studentCode,
        registrationId
    };
}

async function markRegistrationPaymentCompleted(req, paymentData) {
    let connection;
    try {
        connection = await req.db.getConnection();
        await connection.beginTransaction();
        const existingPayment = await findPaymentByOrder(connection, paymentData.razorpayOrderId);
        let pendingRegistrationId = paymentData.pendingRegistrationId;
        if (!pendingRegistrationId && paymentData.razorpayOrderId) {
            const [pendingRows] = await connection.query(
                `SELECT id FROM pending_registrations
                 WHERE email = ?
                 ORDER BY id DESC LIMIT 1`,
                [paymentData.studentEmail || '']
            );
            pendingRegistrationId = pendingRows[0]?.id || '';
        }

        const createdStudent = await createStudentFromPendingRegistration(connection, pendingRegistrationId);
        const studentId = existingPayment?.studentId || createdStudent?.id || await findStudentId(connection, req, paymentData.studentEmail);
        const courseId = existingPayment?.courseId || await getOrCreateDefaultCourseId(connection);

        if (!studentId || !courseId) {
            await connection.rollback();
            return null;
        }

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

            await connection.commit();
            return {
                success: true,
                studentId,
                student: createdStudent ? formatStudentResponse(createdStudent, 'completed') : null
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                // The inner transaction handler may already have rolled back.
            }
        }
        console.warn('Unable to mark Razorpay payment completed:', error.message);
        req.paymentCompletionError = error.message;
        return null;
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
        const { studentName, studentEmail, studentPhone, localOrderId, pendingRegistrationId } = req.body;
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
                studentPhone: String(studentPhone || ''),
                pendingRegistrationId: String(pendingRegistrationId || '')
            }
        });

        await savePendingRegistrationPayment(req, {
            amount: payableAmount,
            razorpayOrderId: order.id,
            localOrderId,
            studentEmail,
            pendingRegistrationId
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
        const { razorpayPaymentId, razorpayOrderId, razorpaySignature, studentEmail, amount, pendingRegistrationId } = req.body;

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

        const completion = await markRegistrationPaymentCompleted(req, {
            razorpayPaymentId,
            razorpayOrderId,
            studentEmail,
            pendingRegistrationId,
            amount: getValidAmount(amount) || await getRegistrationAmount(req.db)
        });
        const token = completion?.student ? jwt.sign(
            { id: completion.student.id, email: completion.student.email, role: 'student' },
            getJwtSecret(),
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        ) : null;

        res.json({
            success: true,
            message: 'Registration payment verified successfully',
            paymentStatus: 'completed',
            databaseUpdated: Boolean(completion),
            token,
            student: completion?.student || null
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
        const pendingRegistrationId = req.query.pendingRegistrationId || req.body.pendingRegistrationId || '';
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
            pendingRegistrationId,
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
        const pendingRegistrationId = req.query.pendingRegistrationId || '';
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

        const completion = await markRegistrationPaymentCompleted(req, {
            razorpayPaymentId: successfulPayment.id,
            razorpayOrderId: orderId,
            studentEmail: studentEmail || getPaymentEmail(successfulPayment),
            pendingRegistrationId,
            amount,
            paymentMethod: mapPaymentMethod(successfulPayment.method)
        });

        res.json({
            success: true,
            status: 'completed',
            paymentStatus: 'completed',
            databaseUpdated: Boolean(completion),
            student: completion?.student || null,
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
        const { studentEmail = '', razorpayPaymentId = '', razorpayOrderId = '', pendingRegistrationId = '' } = req.body;

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

        const completion = await markRegistrationPaymentCompleted(req, {
            razorpayPaymentId: successfulPayment.id,
            razorpayOrderId: successfulPayment.order_id || razorpayOrderId,
            studentEmail,
            pendingRegistrationId,
            amount: getValidAmount(Number(successfulPayment.amount) / 100) || await getRegistrationAmount(req.db),
            paymentMethod: mapPaymentMethod(successfulPayment.method)
        });
        const token = completion?.student ? jwt.sign(
            { id: completion.student.id, email: completion.student.email, role: 'student' },
            getJwtSecret(),
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        ) : null;

        res.json({
            success: Boolean(completion),
            status: completion ? 'completed' : 'not_updated',
            paymentStatus: completion ? 'completed' : 'pending',
            databaseUpdated: Boolean(completion),
            token,
            student: completion?.student || null,
            error: completion ? undefined : req.paymentCompletionError,
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
            `SELECT p.*, COALESCE(c.courseName, 'Registration Fee') AS courseName FROM payments p
             LEFT JOIN courses c ON p.courseId = c.id
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
            let paymentOrder = order;
            if (!paymentOrder && payment.order_id) {
                try {
                    paymentOrder = await getRazorpayClient().orders.fetch(payment.order_id);
                } catch (error) {
                    console.warn('Unable to fetch Razorpay order during webhook:', error.message);
                }
            }

            await markRegistrationPaymentCompleted(req, {
                razorpayPaymentId: payment.id,
                razorpayOrderId: payment.order_id,
                studentEmail: getRegistrationEmailFromNotes(payment, paymentOrder) || getPaymentEmail(payment),
                studentPhone: getRegistrationPhoneFromNotes(payment, paymentOrder) || getPaymentPhone(payment),
                pendingRegistrationId: getRegistrationNoteValue(payment, paymentOrder),
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
                    studentEmail: getRegistrationEmailFromNotes(successfulPayment, order) || getPaymentEmail(successfulPayment),
                    studentPhone: getRegistrationPhoneFromNotes(successfulPayment, order) || getPaymentPhone(successfulPayment),
                    pendingRegistrationId: getRegistrationNoteValue(successfulPayment, order),
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
