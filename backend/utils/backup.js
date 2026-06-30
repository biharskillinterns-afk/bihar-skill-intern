const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const DEFAULT_TABLES = [
    'students',
    'pending_registrations',
    'admins',
    'courses',
    'student_courses',
    'payments',
    'certificates',
    'attendance',
    'internship_proofs',
    'marks',
    'notifications',
    'audit_logs',
    'password_resets',
    'app_settings',
    'uploaded_files',
    'admin_audit_logs',
    'api_request_logs'
];

async function getExistingTables(connection) {
    const [rows] = await connection.query('SHOW TABLES');
    return rows.map(row => Object.values(row)[0]);
}

async function createDatabaseBackup(pool, options = {}) {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
    const connection = await pool.getConnection();
    try {
        const existingTables = await getExistingTables(connection);
        const tables = DEFAULT_TABLES.filter(tableName => existingTables.includes(tableName));
        const data = {};

        for (const tableName of tables) {
            const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
            data[tableName] = rows;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = options.fileName || `db-backup-${timestamp}.json`;
        const filePath = path.join(BACKUP_DIR, fileName);
        await fs.promises.writeFile(filePath, JSON.stringify({
            createdAt: new Date().toISOString(),
            database: process.env.DB_NAME || '',
            tables,
            data
        }, null, 2));

        return filePath;
    } finally {
        connection.release();
    }
}

function msUntilNextBackup() {
    const [hours, minutes] = String(process.env.DB_BACKUP_TIME || '02:00').split(':').map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(Number.isFinite(hours) ? hours : 2, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
}

function scheduleDailyBackup(pool) {
    if (process.env.DB_BACKUP_ENABLED === 'false') {
        console.log('Daily database backup is disabled by DB_BACKUP_ENABLED=false.');
        return;
    }

    const run = async () => {
        try {
            const backupPath = await createDatabaseBackup(pool);
            console.log(`Database backup created: ${backupPath}`);
        } catch (error) {
            console.error('Database backup failed:', error.message);
        } finally {
            setTimeout(run, 24 * 60 * 60 * 1000).unref();
        }
    };

    setTimeout(run, msUntilNextBackup()).unref();
}

module.exports = {
    createDatabaseBackup,
    scheduleDailyBackup,
    DEFAULT_TABLES
};
