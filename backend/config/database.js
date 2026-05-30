const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const sslConfig = process.env.DB_SSL === 'true'
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') } : {})
    }
    : undefined;

function normalizeDbHost(value) {
    const raw = String(value || '').trim();
    if (!raw) return raw;

    try {
        if (/^mysql:\/\//i.test(raw)) {
            return new URL(raw).hostname;
        }
    } catch (error) {
        // Fall through to simple cleanup.
    }

    return raw
        .replace(/^mysql:\/\//i, '')
        .replace(/^https?:\/\//i, '')
        .split('@')
        .pop()
        .split('/')[0]
        .split('?')[0]
        .split(':')[0]
        .trim();
}

function normalizeDbPort(value) {
    const explicitPort = String(value || '').trim();

    try {
        if (/^mysql:\/\//i.test(process.env.DB_HOST || '')) {
            return new URL(process.env.DB_HOST).port || explicitPort || 3306;
        }
    } catch (error) {
        // Keep the explicit DB_PORT value.
    }

    return explicitPort || 3306;
}

const baseConfig = {
    host: normalizeDbHost(process.env.DB_HOST),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: normalizeDbPort(process.env.DB_PORT),
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

async function testDatabaseConnection() {
    const connection = await pool.getConnection();
    connection.release();
}

module.exports = pool;
module.exports.ensureDatabaseExists = ensureDatabaseExists;
module.exports.testDatabaseConnection = testDatabaseConnection;
module.exports.dbConnectionInfo = {
    host: baseConfig.host,
    port: baseConfig.port,
    database: process.env.DB_NAME || ''
};
