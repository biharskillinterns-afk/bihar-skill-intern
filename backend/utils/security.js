const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 3 * 1024 * 1024);

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function sanitizeText(value) {
    if (typeof value !== 'string') return value;
    return value
        .replace(/\u0000/g, '')
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
        .trim();
}

function sanitizePayload(value) {
    if (Array.isArray(value)) return value.map(sanitizePayload);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizePayload(item)]));
    }
    return sanitizeText(value);
}

function sanitizeRequestBody(req, res, next) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        req.body = sanitizePayload(req.body);
    }
    next();
}

function parseDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\s]+)$/i);
    if (!match) return null;
    const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) return null;
    return {
        mimeType: match[1].toLowerCase(),
        buffer
    };
}

function extensionForMime(mimeType) {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg';
}

async function saveDataUrlFile({ dataUrl, category, ownerId, originalName = 'upload' }) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;

    const dateFolder = new Date().toISOString().slice(0, 10);
    const safeCategory = String(category || 'general').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const directory = path.join(UPLOAD_ROOT, safeCategory, dateFolder);
    await fs.promises.mkdir(directory, { recursive: true });

    const sha256 = crypto.createHash('sha256').update(parsed.buffer).digest('hex');
    const storedName = `${Date.now()}-${ownerId || 'user'}-${sha256.slice(0, 12)}.${extensionForMime(parsed.mimeType)}`;
    const absolutePath = path.join(directory, storedName);
    await fs.promises.writeFile(absolutePath, parsed.buffer, { flag: 'wx' }).catch(async error => {
        if (error.code === 'EEXIST') return;
        throw error;
    });

    const relativePath = path.relative(path.join(__dirname, '..'), absolutePath).replace(/\\/g, '/');
    return {
        originalName,
        storedName,
        relativePath,
        fileUrl: `/${relativePath}`,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.buffer.length,
        sha256
    };
}

async function recordUploadedFile(connection, file, details = {}) {
    if (!file) return null;
    const [result] = await connection.query(
        `INSERT INTO uploaded_files
            (ownerType, ownerId, entityType, entityId, fieldName, originalName, storedName, relativePath, mimeType, sizeBytes, sha256, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            details.ownerType || 'student',
            details.ownerId || null,
            details.entityType || null,
            details.entityId || null,
            details.fieldName || null,
            file.originalName || '',
            file.storedName,
            file.relativePath,
            file.mimeType,
            file.sizeBytes,
            file.sha256
        ]
    );
    return result.insertId;
}

module.exports = {
    normalizeEmail,
    sanitizePayload,
    sanitizeRequestBody,
    saveDataUrlFile,
    recordUploadedFile
};
