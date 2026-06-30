const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const pool = require('../config/database');
const { withTransaction } = require('../utils/db');

function usage() {
    console.error('Usage: node scripts/restore-database.js <backup-file.json> --confirm');
}

async function restoreTable(connection, tableName, rows) {
    for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const placeholders = columns.map(() => '?').join(', ');
        const updates = columns
            .filter(column => column !== 'id')
            .map(column => `\`${column}\` = VALUES(\`${column}\`)`)
            .join(', ');
        await connection.query(
            `INSERT INTO \`${tableName}\` (${columns.map(column => `\`${column}\``).join(', ')})
             VALUES (${placeholders})
             ON DUPLICATE KEY UPDATE ${updates || '`id` = `id`'}`,
            columns.map(column => row[column])
        );
    }
}

(async () => {
    const backupFile = process.argv[2];
    const confirmed = process.argv.includes('--confirm');

    if (!backupFile || !confirmed) {
        usage();
        process.exit(1);
    }

    try {
        const resolved = path.resolve(backupFile);
        const backup = JSON.parse(await fs.promises.readFile(resolved, 'utf8'));
        await withTransaction(pool, async connection => {
            for (const tableName of backup.tables || []) {
                await restoreTable(connection, tableName, backup.data?.[tableName] || []);
            }
        });
        console.log(`Restore completed from: ${resolved}`);
        process.exit(0);
    } catch (error) {
        console.error('Restore failed:', error.message);
        process.exit(1);
    }
})();
