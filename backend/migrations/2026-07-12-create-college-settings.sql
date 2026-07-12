CREATE TABLE IF NOT EXISTS college_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    collegeId VARCHAR(50) DEFAULT '',
    collegeName VARCHAR(255) NOT NULL,
    classMode ENUM('online', 'offline') DEFAULT 'online',
    paymentMode ENUM('auto', 'custom') DEFAULT 'auto',
    customFee DECIMAL(10, 2) DEFAULT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_college_settings_name (collegeName),
    INDEX idx_college_settings_id (collegeId)
);
