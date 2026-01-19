import mysql from 'mysql2/promise';

// Config from user's env (reused from previous scripts)
const dbConfig = {
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'Pasha0407!',
    database: 'log_wizard'
};

async function archiveOldMessages() {
    console.log('🧹 Починаю велике прибирання (Archiving)... 💊');
    const pool = mysql.createPool(dbConfig);
    const CUTOFF_DATE = '2026-01-19 04:00:00';

    try {
        // 1. Check connection
        await pool.query('SELECT 1');
        console.log('🔌 База на зв\'язку.');

        // 2. Clear old archive
        console.log('🗑️ Очищаю таблицю messages_archive (TRUNCATE)...');
        await pool.query('TRUNCATE TABLE messages_archive');
        console.log('✅ Архів чистенький.');

        // 3. Move messages to archive
        console.log(`📦 Переношу повідомлення до ${CUTOFF_DATE} в архів...`);
        const [moveRes] = await pool.query(`
            INSERT INTO messages_archive
            SELECT * FROM messages
            WHERE date < ?
        `, [CUTOFF_DATE]);
        console.log(`📦 Заархівовано ${moveRes.affectedRows} повідомлень.`);

        // 4. Delete from main table
        console.log('🔥 Видаляю старі повідомлення з основної таблиці...');
        const [delRes] = await pool.query(`
            DELETE FROM messages
            WHERE date < ?
        `, [CUTOFF_DATE]);
        console.log(`🔥 Видалено ${delRes.affectedRows} повідомлень з main.`);

        // 5. Repair Chat Timestamps
        // Fix sorting: Set chat.last_updated to the latest message date in the MAIN table.
        // If no messages in main, keep as is (or maybe look at archive? User wants "Actual" info).
        console.log('⏱️ Фіксу часові мітки чатів (щоб порядок був правильний)...');

        // Complex update: Update chats.last_updated to MAX(date) from messages
        await pool.query(`
            UPDATE chats c
            JOIN (
                SELECT chat_id, MAX(date) as max_date
                FROM messages
                GROUP BY chat_id
            ) m ON c.id = m.chat_id
            SET c.last_updated = m.max_date
        `);

        console.log('✅ Чати відсортовані по свіжому.');

    } catch (e) {
        console.error('❌ Бляха, помилка:', e);
    } finally {
        await pool.end();
        console.log('🏁 Готово! Можна видихнути 💨');
    }
}

archiveOldMessages();
