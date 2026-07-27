CREATE TABLE IF NOT EXISTS document_branding_assets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    assetKey VARCHAR(80) NOT NULL,
    label VARCHAR(160) NOT NULL,
    fileUrl VARCHAR(500) NOT NULL,
    originalName VARCHAR(255) DEFAULT NULL,
    mimeType VARCHAR(120) DEFAULT NULL,
    isActive TINYINT(1) DEFAULT 1,
    uploadedFileId INT DEFAULT NULL,
    createdBy INT DEFAULT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_document_branding_asset_key (assetKey),
    INDEX idx_document_branding_active (isActive),
    INDEX idx_document_branding_updated (updatedAt)
);
