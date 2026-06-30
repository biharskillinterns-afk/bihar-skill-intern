const { compatTableExists } = require('./compat');

async function logAdminAction(connection, req, action, details = {}) {
    try {
        if (!(await compatTableExists(connection, 'admin_audit_logs'))) {
            console.warn(`Admin audit log skipped for ${action}: admin_audit_logs table not found.`);
            return;
        }

        await connection.query(
            `INSERT INTO admin_audit_logs
                (adminId, action, entityType, entityId, beforeValue, afterValue, ipAddress, userAgent, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                req.user?.id || null,
                action,
                details.entityType || null,
                details.entityId || null,
                details.beforeValue ? JSON.stringify(details.beforeValue) : null,
                details.afterValue ? JSON.stringify(details.afterValue) : null,
                req.ip || req.headers['x-forwarded-for'] || null,
                req.headers['user-agent'] || null
            ]
        );
    } catch (error) {
        console.warn('Admin audit log failed:', error.message);
    }
}

module.exports = {
    logAdminAction
};
