SET @table_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'document_branding_assets'
);

SET @column_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'document_branding_assets'
      AND COLUMN_NAME = 'assetDataUrl'
);

SET @migration_sql := IF(
    @table_exists > 0 AND @column_exists = 0,
    'ALTER TABLE document_branding_assets ADD COLUMN assetDataUrl LONGTEXT NULL AFTER fileUrl',
    'SELECT 1'
);

PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
