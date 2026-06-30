const cache = new Map();
const CACHE_TTL_MS = Number(process.env.SCHEMA_COMPAT_CACHE_MS || 60_000);

function cacheKey(type, tableName, columnName = '') {
    return `${type}:${tableName}:${columnName}`;
}

async function cachedCheck(key, checker) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) return cached.value;

    try {
        const value = await checker();
        cache.set(key, { value, checkedAt: Date.now() });
        return value;
    } catch (error) {
        console.warn(`Schema compatibility check failed for ${key}:`, error.message);
        cache.set(key, { value: false, checkedAt: Date.now() });
        return false;
    }
}

async function compatTableExists(connection, tableName) {
    return cachedCheck(cacheKey('table', tableName), async () => {
        const [tables] = await connection.query('SHOW TABLES LIKE ?', [tableName]);
        return tables.length > 0;
    });
}

async function compatColumnExists(connection, tableName, columnName) {
    return cachedCheck(cacheKey('column', tableName, columnName), async () => {
        const [columns] = await connection.query('SHOW COLUMNS FROM ?? LIKE ?', [tableName, columnName]);
        return columns.length > 0;
    });
}

async function studentActiveClause(connection, alias = '') {
    const prefix = alias ? `${alias}.` : '';
    const hasDeletedAt = await compatColumnExists(connection, 'students', 'deletedAt');
    return hasDeletedAt ? ` AND ${prefix}deletedAt IS NULL` : '';
}

async function updateStudentGeneratedIds(connection, studentId, values) {
    const assignments = [];
    const params = [];

    for (const [columnName, value] of Object.entries(values)) {
        if (await compatColumnExists(connection, 'students', columnName)) {
            assignments.push(`\`${columnName}\` = ?`);
            params.push(value);
        }
    }

    if (assignments.length === 0) return false;
    params.push(studentId);
    await connection.query(`UPDATE students SET ${assignments.join(', ')} WHERE id = ?`, params);
    return true;
}

async function updatePendingRegistrationId(connection, pendingRegistrationId, registrationId) {
    if (!(await compatColumnExists(connection, 'pending_registrations', 'registrationId'))) return false;
    await connection.query(
        'UPDATE pending_registrations SET registrationId = ? WHERE id = ?',
        [registrationId, pendingRegistrationId]
    );
    return true;
}

async function safeRecordUploadedFile(connection, recorder, file, details) {
    if (!file || !(await compatTableExists(connection, 'uploaded_files'))) return null;
    return recorder(connection, file, details);
}

async function internshipProofInsertShape(connection) {
    return {
        hasScreenshotPath: await compatColumnExists(connection, 'internship_proofs', 'screenshotPath'),
        hasFileMimeType: await compatColumnExists(connection, 'internship_proofs', 'fileMimeType'),
        hasFileSizeBytes: await compatColumnExists(connection, 'internship_proofs', 'fileSizeBytes')
    };
}

module.exports = {
    compatTableExists,
    compatColumnExists,
    studentActiveClause,
    updateStudentGeneratedIds,
    updatePendingRegistrationId,
    safeRecordUploadedFile,
    internshipProofInsertShape
};
