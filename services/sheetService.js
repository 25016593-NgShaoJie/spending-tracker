const { google } = require('googleapis');
const db = require('../config/db');

/**
 * Appends an expense row to a user's Google Sheet
 */
exports.appendExpenseToSheet = async (userId, expenseData) => {
    try {
        // Fetch user's stored refresh token and Sheet ID
        const [rows] = await db.execute(
            `SELECT google_refresh_token, google_sheet_id FROM users WHERE id = ?`,
            [userId]
        );

        const user = rows[0];

        // Skip silently if the user hasn't set up Google Sheets
        if (!user || !user.google_refresh_token || !user.google_sheet_id) {
            console.log(`[Google Sheets] User #${userId} has not connected Google Sheets.`);
            return false;
        }

        // Configure OAuth2 client
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({ 
            refresh_token: user.google_refresh_token 
        });

        const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

        const baseUrl = process.env.APP_URL || 'http://localhost:4000';
        const fullImageUrl = expenseData.imageUrl 
            ? (expenseData.imageUrl.startsWith('http') ? expenseData.imageUrl : `${baseUrl}${expenseData.imageUrl}`) 
            : 'No Receipt';

        const rowValues = [[
            expenseData.date_spent,
            expenseData.category,
            Number(expenseData.amount).toFixed(2),
            expenseData.description || 'N/A',
            fullImageUrl
        ]];

        // Append row to Sheet1 (Columns A through E)
        await sheets.spreadsheets.values.append({
            spreadsheetId: user.google_sheet_id,
            range: 'Sheet1!A:E',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: rowValues }
        });

        console.log(`[Google Sheets] Expense synced successfully for User #${userId}!`);
        return true;

    } catch (error) {
        console.error('[Google Sheets] Sync error:', error.message);
        return false;
    }
};