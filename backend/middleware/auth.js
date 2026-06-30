const jwt = require('jsonwebtoken');
const { compatColumnExists } = require('../utils/compat');

const getJwtSecret = () => {
    if (process.env.JWT_SECRET) {
        return process.env.JWT_SECRET;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production');
    }

    return 'bihar-skill-intern-dev-secret';
};

// Verify JWT Token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'No token provided'
        });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret());
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

// Check if user is admin
const isAdmin = async (req, res, next) => {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin only.'
        });
    }
    try {
        if (req.db) {
            const [admins] = await req.db.query(
                "SELECT id FROM admins WHERE id = ? AND status = 'active' LIMIT 1",
                [req.user.id]
            );
            if (admins.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Admin account is not active'
                });
            }
        }
        next();
    } catch (error) {
        next(error);
    }
};

// Check if user is student
const isStudent = async (req, res, next) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Student only.'
        });
    }
    try {
        if (req.db) {
            const hasDeletedAt = await compatColumnExists(req.db, 'students', 'deletedAt');
            const query = hasDeletedAt
                ? "SELECT id FROM students WHERE id = ? AND status = 'active' AND deletedAt IS NULL LIMIT 1"
                : "SELECT id FROM students WHERE id = ? AND status = 'active' LIMIT 1";
            const [students] = await req.db.query(query, [req.user.id]);
            if (students.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Student account is not active'
                });
            }
        }
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    verifyToken,
    isAdmin,
    isStudent
};
