const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Auto-verify and create missing table structure on boot
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                google_refresh_token VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL UNIQUE,
                monthly_income DECIMAL(10, 2) DEFAULT 0.00,
                savings_goal_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
                target_savings_percentage DECIMAL(5, 2) DEFAULT 0.00,
                target_savings_amount DECIMAL(10, 2) DEFAULT 0.00,
                savings_goal_amount DECIMAL(10, 2) DEFAULT NULL,
                savings_goal_date DATE DEFAULT NULL,
                google_sheet_id VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Migrate pre-existing installs that already had a `settings` table
        // before these columns existed (CREATE TABLE IF NOT EXISTS is a no-op
        // on tables that already exist, so add anything that's missing).
        const newSettingsColumns = [
            { name: 'savings_goal_type', def: "VARCHAR(20) NOT NULL DEFAULT 'percentage'" },
            { name: 'target_savings_amount', def: 'DECIMAL(10, 2) DEFAULT 0.00' },
            { name: 'savings_goal_amount', def: 'DECIMAL(10, 2) DEFAULT NULL' },
            { name: 'savings_goal_date', def: 'DATE DEFAULT NULL' }
        ];
        for (const col of newSettingsColumns) {
            try {
                await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
            } catch (err) {
                // Older MySQL/MariaDB versions don't support "ADD COLUMN IF NOT EXISTS";
                // a duplicate-column error there just means it's already present.
                if (err.code !== 'ER_DUP_FIELDNAME') {
                    console.error(`Could not ensure column settings.${col.name}:`, err.message);
                }
            }
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS expenses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                category VARCHAR(100) NOT NULL,
                description VARCHAR(255) DEFAULT NULL,
                date_spent DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_expenses_user_id (user_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS deposits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                source VARCHAR(255) DEFAULT NULL,
                date_added DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_deposits_user_id (user_id)
            )
        `);
    } catch (err) {
        console.error('Database initialization error:', err);
    }
})();

module.exports = pool;