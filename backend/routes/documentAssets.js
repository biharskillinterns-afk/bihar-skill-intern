const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../utils/audit');
const { compatTableExists, safeRecordUploadedFile } = require('../utils/compat');
const { saveDataUrlFile, recordUploadedFile } = require('../utils/security');

const DEFAULT_ASSETS = {
    companyLogo: 'assets/certificates/bihar-skill-intern-logo.png',
    officialSeal: 'assets/certificates/bihar-skill-interns-round-seal.png',
    authorizedSignature: 'assets/certificates/authorized-signature-official.png',
    programCoordinatorSignature: 'assets/certificates/program-coordinator-signature.png',
    verificationQr: 'assets/certificates/bihar-skill-interns-verification-qr.png'
};

const ASSET_LABELS = {
    companyLogo: 'Company Logo',
    officialSeal: 'Official Round Seal',
    authorizedSignature: 'Authorized Signatory Signature',
    programCoordinatorSignature: 'Program Coordinator Signature',
    verificationQr: 'Verification QR Code'
};

function toAbsoluteUploadUrl(req, fileUrl) {
    if (!fileUrl || /^https?:\/\//i.test(fileUrl)) return fileUrl;
    const host = req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    return `${protocol}://${host}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
}

function normalizeAsset(req, row) {
    return {
        id: row.id,
        assetKey: row.assetKey,
        label: row.label || ASSET_LABELS[row.assetKey] || row.assetKey,
        fileUrl: toAbsoluteUploadUrl(req, row.fileUrl),
        originalName: row.originalName || '',
        mimeType: row.mimeType || '',
        isActive: row.isActive !== 0,
        updatedAt: row.updatedAt || row.createdAt || null
    };
}

async function loadActiveAssets(req) {
    const connection = req.db;
    const assets = { ...DEFAULT_ASSETS };
    if (!(await compatTableExists(connection, 'document_branding_assets'))) {
        return { assets, rows: [] };
    }

    const [rows] = await connection.query(
        `SELECT id, assetKey, label, fileUrl, originalName, mimeType, isActive, createdAt, updatedAt
         FROM document_branding_assets
         WHERE isActive = 1
         ORDER BY updatedAt DESC, id DESC`
    );

    rows.forEach(row => {
        if (row.assetKey && row.fileUrl) assets[row.assetKey] = toAbsoluteUploadUrl(req, row.fileUrl);
    });

    return {
        assets,
        rows: rows.map(row => normalizeAsset(req, row))
    };
}

router.get('/public', async (req, res, next) => {
    try {
        const result = await loadActiveAssets(req);
        res.json({
            success: true,
            defaults: DEFAULT_ASSETS,
            assets: result.assets
        });
    } catch (error) {
        next(error);
    }
});

router.get('/admin', verifyToken, isAdmin, async (req, res, next) => {
    try {
        const tableReady = await compatTableExists(req.db, 'document_branding_assets');
        const result = tableReady
            ? await loadActiveAssets(req)
            : { assets: { ...DEFAULT_ASSETS }, rows: [] };

        res.json({
            success: true,
            tableReady,
            defaults: DEFAULT_ASSETS,
            labels: ASSET_LABELS,
            assets: result.assets,
            rows: result.rows
        });
    } catch (error) {
        next(error);
    }
});

router.post('/admin/upload', verifyToken, isAdmin, async (req, res, next) => {
    try {
        const { assetKey, label, dataUrl, originalName } = req.body || {};
        if (!Object.prototype.hasOwnProperty.call(ASSET_LABELS, assetKey)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid document asset type'
            });
        }

        if (!(await compatTableExists(req.db, 'document_branding_assets'))) {
            return res.status(503).json({
                success: false,
                message: 'Document branding asset table is not available. Run the migration before uploading assets.'
            });
        }

        const file = await saveDataUrlFile({
            dataUrl,
            category: 'document-assets',
            ownerId: req.user?.id || 'admin',
            originalName: originalName || `${assetKey}.png`
        });

        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a valid PNG, JPG, JPEG, or WEBP image under the allowed file size.'
            });
        }

        const uploadedFileId = await safeRecordUploadedFile(req.db, recordUploadedFile, file, {
            ownerType: 'admin',
            ownerId: req.user?.id || null,
            entityType: 'document_branding_assets',
            fieldName: assetKey
        });

        const resolvedLabel = String(label || ASSET_LABELS[assetKey]).trim() || ASSET_LABELS[assetKey];
        await req.db.query(
            `INSERT INTO document_branding_assets
                (assetKey, label, fileUrl, originalName, mimeType, isActive, uploadedFileId, createdBy, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
                label = VALUES(label),
                fileUrl = VALUES(fileUrl),
                originalName = VALUES(originalName),
                mimeType = VALUES(mimeType),
                isActive = 1,
                uploadedFileId = VALUES(uploadedFileId),
                createdBy = VALUES(createdBy),
                updatedAt = NOW()`,
            [
                assetKey,
                resolvedLabel,
                file.fileUrl,
                file.originalName,
                file.mimeType,
                uploadedFileId,
                req.user?.id || null
            ]
        );

        await logAdminAction(req.db, req, 'document_asset_update', {
            entityType: 'document_branding_assets',
            afterValue: { assetKey, label: resolvedLabel, fileUrl: file.fileUrl }
        });

        res.json({
            success: true,
            message: `${resolvedLabel} updated successfully.`,
            asset: {
                assetKey,
                label: resolvedLabel,
                fileUrl: toAbsoluteUploadUrl(req, file.fileUrl),
                originalName: file.originalName,
                mimeType: file.mimeType,
                isActive: true
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
