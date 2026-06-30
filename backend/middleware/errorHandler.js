function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
}

function errorHandler(err, req, res, next) {
    const statusCode = err.status || err.statusCode || (err.type === 'entity.too.large' ? 413 : 500);
    const publicMessage = statusCode === 413
        ? 'Uploaded form data is too large'
        : statusCode >= 500
            ? 'Internal server error'
            : err.message || 'Request failed';

    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.stack || err.message);
    res.status(statusCode).json({
        success: false,
        message: publicMessage,
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
}

module.exports = {
    asyncHandler,
    notFoundHandler,
    errorHandler
};
