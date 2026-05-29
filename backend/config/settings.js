const DEFAULT_REGISTRATION_AMOUNT = 299;

async function ensureSettingsTable(connection) {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
            settingKey VARCHAR(100) PRIMARY KEY,
            settingValue TEXT NOT NULL,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
}

async function getRegistrationAmount(db) {
    const connection = await db.getConnection();
    try {
        await ensureSettingsTable(connection);
        const [settings] = await connection.query(
            'SELECT settingValue FROM app_settings WHERE settingKey = ? LIMIT 1',
            ['registration_amount']
        );

        const amount = Number(settings[0]?.settingValue || DEFAULT_REGISTRATION_AMOUNT);
        return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : DEFAULT_REGISTRATION_AMOUNT;
    } finally {
        connection.release();
    }
}

async function setRegistrationAmount(db, amount) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 1) {
        const error = new Error('Valid registration amount is required');
        error.statusCode = 400;
        throw error;
    }

    const roundedAmount = Math.round(numericAmount);
    const connection = await db.getConnection();
    try {
        await ensureSettingsTable(connection);
        await connection.query(
            `INSERT INTO app_settings (settingKey, settingValue)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE settingValue = VALUES(settingValue), updatedAt = NOW()`,
            ['registration_amount', String(roundedAmount)]
        );

        return roundedAmount;
    } finally {
        connection.release();
    }
}

module.exports = {
    DEFAULT_REGISTRATION_AMOUNT,
    getRegistrationAmount,
    setRegistrationAmount
};
