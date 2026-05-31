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

async function ensureRuntimeSchema(pool) {
    const connection = await pool.getConnection();

    try {
        const requiredStudentColumns = [
            ['rollNo', "VARCHAR(50)"],
            ['guardian', "VARCHAR(150)"],
            ['address', "TEXT"],
            ['pincode', "VARCHAR(10)"],
            ['university', "VARCHAR(150) DEFAULT 'Veer Kunwar Singh University'"],
            ['degree', "VARCHAR(100)"],
            ['department', "VARCHAR(100)"],
            ['semester', "VARCHAR(50)"],
            ['session', "VARCHAR(50)"],
            ['emergencyName', "VARCHAR(150)"],
            ['emergencyPhone', "VARCHAR(20)"],
            ['relationship', "VARCHAR(100)"],
            ['signature', "LONGTEXT"]
        ];

        for (const [columnName, definition] of requiredStudentColumns) {
            const [columns] = await connection.query('SHOW COLUMNS FROM students LIKE ?', [columnName]);
            if (columns.length === 0) {
                await connection.query(`ALTER TABLE students ADD COLUMN \`${columnName}\` ${definition}`);
            }
        }

        const requiredStudentCourseColumns = [
            ['grade', "VARCHAR(5) DEFAULT NULL"],
            ['certificateNumber', "VARCHAR(100) DEFAULT NULL"],
            ['quizData', "LONGTEXT"]
        ];

        for (const [columnName, definition] of requiredStudentCourseColumns) {
            const [columns] = await connection.query('SHOW COLUMNS FROM student_courses LIKE ?', [columnName]);
            if (columns.length === 0) {
                await connection.query(`ALTER TABLE student_courses ADD COLUMN \`${columnName}\` ${definition}`);
            }
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS pending_registrations (
                id INT PRIMARY KEY AUTO_INCREMENT,
                firstName VARCHAR(100) NOT NULL,
                lastName VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                password VARCHAR(255) NOT NULL,
                dob DATE NOT NULL,
                gender ENUM('male', 'female', 'other') NOT NULL,
                college VARCHAR(150) NOT NULL,
                course VARCHAR(150) DEFAULT '',
                district VARCHAR(100),
                state VARCHAR(100) DEFAULT 'Bihar',
                rollNo VARCHAR(50),
                guardian VARCHAR(150),
                address TEXT,
                pincode VARCHAR(10),
                university VARCHAR(150) DEFAULT 'Veer Kunwar Singh University',
                degree VARCHAR(100),
                department VARCHAR(100),
                semester VARCHAR(50),
                session VARCHAR(50),
                emergencyName VARCHAR(150),
                emergencyPhone VARCHAR(20),
                relationship VARCHAR(100),
                profileImage LONGTEXT,
                signature LONGTEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expiresAt TIMESTAMP NULL,
                INDEX idx_pending_email (email),
                INDEX idx_pending_created (createdAt)
            )
        `);
    } finally {
        connection.release();
    }
}

module.exports = {
    ensureSchema,
    ensureRuntimeSchema
};
