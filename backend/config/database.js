const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

function envValue(key, fallback = '') {
    return String(process.env[key] || fallback).trim();
}

function parseDatabaseUrl() {
    const rawUrl = envValue('DATABASE_URL') || envValue('MYSQL_URL');
    if (!rawUrl) return {};

    try {
        const parsed = new URL(rawUrl);
        const isMysqlUrl = /^mysql:$/i.test(parsed.protocol);
        if (!isMysqlUrl) return {};

        return {
            host: parsed.hostname,
            user: decodeURIComponent(parsed.username || ''),
            password: decodeURIComponent(parsed.password || ''),
            port: parsed.port || '',
            database: decodeURIComponent(parsed.pathname.replace(/^\//, '') || '')
        };
    } catch (error) {
        return {};
    }
}

const urlConfig = parseDatabaseUrl();

const sslConfig = envValue('DB_SSL').toLowerCase() === 'true'
    ? {
        rejectUnauthorized: envValue('DB_SSL_REJECT_UNAUTHORIZED').toLowerCase() !== 'false',
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
    host: normalizeDbHost(envValue('DB_HOST') || urlConfig.host),
    user: envValue('DB_USER') || urlConfig.user || '',
    password: envValue('DB_PASSWORD') || urlConfig.password || '',
    port: normalizeDbPort(envValue('DB_PORT') || urlConfig.port),
    ...(sslConfig ? { ssl: sslConfig } : {}),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const configuredDatabaseName = envValue('DB_NAME') || urlConfig.database || '';

async function ensureDatabaseExists() {
    const configuredDatabase = configuredDatabaseName;
    if (!configuredDatabase) return;

    const connection = await mysql.createConnection(baseConfig);
    try {
        const databaseName = configuredDatabase.replace(/`/g, '``');
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } finally {
        await connection.end();
    }
}

const pool = mysql.createPool({
    ...baseConfig,
    database: configuredDatabaseName
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
    database: configuredDatabaseName,
    ssl: Boolean(sslConfig),
    sslRejectUnauthorized: sslConfig ? sslConfig.rejectUnauthorized : null,
    source: Object.keys(urlConfig).length > 0 ? 'DATABASE_URL' : 'DB_*',
    configured: {
        host: Boolean(baseConfig.host),
        user: Boolean(baseConfig.user),
        password: Boolean(baseConfig.password),
        database: Boolean(configuredDatabaseName)
    }
};
