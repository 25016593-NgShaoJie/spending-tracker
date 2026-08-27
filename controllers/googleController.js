const { google } = require('googleapis');
const db = require('../config/db');

/**
 * Checks if an expense already exists in the sheet; if not, appends it.
 */
exports.appendExpenseToSheet = async (userId, expenseData, sessionTokens = null) => {
    try {
        // 1. Fetch refresh token from 'users' and Sheet ID from 'settings'
        const [userRows] = await db.execute(
            `SELECT google_refresh_token FROM users WHERE id = ?`,
            [userId]
        );
        const [settingsRows] = await db.execute(
            `SELECT google_sheet_id FROM settings WHERE user_id = ?`,
            [userId]
        );

        const refreshToken = userRows[0] ? userRows[0].google_refresh_token : null;
        const sheetId = settingsRows[0] ? settingsRows[0].google_sheet_id : null;

        const activeTokens = refreshToken 
            ? { refresh_token: refreshToken } 
            : (sessionTokens || null);

        if (!sheetId || !activeTokens) {
            console.log(`[Google Sheets] User #${userId} missing Sheet ID or OAuth tokens.`);
            return false;
        }

        // 2. Configure OAuth2 client
        const redirectUri = process.env.NODE_ENV === 'production'
            ? 'https://cashwisely.onrender.com/auth/google/callback'
            : 'http://localhost:4000/auth/google/callback';

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || redirectUri
        );

        oauth2Client.setCredentials(activeTokens);

        const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

        // 3. Prepare target values
        const dateSpent = expenseData.date_spent || expenseData.date || new Date().toISOString().split('T')[0];
        const category = expenseData.category;
        const amount = Number(expenseData.amount).toFixed(2);
        const description = expenseData.description || 'N/A';

        const baseUrl = process.env.APP_URL || 'https://cashwisely.onrender.com';
        const fullImageUrl = expenseData.imageUrl 
            ? (expenseData.imageUrl.startsWith('http') ? expenseData.imageUrl : `${baseUrl}${expenseData.imageUrl}`) 
            : 'No Receipt';

        // 4. Fetch existing rows from Sheet1 to verify duplicate status
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A:E',
        });

        const existingRows = response.data.values || [];

        // Check if an entry with the same Date, Category, Amount, and Description exists
        const isDuplicate = existingRows.some(row => {
            const [rowDate, rowCat, rowAmt, rowDesc] = row;
            return (
                rowDate === dateSpent &&
                rowCat === category &&
                rowAmt === amount &&
                (rowDesc || 'N/A') === description
            );
        });

        if (isDuplicate) {
            console.log(`[Google Sheets] Expense already exists in Sheet for User #${userId}. Skipping append.`);
            return true;
        }

        // 5. Append new row if not found
        const rowValues = [[dateSpent, category, amount, description, fullImageUrl]];

        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'Sheet1!A:E',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: rowValues }
        });

        console.log(`[Google Sheets] New expense synced successfully for User #${userId}!`);
        return true;

    } catch (error) {
        console.error('[Google Sheets] Sync error:', error.message);
        return false;
    }
};