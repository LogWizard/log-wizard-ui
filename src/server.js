// Підключаємо необхідні модулі
import fs from 'fs';
import fsp from 'fs/promises';
import cors_proxy from 'cors-anywhere';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import { ConfigManager } from './config-manager.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDirectory = path.resolve(__dirname, '..');
const configManager = new ConfigManager(path.join(appDirectory, 'config.json'));
const app = express();

const fileTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.woff2': 'font/woff2'
};
let MSG_PATH = "";
let port = "";
let corsServerPort = "";
const args = process.argv.slice(2);
const params = {};
for (const arg of args) {
    const [key, value] = arg.split('=');
    params[key] = value;
}
let paramsKeys = Object.keys(params);
if (paramsKeys.length !== 0) {
    MSG_PATH = params['path'] ? params['path'] : `D:/OSPanel/domains/kyivstar-nelegal-it-community.com.ua/Node_Home/GitHub/ks_gys_bot/messages`;
    port = params['port'] ? params['port'] : `3003`;
    corsServerPort = params['corsServerPort'] ? params['corsServerPort'] : '3004';
    console.log(params);
} else {
    const paramsOnConfig = await readConfigPrams();
    port = paramsOnConfig['Listening Port'];
    MSG_PATH = paramsOnConfig['Listening Path'];
    corsServerPort = paramsOnConfig['Cors Server Port'];
}
app.use(express.json());
async function readConfigPrams() { return configManager.read(); }

export function createMessageServer() {
    /* Цей сервер необхідний для обходу CORS */
    cors_proxy.createServer({
        originWhitelist: [], // Allow all origins
        requireHeader: ['origin', 'x-requested-with'],
        removeHeaders: ['cookie', 'cookie2']
    }).listen(corsServerPort, function () {
        console.log(`Server CORS Anywhere started on port ${corsServerPort}`);
    });
    /* Цей сервер необхідний для обходу CORS */
    let folderPath = path.join(MSG_PATH, new Date().toLocaleDateString('uk-UA'), '/');

    /* Api Settings */
    app.post('/api/v1/getSettings', async (req, res) => {
        const response = await readConfigPrams();
        await getDirectories(folderPath)
            .then((directories) => {
                response.groups = directories;
                console.log(response);
            })
            .catch((error) => console.error(error));

        console.log(`Received ${req.headers['sec-ch-ua-platform']} request for http://${req.headers.host}${req.url} POST`);

        res.status(200).send(response);
    });
    app.post('/api/v1/setSettings', async (req, res) => {
        const data = req.body;
        const selectedDate = formatDate(data.Date) ? formatDate(data.Date) : new Date().toLocaleDateString('uk-UA');
        console.log(`Received ${req.headers['sec-ch-ua-platform']} request for http://${req.headers.host}${req.url} POST\nbody:\n${JSON.stringify(data, null, 2)}`);
        writeConfigPrams(data);
        folderPath = path.join(req.body['Listening Path'], selectedDate, '/');
        if (data.group) {
            if (data.group !== 'allPrivate') {
                folderPath = path.join(folderPath, data.group, '/');
            }
        }
        res.status(200).send({ success: true });
    });
    /* Api Settings */

    /* Цей роутер відповідає за get запитів /message */
    app.get('/messages', (req, res) => {
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const sinceParam = Number.parseInt(urlObj.searchParams.get('since'));
            const date = urlObj.searchParams.get('date');
            const group = urlObj.searchParams.get('group');
            console.log(`Received ${req.headers['sec-ch-ua-platform']} request for http://${req.headers.host}${req.url} GET`);
            folderPath = path.join(MSG_PATH, date);
            if (group) {
                if (group !== 'allPrivate') {
                    folderPath = path.join(folderPath, group, '/');
                }
            }
            console.log(folderPath);
            fs.accessSync(folderPath, fs.constants.R_OK);
            const messages = [];
            const files = fs.readdirSync(folderPath);
            for (let file of files) {
                const filePath = `${folderPath}/${file}`;
                // check if file has .json extension
                if (path.extname(file) !== '.json') {
                    continue;
                }
                try {
                    const data = fs.readFileSync(filePath);
                    const message = JSON.parse(data);
                    if (sinceParam && message.message_id <= sinceParam) {
                        continue;
                    }
                    const chatMessage = {
                        user: message.from.first_name,
                        text: message.text,
                        time: new Date(message.date * 1000),
                    };
                    // add additional properties to chatMessage
                    const fields = Object.keys(message).filter(
                        (key) => !['from', 'text', 'date'].includes(key)
                    );
                    for (let key of fields) {
                        chatMessage[key] = message[key];
                    }
                    messages.push(chatMessage);
                } catch (error) {
                    console.error(`Error parsing/reading file ${filePath}: ${error}`);
                }
            }
            messages.sort((a, b) => b.time - a.time);
            res.status(200).json(messages);
        } catch (err) {
            console.error(`Error accessing directory: ${err}`);
            res.status(500).json({ message: 'Internal Server Error' });
        }
    });
    /* Цей роутер відповідає за get запитів /message */

    /* Цей роутер відповідає за обробку запиту /chat */
    app.get('/chat', async (req, res) => {
        console.log(__dirname);
        const filePath = path.join(appDirectory, '/public/index.html');
        console.log(filePath);
        try {
            const data = await fs.promises.readFile(filePath);
            res.status(200).send(data.toString());
        } catch (err) {
            res.status(404).send();
        }
    });
    /* Цей роутер відповідає за обробку запиту /chat */

    /* Цей роутер відповідає за обробку всіх інших запитів */
    app.get(/^\/(css|fonts|js)\//i, (req, res) => {
        const filePath = path.join(appDirectory, 'public', req.url);
        const fileExtension = path.extname(filePath);
        const contentType = fileTypes[fileExtension] || 'application/octet-stream';
        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.status(404).send();
                } else { // Server error.
                    res.status(500).send(`Server error: ${err.code}`);
                }
            } else {
                res.status(200).type(contentType).send(content);
            }
        });
    });
    /* Цей роутер відповідає за обробку всіх інших запитів */
    app.listen(port, () => {
        console.log(`Express server started on port ${port}`);
    });
    async function writeConfigPrams(params) {
        const configData = configManager.read();
        Object.assign(configData, params);
        configManager.write(configData);
    }
    function formatDate(date, time = false, tHour = false) {
        let d = new Date(date),
            month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear(),
            hour = '' + d.getHours(),
            minutes = '' + d.getMinutes(),
            seconds = '' + d.getSeconds();
        if (month.length < 2)
            month = '0' + month;

        if (day.length < 2)
            day = '0' + day;

        if (hour.length < 2)
            hour = '0' + hour;

        if (minutes.length < 2)
            minutes = '0' + minutes;

        if (seconds.length < 2)
            seconds = '0' + seconds;
        if (tHour) {
            return `${[hour, minutes].join(':')}`;
        }
        if (time) {
            return `${[day, month, year].join('.')} ${[hour, minutes, seconds].join(':')}`;
        } else {
            return `${[day, month, year].join('.')}`;
        }

    }
    async function getDirectories(path) {
        const entries = await fsp.readdir(path, { withFileTypes: true }); // readdir з параметром з файлами

        const directories = entries.filter((entry) => entry.isDirectory()); // фільтруємо лише папки (directories)

        return directories.map((directory) => directory.name); // повертаємо масив імен папок
    }
}