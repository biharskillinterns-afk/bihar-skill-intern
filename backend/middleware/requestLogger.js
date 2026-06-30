function requestLogger(req, res, next) {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const userPart = req.user?.id ? ` user=${req.user.id}` : '';
        console.log(`[API] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms${userPart}`);
        if (process.env.API_DB_LOGGING === 'true' && req.db && req.originalUrl.startsWith('/api')) {
            req.db.query(
                `INSERT INTO api_request_logs
                    (method, path, statusCode, durationMs, userId, userRole, ipAddress, userAgent, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    req.method,
                    req.originalUrl.slice(0, 500),
                    res.statusCode,
                    Number(durationMs.toFixed(2)),
                    req.user?.id || null,
                    req.user?.role || null,
                    req.ip || req.headers['x-forwarded-for'] || null,
                    req.headers['user-agent'] || null
                ]
            ).catch(error => {
                console.warn('API request DB log failed:', error.message);
            });
        }
    });
    next();
}

module.exports = requestLogger;
