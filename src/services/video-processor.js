import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

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
        // 🌿 First, probe the file to check streams
        ffmpeg.ffprobe(inputPath, (probeErr, metadata) => {
            if (probeErr) {
                console.error('❌ FFprobe error:', probeErr.message);
                return reject(new Error(`Cannot analyze file: ${probeErr.message}`));
            }

            // Check for video stream
            const hasVideo = metadata?.streams?.some(s => s.codec_type === 'video');
            const hasAudio = metadata?.streams?.some(s => s.codec_type === 'audio');

            if (!hasVideo) {
                console.error('❌ No video stream found in file. This appears to be audio-only.');
                return reject(new Error('Recording has no video stream. Please record with camera enabled.'));
            }

            console.log(`🎬 Streams detected: video=${hasVideo}, audio=${hasAudio}`);

            // Build FFmpeg command using proper methods (not raw options for filters)
            const command = ffmpeg(inputPath);

            // 🌿 Video filters - using .videoFilters() for proper escaping on Windows
            command.videoFilters([
                {
                    filter: 'crop',
                    options: 'min(iw\\,ih):min(iw\\,ih)'
                },
                {
                    filter: 'scale',
                    options: '640:640:force_original_aspect_ratio=decrease'
                }
            ]);

            // Video codec options
            command.videoCodec('libx264')
                .outputOptions([
                    '-preset', 'fast',
                    '-crf', '28',
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart',
                    '-t', '60'
                ]);

            // 🌿 Audio options - only if audio stream exists
            if (hasAudio) {
                command.audioCodec('aac')
                    .audioBitrate('128k');
            } else {
                console.log('⚠️ No audio stream, encoding video-only');
                command.noAudio();
            }

            // Execute
            command.save(outputPath)
                .on('start', (commandLine) => {
                    // Silent - no spam
                })
                .on('stderr', (stderrLine) => {
                    // Silent - no spam
                })
                .on('end', () => {
                    resolve(outputPath);
                })
                .on('error', (err, stdout, stderr) => {
                    console.error('❌ FFmpeg FAILED:', err.message);
                    reject(err);
                });
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
