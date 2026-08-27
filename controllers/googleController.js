const { google } = require('googleapis');
const db = require('../config/db');

const getOAuth2Client = (refreshToken) => {
    const redirectUri = process.env.NODE_ENV === 'production'
        ? 'https://cashwisely.onrender.com/auth/google/callback'
        : 'http://localhost:4000/auth/google/callback';

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || redirectUri
    );

    if (refreshToken) {
        oauth2Client.setCredentials({ refresh_token: refreshToken });
    }
    return oauth2Client;
};

/**
 * Syncs all past and present expenses from MySQL to Google Sheets
 */
exports.syncAllExpensesToSheet = async (userId, sessionTokens = null) => {
    try {
        const [userRows] = await db.execute(`SELECT google_refresh_token FROM users WHERE id = ?`, [userId]);
        const [settingsRows] = await db.execute(`SELECT google_sheet_id FROM settings WHERE user_id = ?`, [userId]);

        const refreshToken = userRows[0] ? userRows[0].google_refresh_token : null;
        const sheetId = settingsRows[0] ? settingsRows[0].google_sheet_id : null;

        if (!sheetId) return false;

        let oauth2Client;
        if (refreshToken) {
            oauth2Client = getOAuth2Client(refreshToken);
        } else if (sessionTokens) {
            oauth2Client = getOAuth2Client(null);
            oauth2Client.setCredentials(sessionTokens);
        } else {
            return false;
        }

        const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

        const [expenses] = await db.execute(
            `SELECT id, date_spent, category, amount, description, (receipt_data IS NOT NULL) AS has_receipt FROM expenses WHERE user_id = ? ORDER BY date_spent ASC`,
            [userId]
        );

        if (expenses.length === 0) return true;

        const baseUrl = process.env.APP_URL || 'https://cashwisely.onrender.com';

        let existingRows = [];
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: 'Sheet1!A:E',
            });
            existingRows = response.data.values || [];
        } catch (readErr) {
            console.warn('[Google Sheets] Could not read sheet values, appending rows.');
        }

        const rowsToAppend = [];

        for (const exp of expenses) {
            const dateSpent = exp.date_spent ? new Date(exp.date_spent).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            const category = exp.category || 'Uncategorized';
            const amount = Number(exp.amount).toFixed(2);
            const description = exp.description || 'N/A';
            const fullImageUrl = exp.has_receipt 
                ? `${baseUrl}/expenses/receipt/${exp.id}` 
                : 'No Receipt';

            const isDuplicate = existingRows.some(row => {
                const [rDate, rCat, rAmt] = row;
                return rDate === dateSpent && rCat === category && rAmt === amount;
            });

            if (!isDuplicate) {
                rowsToAppend.push([dateSpent, category, amount, description, fullImageUrl]);
            }
        }

        if (rowsToAppend.length > 0) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: 'Sheet1!A:E',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: rowsToAppend }
            });
        }

        return true;
    } catch (error) {
        console.error('[Google Sheets Sync Error]:', error.message);
        return false;
    }
};

exports.appendExpenseToSheet = async (userId, expenseData, sessionTokens = null) => {
    return exports.syncAllExpensesToSheet(userId, sessionTokens);
};