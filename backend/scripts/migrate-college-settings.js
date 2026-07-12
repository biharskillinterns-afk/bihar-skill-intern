const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
    const migrationPath = path.join(__dirname, '..', 'migrations', '2026-07-12-create-college-settings.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const connection = await pool.getConnection();

    try {
        await connection.query(migrationSql);
        console.log('College settings migration completed successfully.');
    } finally {
        connection.release();
        await pool.end();
    }
}

main().catch(error => {
    console.error('College settings migration failed:', error.message);
    process.exit(1);
});
