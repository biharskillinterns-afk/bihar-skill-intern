const { getRegistrationAmount } = require('./settings');

function splitCollegeValue(collegeValue = '') {
    const text = String(collegeValue || '').trim();
    const match = text.match(/^([^/]+?)\s*\/\s*(.+)$/);
    if (!match) {
        return {
            collegeId: '',
            collegeName: text
        };
    }

    return {
        collegeId: match[1].trim(),
        collegeName: match[2].trim()
    };
}

function normalizeCollegeName(value = '') {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function normalizeCollegeSettingsRow(row = null) {
    if (!row) return null;
    return {
        id: row.id,
        collegeId: row.collegeId || '',
        collegeName: row.collegeName || '',
        classMode: row.classMode === 'offline' ? 'offline' : 'online',
        paymentMode: row.paymentMode === 'custom' ? 'custom' : 'auto',
        customFee: row.customFee === null || row.customFee === undefined ? null : Number(row.customFee)
    };
}

async function getCollegeSettingsByCollege(connection, collegeValue = '') {
    const parsed = splitCollegeValue(collegeValue);
    const candidates = [
        collegeValue,
        parsed.collegeName
    ]
        .map(normalizeCollegeName)
        .filter(Boolean);

    if (candidates.length === 0) return null;

    let rows = [];
    try {
        [rows] = await connection.query(
            'SELECT * FROM college_settings'
        );
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            console.warn('college_settings table missing; using global fee and online class defaults.');
            return null;
        }
        throw error;
    }

    const match = rows.find(row => {
        const rowName = normalizeCollegeName(row.collegeName);
        const rowId = String(row.collegeId || '').trim();
        return candidates.includes(rowName) ||
            (parsed.collegeId && rowId && rowId === parsed.collegeId);
    });

    return normalizeCollegeSettingsRow(match);
}

async function getEffectiveCollegePaymentSettings(db, collegeValue = '') {
    const globalAmount = await getRegistrationAmount(db);
    const connection = await db.getConnection();
    try {
        const settings = await getCollegeSettingsByCollege(connection, collegeValue);
        const customFee = Number(settings?.customFee);
        const useCustomFee = settings?.paymentMode === 'custom' && Number.isFinite(customFee) && customFee > 0;

        return {
            amount: useCustomFee ? Math.round(customFee) : globalAmount,
            globalAmount,
            collegeSettings: settings,
            classMode: settings?.classMode === 'offline' ? 'offline' : 'online',
            paymentMode: settings?.paymentMode === 'custom' ? 'custom' : 'auto',
            customFee: useCustomFee ? Math.round(customFee) : null
        };
    } finally {
        connection.release();
    }
}

module.exports = {
    splitCollegeValue,
    normalizeCollegeSettingsRow,
    getCollegeSettingsByCollege,
    getEffectiveCollegePaymentSettings
};
