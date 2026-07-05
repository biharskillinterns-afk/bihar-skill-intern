-- Bihar Skill Intern Database Schema
-- Create this database first: CREATE DATABASE bihar_skill_intern;

-- =============================================
-- STUDENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS students (
    id INT PRIMARY KEY AUTO_INCREMENT,
    firstName VARCHAR(100) NOT NULL,
    lastName VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
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
    semester VARCHAR(50),
    session VARCHAR(50),
    emergencyName VARCHAR(150),
    emergencyPhone VARCHAR(20),
    relationship VARCHAR(100),
    profileImage LONGTEXT,
    signature LONGTEXT,
    bio TEXT,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_status (status)
);

-- =============================================
-- PENDING REGISTRATIONS (Promoted only after payment)
-- =============================================
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
);

-- =============================================
-- ADMINS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS admins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    fullName VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role ENUM('super_admin', 'admin', 'moderator') DEFAULT 'admin',
    lastLogin TIMESTAMP NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
);

-- =============================================
-- COURSES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS courses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    courseName VARCHAR(150) NOT NULL UNIQUE,
    description LONGTEXT,
    duration INT NOT NULL COMMENT 'Duration in days',
    instructor VARCHAR(150),
    level ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
    certificate BOOLEAN DEFAULT TRUE,
    fee DECIMAL(10, 2) DEFAULT 0,
    maxStudents INT DEFAULT 100,
    enrolledStudents INT DEFAULT 0,
    status ENUM('active', 'inactive', 'archived') DEFAULT 'active',
    syllabus LONGTEXT,
    prerequisites VARCHAR(255),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_level (level)
);

-- =============================================
-- STUDENT COURSES (Many to Many Relationship)
-- =============================================
CREATE TABLE IF NOT EXISTS student_courses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    studentId INT NOT NULL,
    courseId INT NOT NULL,
    enrolledAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    progress INT DEFAULT 0 COMMENT 'Percentage 0-100',
    completedAt TIMESTAMP NULL,
    status ENUM('enrolled', 'in_progress', 'completed', 'dropped') DEFAULT 'enrolled',
    marks INT DEFAULT NULL,
    grade VARCHAR(5) DEFAULT NULL,
    certificateNumber VARCHAR(100) DEFAULT NULL,
    quizData LONGTEXT,
    FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE KEY unique_enrollment (studentId, courseId),
    INDEX idx_status (status)
);

-- =============================================
-- PAYMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    studentId INT NOT NULL,
    courseId INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    paymentMethod ENUM('credit_card', 'debit_card', 'upi', 'net_banking', 'wallet') DEFAULT 'credit_card',
    gatewayPaymentId VARCHAR(100),
    gatewayOrderId VARCHAR(100),
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completedAt TIMESTAMP NULL,
    FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (courseId) REFERENCES courses(id),
    INDEX idx_status (status),
    INDEX idx_studentId (studentId)
);

-- =============================================
-- CERTIFICATES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS certificates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    studentId INT NOT NULL,
    courseId INT NOT NULL,
    certificateNumber VARCHAR(100) UNIQUE NOT NULL,
    issuedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiryDate DATE,
    status ENUM('issued', 'revoked', 'suspended') DEFAULT 'issued',
    verificationCode VARCHAR(100) UNIQUE,
    certificateData LONGTEXT,
    FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (courseId) REFERENCES courses(id),
    INDEX idx_studentId (studentId),
    INDEX idx_certificateNumber (certificateNumber)
);

-- =============================================
-- ATTENDANCE TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS attendance (
    id INT PRIMARY KEY AUTO_INCREMENT,
    studentId INT NOT NULL,
    courseId INT NOT NULL,
    attendanceDate DATE NOT NULL,
    status ENUM('present', 'absent', 'late', 'excused') DEFAULT 'present',
    remarks TEXT,
    markedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (courseId) REFERENCES courses(id),
    UNIQUE KEY unique_attendance (studentId, courseId, attendanceDate),
    INDEX idx_date (attendanceDate)
);

-- =============================================
-- INTERNSHIP WORK PROOFS (Online/Offline proof upload)
-- =============================================
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
);

