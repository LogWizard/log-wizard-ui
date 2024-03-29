// Підключаємо необхідні модулі
import fs from 'fs';
import fsp from 'fs/promises';
import https from 'https';
import cors_proxy from 'cors-anywhere';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import { ConfigManager } from './config-manager.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDirectory = path.resolve(__dirname, '..');
const configManager = new ConfigManager(path.join(appDirectory, 'config.json'));

const options = {
    key: fs.readFileSync('src/privatekey.pem'),
    cert: fs.readFileSync('src/certificate.pem')
};

const app = express();
const server = https.createServer(options, app);

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
let logStr = "http";
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
const getIPv4FromIPV6 = (ipAddress) => {
    const ipv6Pattern = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
    const match = ipAddress.match(ipv6Pattern);

    if (match) {
        return match[1]; // Повертаємо частину адреси після "::ffff:"
    }

    return ipAddress; // Якщо адреса не відповідає формату, повертаємо її без змін
};
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
                if (directories) {
                    response.groups = directories;
                }
            })
            .catch((error) => console.error('getSettingsApi: ' + error));

        console.log(`Received ${getOSFromUA(req.headers['user-agent'])} request for ${logStr}${req.headers.host}${req.url} POST`);

        res.status(200).send(response);
    });
    app.post('/api/v1/setSettings', async (req, res) => {
        const data = req.body;
        const selectedDate = formatDate(data.Date) ? formatDate(data.Date) : new Date().toLocaleDateString('uk-UA');
        const ipAddress = getIPv4FromIPV6(req.header('x-forwarded-for') || req.socket.remoteAddress);
        console.log(`Received ${getOSFromUA(req.headers['user-agent'])} request for ${logStr}${req.headers.host}${req.url} || ${ipAddress} POST\nbody:\n${JSON.stringify(data, null, 2)}`);
        writeConfigPrams(data);
        if (data['Listening Path']) {
            folderPath = path.join(data['Listening Path'], selectedDate);
        }

        if (data.group) {
            if (data.group !== 'allPrivate') {
                folderPath = path.join(folderPath, data.group);
            }
        }
        res.status(200).send({ success: true });
    });
    /* Api Settings */

    /* Цей роутер відповідає за get запитів /message */
    app.get('/messages', async (req, res) => {
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const sinceParam = Number.parseInt(urlObj.searchParams.get('since'));
            const date = urlObj.searchParams.get('date');
            const group = urlObj.searchParams.get('group');
            const ipAddress = getIPv4FromIPV6(req.header('x-forwarded-for') || req.socket.remoteAddress);
            console.log(`Received ${getOSFromUA(req.headers['user-agent'])} request for ${logStr}${req.headers.host}${req.url} || ${ipAddress} GET`);
            // console.log(req.socket.remoteAddress);
            folderPath = path.join(MSG_PATH, date);
            if (group) {
                if (group !== 'allPrivate') {
                    folderPath = path.join(folderPath, group
                    );
                }
            }
            // console.log(folderPath);
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
                    let message = JSON.parse(data);
                    message = await urlReplaser(message);
                    if (sinceParam && message.message_id <= sinceParam) {
                        continue;
                    }
                    const chatMessage = {
                        user: message.from?.first_name,
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

    /* from use https server */
    server.listen(port, () => {
        logStr = 'https://';
        console.log(`Express server started on port ${port}`);
    });
    /* from use https server */

    /* from use http server */
    // app.listen(port, () => {
    //     logStr = 'http://';
    //     console.log(`Express server started on port ${port}`);
    // });
    /* from use http server */

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
        if (fs.existsSync(path)) {
            const entries = await fsp.readdir(path, { withFileTypes: true });
            const directories = entries.filter((entry) => entry.isDirectory());
            return directories.map((directory) => directory.name);
        }
    }
    async function urlReplaser(obj) {
        const regex = /"url_.+?"/;
        const match = JSON.stringify(obj).match(regex);
        if (match) {
            const file_id = await findFileId(obj);
            const urlKey = match[0].replaceAll('"', '');
            const url = obj[urlKey];
            const botToken = await getBotTokenFromLink(url);
            const newUrl = await getFileUrl(botToken, file_id);
            const newObj = JSON.parse(JSON.stringify(obj).replace(JSON.stringify(obj[urlKey]), `"${newUrl}"`));
            return newObj;
        } else {
            return obj;
        }
    }
    async function getFileUrl(token, fileId) {
        const response = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
        const json = await response.json();
        if (json.ok && json.result && json.result.file_path) {
            const fileUrl = `https://api.telegram.org/file/bot${token}/${json.result.file_path}`;
            return fileUrl;
        } else {
            throw new Error('Failed to get file URL');
        }
    }
    async function getBotTokenFromLink(link) {
        if (link) {
            const [firstPart, secondPart] = link.split('/bot');
            return secondPart.substring(0, secondPart.indexOf('/'));
        }
    }
    async function findFileId(obj) {
        let result = { id: undefined, size: 0 };
        const recursiveFinding = (obj) => {
            if (typeof obj === "object" && obj != null) {
                if (Object.prototype.hasOwnProperty.call(obj, "file_id") && typeof obj["file_id"] !== "undefined") {
                    if (Object.prototype.hasOwnProperty.call(obj, "file_size")) {
                        if (obj.file_size > result.size) {
                            result.id = obj.file_id;
                            result.size = obj.file_size;
                        }
                    } else {
                        result.id = obj.file_id;
                    }
                } else {
                    for (let key in obj) {
                        recursiveFinding(obj[key]);
                    }
                }
            }
        };
        recursiveFinding(obj);
        return result.id;
    }


    function getOSFromUA(userAgent) {
        if (/Windows/.test(userAgent)) {
            return 'Windows';
        }

        if (/Mac OS/.test(userAgent)) {
            return 'macOS';
        }

        if (/Linux/.test(userAgent)) {
            return 'Linux';
        }

        // if no match
        return null;
    }
}