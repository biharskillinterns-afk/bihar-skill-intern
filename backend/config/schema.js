const fs = require('fs');
const path = require('path');
const { addColumnIfMissing, addIndexIfMissing } = require('../utils/db');

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
            ['majorSubject', "VARCHAR(100)"],
            ['semester', "VARCHAR(50)"],
            ['session', "VARCHAR(50)"],
            ['emergencyName', "VARCHAR(150)"],
            ['emergencyPhone', "VARCHAR(20)"],
            ['relationship', "VARCHAR(100)"],
            ['signature', "LONGTEXT"],
            ['studentCode', "VARCHAR(40) DEFAULT NULL"],
            ['registrationId', "VARCHAR(40) DEFAULT NULL"],
            ['profileImagePath', "VARCHAR(500) DEFAULT NULL"],
            ['signaturePath', "VARCHAR(500) DEFAULT NULL"],
            ['deletedAt', "TIMESTAMP NULL"]
        ];

        for (const [columnName, definition] of requiredStudentColumns) {
            await addColumnIfMissing(connection, 'students', columnName, definition);
        }

        const requiredStudentCourseColumns = [
            ['grade', "VARCHAR(5) DEFAULT NULL"],
            ['certificateNumber', "VARCHAR(100) DEFAULT NULL"],
            ['quizData', "LONGTEXT"]
        ];

        for (const [columnName, definition] of requiredStudentCourseColumns) {
            await addColumnIfMissing(connection, 'student_courses', columnName, definition);
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
                majorSubject VARCHAR(100),
                selectedCourseId INT NULL,
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

        const pendingRegistrationColumns = [
            ['registrationId', "VARCHAR(40) DEFAULT NULL"],
            ['majorSubject', "VARCHAR(100)"],
            ['selectedCourseId', "INT NULL"],
            ['profileImagePath', "VARCHAR(500) DEFAULT NULL"],
            ['signaturePath', "VARCHAR(500) DEFAULT NULL"]
        ];
        for (const [columnName, definition] of pendingRegistrationColumns) {
            await addColumnIfMissing(connection, 'pending_registrations', columnName, definition);
        }

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

        const proofColumns = [
            ['screenshotPath', "VARCHAR(500) DEFAULT NULL"],
            ['fileMimeType', "VARCHAR(120) DEFAULT NULL"],
            ['fileSizeBytes', "INT DEFAULT NULL"]
        ];
        for (const [columnName, definition] of proofColumns) {
            await addColumnIfMissing(connection, 'internship_proofs', columnName, definition);
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS uploaded_files (
                id INT PRIMARY KEY AUTO_INCREMENT,
                ownerType ENUM('student', 'admin', 'system') DEFAULT 'student',
                ownerId INT NULL,
                entityType VARCHAR(80) DEFAULT NULL,
                entityId INT NULL,
                fieldName VARCHAR(80) DEFAULT NULL,
                originalName VARCHAR(255) DEFAULT NULL,
                storedName VARCHAR(255) NOT NULL,
                relativePath VARCHAR(500) NOT NULL,
                mimeType VARCHAR(120) NOT NULL,
                sizeBytes INT NOT NULL,
                sha256 VARCHAR(64) NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_uploaded_owner (ownerType, ownerId),
                INDEX idx_uploaded_entity (entityType, entityId),
                INDEX idx_uploaded_sha (sha256)
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS admin_audit_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                adminId INT NULL,
                action VARCHAR(120) NOT NULL,
                entityType VARCHAR(80) DEFAULT NULL,
                entityId INT NULL,
                beforeValue LONGTEXT,
                afterValue LONGTEXT,
                ipAddress VARCHAR(100),
                userAgent TEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_admin_audit_admin (adminId),
                INDEX idx_admin_audit_action (action),
                INDEX idx_admin_audit_entity (entityType, entityId),
                INDEX idx_admin_audit_created (createdAt)
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS api_request_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                method VARCHAR(10) NOT NULL,
                path VARCHAR(500) NOT NULL,
                statusCode INT NOT NULL,
                durationMs DECIMAL(10, 2) NOT NULL,
                userId INT NULL,
                userRole VARCHAR(30) DEFAULT NULL,
                ipAddress VARCHAR(100),
                userAgent TEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_api_logs_path (path(120)),
                INDEX idx_api_logs_status (statusCode),
                INDEX idx_api_logs_created (createdAt)
            )
        `);

        await addIndexIfMissing(connection, 'students', 'idx_students_studentCode', 'CREATE INDEX idx_students_studentCode ON students (studentCode)');
        await addIndexIfMissing(connection, 'students', 'idx_students_registrationId', 'CREATE INDEX idx_students_registrationId ON students (registrationId)');
        await addIndexIfMissing(connection, 'students', 'idx_students_deletedAt', 'CREATE INDEX idx_students_deletedAt ON students (deletedAt)');
        await addIndexIfMissing(connection, 'pending_registrations', 'idx_pending_registrationId', 'CREATE INDEX idx_pending_registrationId ON pending_registrations (registrationId)');
        await addIndexIfMissing(connection, 'payments', 'idx_payments_order', 'CREATE INDEX idx_payments_order ON payments (gatewayOrderId)');
        await addIndexIfMissing(connection, 'payments', 'idx_payments_gateway_payment', 'CREATE INDEX idx_payments_gateway_payment ON payments (gatewayPaymentId)');
        await addIndexIfMissing(connection, 'student_courses', 'idx_student_courses_certificate', 'CREATE INDEX idx_student_courses_certificate ON student_courses (certificateNumber)');
        await addIndexIfMissing(connection, 'internship_proofs', 'idx_proofs_student_course_date', 'CREATE INDEX idx_proofs_student_course_date ON internship_proofs (studentId, courseId, proofDate)');

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

async function ensureMajorSubjectMigration(pool) {
    const connection = await pool.getConnection();

    try {
        await addColumnIfMissing(connection, 'students', 'majorSubject', 'VARCHAR(100)');
        await addColumnIfMissing(connection, 'pending_registrations', 'majorSubject', 'VARCHAR(100)');
        console.log('Major Subject (MJC) database columns are ready.');
    } finally {
        connection.release();
    }
}

module.exports = {
    ensureSchema,
    ensureRuntimeSchema,
    ensureMajorSubjectMigration
};
