import { getPool } from './db.js';

/**
 * 🌿 Stats Service (DB Version ⚡)
 * Aggregates chat stats from MariaDB.
 */
export class StatsService {
    constructor(msgPath) {
        // msgPath deprecated in DB version but kept for signature compatibility
    }

    /**
     * Generate stats for the last N days
     * @param {number} days 
     */
    async generateStats(days = 7) {
        const pool = getPool();
        if (!pool) throw new Error('DB Not Ready');

        const stats = {
            totalMessages: 0,
            messagesByDay: [],
            topUsers: [],
            topCommands: [],
            wordCloud: [],
            msgTypes: {
                text: 0, photo: 0, sticker: 0, voice: 0, video: 0, other: 0
            }
        };

        try {
            // 1. Total Messages & Types Breakdown
            const [typeRows] = await pool.query(`
                SELECT type, COUNT(*) as count 
                FROM messages 
                WHERE date >= NOW() - INTERVAL ? DAY
                GROUP BY type
            `, [days]);

            typeRows.forEach(row => {
                stats.totalMessages += row.count;
                if (stats.msgTypes[row.type] !== undefined) {
                    stats.msgTypes[row.type] = row.count;
                } else {
                    stats.msgTypes.other += row.count;
                }
            });

            // 2. Messages by Day
            const [dayRows] = await pool.query(`
                SELECT DATE(date) as day, COUNT(*) as count 
                FROM messages 
                WHERE date >= NOW() - INTERVAL ? DAY
                GROUP BY day 
                ORDER BY day ASC
            `, [days]);

            stats.messagesByDay = dayRows.map(row => ({
                date: new Date(row.day).toLocaleDateString('uk-UA'),
                count: row.count
            }));

            // 3. Top Users (Join with users table)
            const [userRows] = await pool.query(`
                SELECT u.first_name, u.username, COUNT(m.unique_id) as count 
                FROM messages m
                LEFT JOIN users u ON m.from_id = u.id
                WHERE m.date >= NOW() - INTERVAL ? DAY AND m.from_id IS NOT NULL
                GROUP BY m.from_id
                ORDER BY count DESC
                LIMIT 10
            `, [days]);

            stats.topUsers = userRows.map(row => ({
                name: row.first_name || row.username || 'Unknown',
                count: row.count
            }));

            // 4. Top Commands
            const [cmdRows] = await pool.query(`
                SELECT text, COUNT(*) as count
                FROM messages
                WHERE date >= NOW() - INTERVAL ? DAY
                  AND type = 'text'
                  AND text LIKE '/%'
                GROUP BY text
                ORDER BY count DESC
                LIMIT 5
            `, [days]);

            // Clean up command args (/start@bot -> /start)
            const cmdMap = {};
            cmdRows.forEach(row => {
                const cmd = row.text.split(' ')[0].split('@')[0];
                cmdMap[cmd] = (cmdMap[cmd] || 0) + row.count;
            });
            stats.topCommands = Object.entries(cmdMap)
                .map(([cmd, count]) => ({ cmd, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            // 5. Word Cloud (Lite: Fetch last 1000 text messages to avoid heavy DB load)
            // SQL is bad at tokenizing, so we fetch sample texts and process in Node
            const [textRows] = await pool.query(`
                SELECT text FROM messages 
                WHERE date >= NOW() - INTERVAL ? DAY AND type = 'text'
                ORDER BY RAND() LIMIT 1000
            `, [days]);

            const wordCloud = {};
            textRows.forEach(row => {
                if (!row.text) return;
                const words = row.text.toLowerCase()
                    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
                    .split(/\s+/);

                for (const word of words) {
                    if (word.length > 3) {
                        wordCloud[word] = (wordCloud[word] || 0) + 1;
                    }
                }
            });

            stats.wordCloud = Object.entries(wordCloud)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 20)
                .map(([text, weight]) => ({ text, weight }));

        } catch (e) {
            console.error('Stats Generation Error:', e);
        }

        return stats;
    }

    // processMessage not utilized in SQL version
    processMessage(msg, globalStats, dayStats) { }
}
