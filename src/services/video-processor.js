import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Convert video file to Telegram Video Note format (Round Video)
 * - Crops to square (center)
 * - Resizes to max 640x640
 * - Encodes to H.264/AAC
 * - Limits duration to 60s
 * @param {string} inputPath - Absolute path to input file
 * @param {string} outputPath - Absolute path to output file
 * @returns {Promise<string>} - Path to processed file
 */
export function convertVideoToNote(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-vf', 'crop=min(iw\\,ih):min(iw\\,ih),scale=640:640:force_original_aspect_ratio=decrease', // Square Crop + Resize
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '28', // Good balance for file size
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                '-pix_fmt', 'yuv420p', // Ensure broader compatibility
                '-t', '60' // Limit to 1 min (Telegram limit)
            ])
            .save(outputPath)
            .on('end', () => {
                console.log('✅ Video Note processed:', outputPath);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('❌ Video Note processing error:', err);
                reject(err);
            });
    });
}

/**
 * Convert audio file to Telegram Voice Message format (OGG Opus)
 * @param {string} inputPath 
 * @param {string} outputPath 
 */
export function convertAudioToVoice(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-c:a', 'libopus',
                '-b:a', '32k', // Optimized for voice
                '-vbr', 'on',
                '-application', 'voip'
            ])
            .save(outputPath)
            .on('end', () => {
                console.log('✅ Voice Note processed:', outputPath);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('❌ Voice Note processing error:', err);
                reject(err);
            });
    });
}
