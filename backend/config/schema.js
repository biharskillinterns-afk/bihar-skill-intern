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

        await connection.query(`
            CREATE TABLE IF NOT EXISTS internship_proofs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                studentId INT NOT NULL,
                courseId INT NULL,
                proofDate DATE NOT NULL,
                internshipMode ENUM('online', 'offline') DEFAULT 'online',
                topic VARCHAR(255) NOT NULL,
                workDescription TEXT,
                screenshot LONGTEXT NOT NULL,
                fileName VARCHAR(255),
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                adminRemarks TEXT,
                uploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewedAt TIMESTAMP NULL,
                reviewedBy INT NULL,
                FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE SET NULL,
                INDEX idx_student_proof_status (studentId, status),
                INDEX idx_proof_date (proofDate),
                INDEX idx_proof_status (status)
            )
        `);

        const defaultCourses = [
            [1, 'Skill Development', 'Comprehensive training to develop practical and technical skills for professional growth.', 50],
            [2, 'Social Work', 'Learn social welfare, community development, and making positive impact in society.', 50],
            [3, 'Population Study', 'Study demographic trends, population dynamics, and social statistics.', 50],
            [4, 'Disaster Management', 'Learn disaster prevention, emergency response, preparedness, recovery, and crisis management.', 50],
            [5, 'Digital Literacy', 'Complete guide to digital skills, internet usage, online safety, and technology literacy.', 50],
            [6, 'Web Development', 'Learn HTML, CSS, JavaScript, frontend and backend basics, hosting, deployment, SEO, testing, and full stack web development foundations.', 50],
            [7, 'Cyber Security', 'Learn cyber safety, threats, malware, passwords, phishing, network security, and protection practices.', 50],
            [8, 'Entrepreneurship', 'Learn business ideas, planning, innovation, startup basics, marketing, finance, and entrepreneurial skills.', 50],
            [9, 'Financial Literacy', 'Learn budgeting, savings, banking, digital payments, investments, insurance, and smart money management.', 50],
            [10, 'Agriculture', 'Learn farming systems, crop production, soil management, irrigation, agri-business, and sustainable agriculture practices.', 50],
            [11, 'Healthcare', 'Learn healthcare systems, disease prevention, nutrition, first aid, patient care, hygiene, and public health awareness.', 50],
            [12, 'Teacher Training', 'Learn teaching methods, lesson planning, classroom management, student psychology, assessment, and modern teaching tools.', 50],
            [13, 'Tourism', 'Learn tourism types, travel services, hospitality, destination management, cultural tourism, and tourism career skills.', 50],
            [14, 'HR Management', 'Learn recruitment, selection, training, performance appraisal, motivation, compensation, employee welfare, labor laws, and HR analytics.', 50]
        ];

        await connection.query(
            `INSERT INTO courses (id, courseName, description, duration, instructor, level, certificate, fee, status, createdAt)
             VALUES ?
             ON DUPLICATE KEY UPDATE
                courseName = VALUES(courseName),
                description = VALUES(description),
                duration = VALUES(duration),
                instructor = VALUES(instructor),
                level = VALUES(level),
                certificate = VALUES(certificate),
                fee = VALUES(fee),
                status = VALUES(status)`,
            [defaultCourses.map(([id, courseName, description, duration]) => [
                id,
                courseName,
                description,
                duration,
                'Bihar Skill Interns',
                'beginner',
                true,
                0,
                'active',
                new Date()
            ])]
        );
    } finally {
        connection.release();
    }
}

module.exports = {
    ensureSchema,
    ensureRuntimeSchema
};
