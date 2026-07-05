const pool = require('../config/database');
const { addColumnIfMissing } = require('../utils/db');

async function main() {
    const connection = await pool.getConnection();

    try {
        await addColumnIfMissing(connection, 'students', 'majorSubject', 'VARCHAR(100)');
        await addColumnIfMissing(connection, 'pending_registrations', 'majorSubject', 'VARCHAR(100)');
        console.log('Major Subject (MJC) migration completed successfully.');
    } finally {
        connection.release();
        await pool.end();
    }
}

main().catch(error => {
    console.error('Major Subject (MJC) migration failed:', error.message);
    process.exit(1);
});
