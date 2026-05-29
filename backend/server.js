const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();
const pool = require('./config/database');
const { ensureDatabaseExists } = require('./config/database');
const { ensureSchema } = require('./config/schema');
const paymentsRouter = require('./routes/payments');

const app = express();

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make pool accessible to routes
app.use((req, res, next) => {
    req.db = pool;
    next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/payments', paymentsRouter);
app.use('/api/certificates', require('./routes/certificates'));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'Backend is running successfully!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
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
async function startServer() {
    await ensureDatabaseExists();

    if (process.env.SKIP_SCHEMA_SYNC !== 'true') {
        await ensureSchema(pool);
    }

    app.listen(PORT, () => {
        console.log(`Backend server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
}

startServer().catch(error => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
});

module.exports = app;
