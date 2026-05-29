const fs = require('fs');
const path = require('path');

const ignoredSchemaErrors = new Set([
    'ER_TABLE_EXISTS_ERROR',
    'ER_TABLEACCESS_DENIED_ERROR'
]);

function splitSqlStatements(sql) {
    const statements = [];
    let current = '';
    let quote = null;

    for (let index = 0; index < sql.length; index += 1) {
        const char = sql[index];
        const next = sql[index + 1];

        if (quote) {
            current += char;
            if (char === '\\' && next) {
                current += next;
                index += 1;
                continue;
            }
            if (char === quote) quote = null;
            continue;
        }

        if (char === '\'' || char === '"' || char === '`') {
            quote = char;
            current += char;
            continue;
        }

        if (char === '-' && next === '-') {
            while (index < sql.length && sql[index] !== '\n') index += 1;
            current += '\n';
            continue;
        }

        if (char === '/' && next === '*') {
            index += 2;
            while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) index += 1;
            index += 1;
            continue;
        }

        if (char === ';') {
            const statement = current.trim();
            if (statement) statements.push(statement);
            current = '';
            continue;
        }

        current += char;
    }

    const finalStatement = current.trim();
    if (finalStatement) statements.push(finalStatement);
    return statements;
}

async function ensureSchema(pool) {
    const schemaPath = path.join(__dirname, '..', 'database_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const statements = splitSqlStatements(schema);
    const connection = await pool.getConnection();

    try {
        for (const statement of statements) {
            try {
                await connection.query(statement);
            } catch (error) {
                const isExistingView = error.code === 'ER_TABLE_EXISTS_ERROR' && /^\s*CREATE\s+VIEW/i.test(statement);
                if (!ignoredSchemaErrors.has(error.code) && !isExistingView) {
                    throw error;
                }
            }
        }

        console.log('Database schema is ready.');
    } finally {
        connection.release();
    }
}

module.exports = {
    ensureSchema
};
