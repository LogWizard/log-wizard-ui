import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set default data
const defaultData = {
    "Listening Port": 3005,
    "Listening Path": path.join(__dirname, '../messages'),
    "Cors Server Port": 3006
};

export class ConfigManager {
    constructor(filename) {
        if (typeof filename !== 'string') {
            throw new Error('Invalid Filename type');
        }
        this.filename = filename;
        // Create config file if doesn't exist
        if (!fs.existsSync(this.filename)) {
            fs.writeFileSync(this.filename, JSON.stringify(defaultData, null, 2));
        }
    }

    read() {
        if (!fs.existsSync(this.filename)) {
            throw new Error(`File ${this.filename} does not exist`);
        }

        const rawData = fs.readFileSync(this.filename);
        try {
            if (rawData == '{}') {
                fs.writeFileSync(this.filename, JSON.stringify(defaultData, null, 2));
            }
            return JSON.parse(rawData);
        } catch (error) {
            fs.writeFileSync(this.filename, JSON.stringify(defaultData, null, 2));
            throw new Error(`Incorrect Data Format in ${this.filename} file`);
        }
    }

    write(data) {
        if (typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Invalid Data Type');
        }
        const jsonData = JSON.stringify(data, null, 2);
        fs.writeFileSync(this.filename, jsonData);
    }
}
