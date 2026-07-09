-- Add selected internship course reference to pending registrations.
-- Safe for existing production databases; no data is modified.

SET @column_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pending_registrations'
      AND COLUMN_NAME = 'selectedCourseId'
);

SET @sql := IF(
    @column_exists = 0,
    'ALTER TABLE `pending_registrations` ADD COLUMN `selectedCourseId` INT NULL',
    'SELECT ''pending_registrations.selectedCourseId already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
