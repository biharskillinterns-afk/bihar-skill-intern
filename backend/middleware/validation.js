const { validationResult, body, param } = require('express-validator');

// Validation error handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const validationErrors = errors.array().map(error => ({
            field: error.path || error.param,
            message: error.msg
        }));
        const message = [
            'Validation failed:',
            ...validationErrors.map(error => `- ${error.message}`)
        ].join('\n');

        return res.status(400).json({
            success: false,
            message,
            errors: validationErrors
        });
    }
    next();
};

// Student registration validation
const validateStudentRegistration = [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Invalid email format'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Invalid phone number'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('dob').isISO8601().withMessage('Invalid date format'),
    body('gender').isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
    body('college').notEmpty().withMessage('College is required'),
    body('majorSubject').notEmpty().withMessage('majorSubject is required'),
    body('selectedCourse').custom((value, { req }) => {
        const selectedCourseName = String(value || req.body.course || '').trim();
        if (!selectedCourseName) {
            throw new Error('selectedCourse is required');
        }
        return true;
    }),
    body('selectedCourseId').notEmpty().withMessage('selectedCourseId is required').bail().isInt({ min: 1 }).withMessage('selectedCourseId must be a valid course ID'),
    body('courseConfirmation').custom(value => {
        if (value !== true && value !== 'true' && value !== 'on' && value !== '1' && value !== 1) {
            throw new Error('Registration confirmation is required.');
        }
        return true;
    }),
    body('pincode').optional({ checkFalsy: true }).matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
    handleValidationErrors
];

// Login validation
const validateLogin = [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors
];

// Forgot password validation
const validateForgotPassword = [
    body('email').isEmail().withMessage('Invalid email format'),
    handleValidationErrors
];

// Reset password validation
const validateResetPassword = [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    handleValidationErrors
];

// Admin registration validation
const validateAdminRegistration = [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('fullName').notEmpty().withMessage('Full name is required'),
    handleValidationErrors
];

module.exports = {
    validateStudentRegistration,
    validateLogin,
    validateForgotPassword,
    validateResetPassword,
    validateAdminRegistration,
    handleValidationErrors
};
