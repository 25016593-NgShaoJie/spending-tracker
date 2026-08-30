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

// Safe date parser to prevent UTC shifts
const formatDate = (dateVal) => {
    if (!dateVal) return new Date().toISOString().split('T')[0];
    if (typeof dateVal === 'string') return dateVal.split('T')[0];
    
    // Format local date year-month-day
    const d = new Date(dateVal);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
            `SELECT id, date_spent, category, amount, description FROM expenses WHERE user_id = ? ORDER BY date_spent ASC`,
            [userId]
        );

        if (expenses.length === 0) return true;

        let existingRows = [];
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: 'Sheet1!A:D',
            });
            existingRows = response.data.values || [];
        } catch (readErr) {
            console.warn('[Google Sheets] Could not read sheet values, writing new rows.');
        }

        const rowsToAppend = [];

        for (const exp of expenses) {
            const dateSpent = formatDate(exp.date_spent);
            const category = exp.category || 'Uncategorized';
            const amountNum = Number(exp.amount);
            const amountStr = amountNum.toFixed(2);
            const description = exp.description || 'N/A';

            // Fixed: Robust duplicate check using numerical comparison for amounts
            const isDuplicate = existingRows.some(row => {
                const [rDate, rCat, rAmt] = row;
                if (!rDate || !rCat || !rAmt) return false;
                
                const sheetAmtNum = Number(String(rAmt).replace(/[^0-9.-]+/g, ""));
                return rDate === dateSpent && 
                       rCat.trim().toLowerCase() === category.trim().toLowerCase() && 
                       Math.abs(sheetAmtNum - amountNum) < 0.001;
            });

            if (!isDuplicate) {
                rowsToAppend.push([dateSpent, category, amountStr, description]);
            }
        }

        if (rowsToAppend.length > 0) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: 'Sheet1!A:D',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: rowsToAppend }
            });
        }

        return true;
    } catch (error) {
        console.error('[Google Sheets Sync Error]:', error.response ? error.response.data : error.message);
        return false;
    }
};

/**
 * Appends a single new expense directly to Google Sheets
 */
exports.appendExpenseToSheet = async (userId, expenseData, sessionTokens = null) => {
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

        const dateSpent = formatDate(expenseData.date_spent);
        const category = expenseData.category || 'Uncategorized';
        const amountStr = Number(expenseData.amount).toFixed(2);
        const description = expenseData.description || 'N/A';

        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'Sheet1!A:D',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[dateSpent, category, amountStr, description]]
            }
        });

        return true;
    } catch (error) {
        console.error('[Google Sheets Single Append Error]:', error.response ? error.response.data : error.message);
        // Fall back to full deduplicated sync on error
        return exports.syncAllExpensesToSheet(userId, sessionTokens);
    }
};