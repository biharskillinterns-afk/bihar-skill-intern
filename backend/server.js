const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();
const pool = require('./config/database');
const { ensureDatabaseExists, testDatabaseConnection, dbConnectionInfo } = require('./config/database');
const { ensureSchema, ensureRuntimeSchema } = require('./config/schema');
const paymentsRouter = require('./routes/payments');

const app = express();
const databaseState = {
    ready: false,
    initializing: true,
    lastError: null,
    lastCheckedAt: null
};

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getPublicDatabaseError() {
    if (!databaseState.lastError) return 'Database is starting. Please try again in a moment.';
    return `Database is not ready yet: ${databaseState.lastError}`;
}

function getOrigin(url) {
    try {
        return new URL(url).origin;
    } catch (error) {
        return url;
    }
}

const allowedOrigins = new Set([
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URL ? getOrigin(process.env.FRONTEND_URL) : '',
    'https://biharskillinterns-afk.github.io',
    'http://localhost',
    'http://127.0.0.1',
    'null'
].filter(Boolean));

// Webhook must receive the raw body so Razorpay signature verification works.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    req.db = pool;
    paymentsRouter.handleRazorpayWebhook(req, res);
});

// Middleware
app.use(cors({
    origin(origin, callback) {
        const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
        if (!origin || allowedOrigins.has(origin) || isLocalOrigin) {
            callback(null, true);
            return;
        }

        callback(new Error(`CORS blocked origin: ${origin}`));
    }
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Make pool accessible to routes
app.use((req, res, next) => {
    req.db = pool;
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'Backend is running successfully!',
        database: {
            ready: databaseState.ready,
            initializing: databaseState.initializing,
            lastError: databaseState.lastError,
            lastCheckedAt: databaseState.lastCheckedAt,
            host: dbConnectionInfo.host,
            port: dbConnectionInfo.port,
            name: dbConnectionInfo.database
        }
    });
});

app.use('/api', (req, res, next) => {
    if (databaseState.ready || req.path === '/health') {
        next();
        return;
    }

    res.status(503).json({
        success: false,
        message: getPublicDatabaseError()
    });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/payments', paymentsRouter);
app.use('/api/certificates', require('./routes/certificates'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: statusCode === 413 ? 'Uploaded form data is too large' : 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Start server
const PORT = process.env.PORT || 5000;
async function initializeDatabaseWithRetry() {
    const maxAttempts = Number(process.env.DB_STARTUP_ATTEMPTS || 8);
    const retryDelayMs = Number(process.env.DB_STARTUP_RETRY_MS || 10000);
    const slowRetryDelayMs = Number(process.env.DB_BACKGROUND_RETRY_MS || 60000);
    let attempt = 0;

    while (!databaseState.ready) {
        attempt += 1;
        try {
            databaseState.initializing = true;
            databaseState.lastCheckedAt = new Date().toISOString();
            const attemptLabel = attempt <= maxAttempts ? `${attempt}/${maxAttempts}` : `${attempt} background`;
            console.log(`Checking database connection (${attemptLabel}) at ${dbConnectionInfo.host}:${dbConnectionInfo.port}`);

            await ensureDatabaseExists();
            await testDatabaseConnection();
            try {
                await ensureRuntimeSchema(pool);
            } catch (error) {
                const missingTable = error.code === 'ER_NO_SUCH_TABLE'
                    || /table .* doesn't exist/i.test(error.message || '');
                if (!missingTable) throw error;

                console.log('Database tables are missing. Creating full schema...');
                await ensureSchema(pool);
                await ensureRuntimeSchema(pool);
            }

            databaseState.ready = true;
            databaseState.initializing = false;
            databaseState.lastError = null;
            databaseState.lastCheckedAt = new Date().toISOString();
            console.log('Database schema is ready.');
            return;
        } catch (error) {
            databaseState.ready = false;
            databaseState.lastError = error.message;
            databaseState.lastCheckedAt = new Date().toISOString();
            console.error(`Database startup attempt ${attempt} failed:`, error.message);

            await wait(attempt < maxAttempts ? retryDelayMs : slowRetryDelayMs);
        }
    }
}

function startServer() {
    app.listen(PORT, () => {
        console.log(`Backend server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        initializeDatabaseWithRetry();
    });
}

startServer();

module.exports = app;
