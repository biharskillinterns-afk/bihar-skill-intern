const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const sslConfig = process.env.DB_SSL === 'true'
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') } : {})
    }
    : undefined;

const baseConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306,
    ...(sslConfig ? { ssl: sslConfig } : {}),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

async function ensureDatabaseExists() {
    if (!process.env.DB_NAME) return;

    const connection = await mysql.createConnection(baseConfig);
    try {
        const databaseName = String(process.env.DB_NAME).replace(/`/g, '``');
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } finally {
        await connection.end();
    }
}

const pool = mysql.createPool({
    ...baseConfig,
    database: process.env.DB_NAME
});

// Test connection
pool.getConnection()
    .then(connection => {
        console.log('✅ Database connected successfully!');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err.message);
    });

module.exports = pool;
module.exports.ensureDatabaseExists = ensureDatabaseExists;
