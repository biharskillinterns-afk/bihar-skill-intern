const crypto = require('crypto');

function year() {
    return new Date().getFullYear();
}

function paddedId(id) {
    return String(id || 0).padStart(6, '0');
}

function randomPart(size = 4) {
    return crypto.randomBytes(size).toString('hex').toUpperCase();
}

function buildStudentCode(studentId) {
    return `BSI-STU-${year()}-${paddedId(studentId)}`;
}

function buildRegistrationId(id) {
    return `BSI-REG-${year()}-${paddedId(id)}`;
}

async function generateUniqueCertificateNumber(connection, studentId, courseId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const value = `BSI-CERT-${year()}-${paddedId(studentId)}-${paddedId(courseId)}-${randomPart(3)}`;
        const [studentCourseRows] = await connection.query(
            'SELECT id FROM student_courses WHERE certificateNumber = ? LIMIT 1',
            [value]
        );
        const [certificateRows] = await connection.query(
            'SELECT id FROM certificates WHERE certificateNumber = ? LIMIT 1',
            [value]
        );
        if (studentCourseRows.length === 0 && certificateRows.length === 0) return value;
    }

    return `BSI-CERT-${year()}-${paddedId(studentId)}-${paddedId(courseId)}-${Date.now()}`;
}

module.exports = {
    buildStudentCode,
    buildRegistrationId,
    generateUniqueCertificateNumber
};
