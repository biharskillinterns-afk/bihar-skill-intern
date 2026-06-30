async function withTransaction(poolOrConnection, work) {
    const hasGetConnection = typeof poolOrConnection.getConnection === 'function';
    const connection = hasGetConnection ? await poolOrConnection.getConnection() : poolOrConnection;
    let started = false;

    try {
        await connection.beginTransaction();
        started = true;
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        if (started) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Transaction rollback failed:', rollbackError.message);
            }
        }
        throw error;
    } finally {
        if (hasGetConnection && connection) connection.release();
    }
}

async function columnExists(connection, tableName, columnName) {
    const [columns] = await connection.query('SHOW COLUMNS FROM ?? LIKE ?', [tableName, columnName]);
    return columns.length > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, definition) {
    if (!(await columnExists(connection, tableName, columnName))) {
        await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
    }
}

async function tableExists(connection, tableName) {
    const [tables] = await connection.query('SHOW TABLES LIKE ?', [tableName]);
    return tables.length > 0;
}

async function indexExists(connection, tableName, indexName) {
    const [indexes] = await connection.query('SHOW INDEX FROM ?? WHERE Key_name = ?', [tableName, indexName]);
    return indexes.length > 0;
}

async function addIndexIfMissing(connection, tableName, indexName, createSql) {
    if (!(await indexExists(connection, tableName, indexName))) {
        try {
            await connection.query(createSql);
        } catch (error) {
            console.warn(`Unable to create index ${indexName} on ${tableName}:`, error.message);
        }
    }
}

module.exports = {
    withTransaction,
    columnExists,
    addColumnIfMissing,
    tableExists,
    indexExists,
    addIndexIfMissing
};
