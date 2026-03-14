import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 2053;

// 🌿 Функція для вбивства процесу на порту (Windows style)
const killPort = (port) => {
    try {
        const output = execSync(`netstat -ano | findstr :${port}`).toString();
        const lines = output.split('\n');
        for (const line of lines) {
            if (line.includes('LISTENING')) {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0') {
                    console.log(`🧹 [PM2-Runner] Killing zombie on port ${port} (PID: ${pid})...`);
                    execSync(`taskkill /F /PID ${pid}`, { windowsHide: true });
                }
            }
        }
    } catch (e) {
        // Порт чистий або findstr нічого не знайшов
    }
};

console.log('🌿 [PM2-Runner] Starting LogWizard lifecycle...');
killPort(PORT);

try {
    // 🏗️ Спочатку чистимо старі білди
    const assetsDir = path.join(__dirname, 'public', 'assets');
    if (fs.existsSync(assetsDir)) {
        console.log('🧹 [PM2-Runner] Cleaning old assets...');
        fs.rmSync(assetsDir, { recursive: true, force: true });
    }

    // 🏗️ Тепер білдимо фронт
    console.log('🏗️ [PM2-Runner] Building frontend...');
    execSync('npm.cmd run build', { 
        cwd: __dirname, 
        stdio: 'inherit',
        windowsHide: true 
    });
    
    // 🚀 Тепер запускаємо бекенд
    console.log('🚀 [PM2-Runner] Starting backend server...');
    const server = spawn('node', ['index.js'], {
        cwd: __dirname,
        stdio: 'inherit',
        windowsHide: true
    });

    server.on('close', (code) => {
        console.log(`📡 [PM2-Runner] Backend exited with code ${code}`);
        process.exit(code);
    });

    server.on('error', (err) => {
        console.error('❌ [PM2-Runner] Failed to start backend:', err);
        process.exit(1);
    });

    // 🌿 Чистимо хвости при виході раннера
    const cleanup = () => {
        if (server) {
            console.log('🛑 [PM2-Runner] Stopping backend...');
            server.kill('SIGTERM');
            // На вінді SIGTERM іноді не досить, через 1 сек - хард кілл
            setTimeout(() => {
                try { server.kill('SIGKILL'); } catch(e) {}
            }, 1000);
        }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);

} catch (err) {
    console.error('❌ [PM2-Runner] Error during build/startup:', err.message);
    process.exit(1);
}