-- =============================================
-- MARKS/GRADES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS marks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    studentId INT NOT NULL,
    courseId INT NOT NULL,
    assignmentMarks INT DEFAULT NULL,
    midtermMarks INT DEFAULT NULL,
    finalMarks INT DEFAULT NULL,
    totalMarks INT DEFAULT NULL,
    grade CHAR(2) DEFAULT NULL,
    remarks TEXT,
    submittedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (courseId) REFERENCES courses(id),
    UNIQUE KEY unique_marks (studentId, courseId),
    INDEX idx_grade (grade)
);

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    userId INT,
    userType ENUM('student', 'admin') NOT NULL,
    title VARCHAR(200) NOT NULL,
    message LONGTEXT NOT NULL,
    type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
    isRead BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_userId (userId),
    INDEX idx_isRead (isRead)
);

-- =============================================
-- AUDIT LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    userId INT,
    userType ENUM('student', 'admin') NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    ipAddress VARCHAR(45),
    userAgent TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_userId (userId),
    INDEX idx_action (action),
    INDEX idx_createdAt (createdAt)
);

-- =============================================
-- PASSWORD RESETS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS password_resets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(100) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    expiresAt TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_token (token),
    INDEX idx_expiresAt (expiresAt)
);

-- =============================================
-- SAMPLE DATA (Optional)
-- =============================================

-- Insert sample courses
INSERT INTO courses (id, courseName, description, duration, instructor, level, certificate, fee, status) VALUES
(1, 'Skill Development', 'Comprehensive training to develop practical and technical skills for professional growth.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(2, 'Social Work', 'Learn social welfare, community development, and making positive impact in society.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(3, 'Population Study', 'Study demographic trends, population dynamics, and social statistics.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(4, 'Disaster Management', 'Learn disaster prevention, emergency response, preparedness, recovery, and crisis management.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(5, 'Digital Literacy', 'Complete guide to digital skills, internet usage, online safety, and technology literacy.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(6, 'Web Development', 'Learn HTML, CSS, JavaScript, frontend and backend basics, hosting, deployment, SEO, testing, and full stack web development foundations.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(7, 'Cyber Security', 'Learn cyber safety, threats, malware, passwords, phishing, network security, and protection practices.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(8, 'Entrepreneurship', 'Learn business ideas, planning, innovation, startup basics, marketing, finance, and entrepreneurial skills.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(9, 'Financial Literacy', 'Learn budgeting, savings, banking, digital payments, investments, insurance, and smart money management.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(10, 'Agriculture', 'Learn farming systems, crop production, soil management, irrigation, agri-business, and sustainable agriculture practices.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(11, 'Healthcare', 'Learn healthcare systems, disease prevention, nutrition, first aid, patient care, hygiene, and public health awareness.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(12, 'Teacher Training', 'Learn teaching methods, lesson planning, classroom management, student psychology, assessment, and modern teaching tools.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(13, 'Tourism', 'Learn tourism types, travel services, hospitality, destination management, cultural tourism, and tourism career skills.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active'),
(14, 'HR Management', 'Learn recruitment, selection, training, performance appraisal, motivation, compensation, employee welfare, labor laws, and HR analytics.', 50, 'Bihar Skill Interns', 'beginner', TRUE, 0, 'active')
ON DUPLICATE KEY UPDATE
    courseName = VALUES(courseName),
    description = VALUES(description),
    duration = VALUES(duration),
    instructor = VALUES(instructor),
    level = VALUES(level),
    certificate = VALUES(certificate),
    fee = VALUES(fee),
    status = VALUES(status);

-- Create your first admin through POST /api/auth/admin/register.
-- The first admin is created as super_admin. After that, set ADMIN_REGISTRATION_KEY
-- in .env if you want to allow additional admin registrations.

-- =============================================
-- VIEWS (Optional - for easier querying)
-- =============================================

CREATE VIEW student_progress_view AS
SELECT 
    s.id,
    s.firstName,
    s.lastName,
    s.email,
    c.courseName,
    sc.enrolledAt,
    sc.progress,
    sc.status,
    m.totalMarks,
    m.grade
FROM students s
JOIN student_courses sc ON s.id = sc.studentId
JOIN courses c ON sc.courseId = c.id
LEFT JOIN marks m ON s.id = m.studentId AND sc.courseId = m.courseId;

CREATE VIEW payment_summary_view AS
SELECT 
    p.id,
    s.firstName,
    s.lastName,
    c.courseName,
    p.amount,
    p.status,
    p.createdAt
FROM payments p
JOIN students s ON p.studentId = s.id
JOIN courses c ON p.courseId = c.id;

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Full-text indexes are optional. Add them manually if your MySQL version supports
-- repeat-safe index creation in your deployment process.
-- ALTER TABLE students ADD FULLTEXT INDEX ft_students_search (firstName, lastName, email);
-- ALTER TABLE courses ADD FULLTEXT INDEX ft_courses_search (courseName, description);
