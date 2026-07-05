SET @students_major_subject_sql = (
    SELECT IF(
        COUNT(*) = 0,
        'ALTER TABLE `students` ADD COLUMN `majorSubject` VARCHAR(100)',
        'SELECT ''students.majorSubject already exists'''
    )
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'students'
      AND COLUMN_NAME = 'majorSubject'
);
PREPARE students_major_subject_stmt FROM @students_major_subject_sql;
EXECUTE students_major_subject_stmt;
DEALLOCATE PREPARE students_major_subject_stmt;

SET @pending_major_subject_sql = (
    SELECT IF(
        COUNT(*) = 0,
        'ALTER TABLE `pending_registrations` ADD COLUMN `majorSubject` VARCHAR(100)',
        'SELECT ''pending_registrations.majorSubject already exists'''
    )
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pending_registrations'
      AND COLUMN_NAME = 'majorSubject'
);
PREPARE pending_major_subject_stmt FROM @pending_major_subject_sql;
EXECUTE pending_major_subject_stmt;
DEALLOCATE PREPARE pending_major_subject_stmt;
