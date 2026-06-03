// Lightweight timestamped logger (ESM, no external dependencies).
// Every line is prefixed with [YYYY-MM-DD HH:MM:SS] in local time.
// info/warn -> stdout, error -> stderr. API mirrors console.* signatures.

const pad = (value) => String(value).padStart(2, '0');

const timestamp = () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    return `[${date} ${time}]`;
};

export const logInfo = (...args) => {
    process.stdout.write(`${timestamp()} `);
    console.log(...args);
};

export const logWarn = (...args) => {
    process.stdout.write(`${timestamp()} `);
    console.warn(...args);
};

export const logError = (...args) => {
    process.stderr.write(`${timestamp()} `);
    console.error(...args);
};

export default { logInfo, logWarn, logError };
