const dotenv = require('dotenv');
dotenv.config();

const pool = require('../config/database');
const { createDatabaseBackup } = require('../utils/backup');

(async () => {
    try {
        const filePath = await createDatabaseBackup(pool);
        console.log(`Backup created: ${filePath}`);
        process.exit(0);
    } catch (error) {
        console.error('Backup failed:', error.message);
        process.exit(1);
    }
})();
