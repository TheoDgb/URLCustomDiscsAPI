const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const { setupYtDlp } = require('../scripts/setupBinaries');

const execFileAsync = promisify(execFile);

const YT_DLP_PATH = path.join(__dirname, '..', 'bin', 'yt-dlp');
const FFMPEG_PATH = path.join(__dirname, '..', 'bin', 'ffmpeg', 'ffmpeg');
const FFPROBE_PATH = path.join(__dirname, '..', 'bin', 'ffmpeg', 'ffprobe');

async function tryGetAudioInfo(url) {
    try {
        const {stdout} = await execFileAsync(YT_DLP_PATH, [
            '--cookies', '/root/www.youtube.com_cookies.txt',
            '-j', '--no-playlist', url
        ]);
        const info = JSON.parse(stdout);

        // Find the best audio format
        const audioFormats = info.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');

        // Take the best in quality
        const bestAudio = audioFormats.sort((a, b) => b.abr - a.abr)[0];

        if (!bestAudio.filesize && !bestAudio.filesize_approx) {
            console.warn('[AUDIO INFO WARNING] No filesize available for', url);
        }

        return {
            duration: info.duration,
            filesize: bestAudio.filesize || bestAudio.filesize_approx || null // in bytes, sometimes missing
        };
    } catch (err) {
        if (err.stderr && err.stderr.toString().includes('Sign in to confirm you’re not a bot')) {
            const customErr = new Error('YouTube cookie expired, please notify the plugin owner via Discord: https://discord.gg/tdWztKWzcm');
            customErr.code = 419;
            throw customErr;
        }
        throw err;
    }
}

async function getAudioInfo(url) {
    try {
        return await tryGetAudioInfo(url);
    } catch (err) {
        if (err.code === 419) throw err; // YouTube cookie expired
        console.warn('[AUDIO INFO WARNING] Initial yt-dlp call failed. Updating yt-dlp and retrying...');
        try {
            await setupYtDlp();
            return await tryGetAudioInfo(url);
        } catch (retryErr) {
            const stderr = retryErr.stderr ? `\nDetails: ${retryErr.stderr.toString()}` : '';
            throw new Error('Error retrieving audio information after yt-dlp update: ' + retryErr.message + stderr);
        }
    }
}

async function tryDownloadAudio(url, outputPath) {
    // Download MP3 audio with yt-dlp
    try {
        await execFileAsync(YT_DLP_PATH, [
            '--cookies', '/root/www.youtube.com_cookies.txt',
            '-f', 'bestaudio[ext=m4a]/best',
            '--audio-format', 'mp3',
            '-o', outputPath,
            url
        ]);
    } catch (err) {
        if (err.stderr && err.stderr.toString().includes('Sign in to confirm you’re not a bot')) {
            const customErr = new Error('YouTube cookie expired, please notify the plugin owner via Discord: https://discord.gg/tdWztKWzcm');
            customErr.code = 419;
            throw customErr;
        }
        throw err;
    }
}

async function downloadAndConvertAudio(url, discName, audioType = 'mono', tempAudioDir) {
    if (!fs.existsSync(tempAudioDir)) {
        fs.mkdirSync(tempAudioDir, { recursive: true });
    }
    const mp3Path = path.join(tempAudioDir, `${discName}.mp3`);
    const oggPath = path.join(tempAudioDir, `${discName}.ogg`);

    // Pre-cleaning
    if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
    if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath);

    try {
        await tryDownloadAudio(url, mp3Path);
    } catch (err) {
        if (err.code === 419) throw err; // YouTube cookie expired
        await setupYtDlp();
        try {
            await tryDownloadAudio(url, mp3Path);
        } catch (retryErr) {
            throw new Error('Failed to download audio after yt-dlp update: ' + retryErr.message + ' Ensure the URL is valid and clean.');
        }
    }

    try {
        const ffmpegArgs = ['-i', mp3Path, '-vn', '-c:a', 'libvorbis', oggPath];
        if (audioType === 'mono') ffmpegArgs.splice(3, 0, '-ac', '1');

        // Convert MP3 to OGG with FFmpeg
        await execFileAsync(FFMPEG_PATH, ffmpegArgs);
    } catch (err) {
        throw new Error('Failed to convert audio to OGG: ' + err.message);
    }

    if (!fs.existsSync(oggPath)) {
        throw new Error('OGG file not created.');
    }

    return oggPath;
}

async function getMp3AudioInfo(mp3FilePath) {
    if (!fs.existsSync(mp3FilePath)) {
        throw new Error('File not found: ' + mp3FilePath);
    }

    try {
        const { stdout } = await execFileAsync(FFPROBE_PATH, [
            '-v', 'error',
            '-show_entries', 'format=duration,size,bit_rate',
            '-of', 'json',
            mp3FilePath
        ]);
        const probeResult = JSON.parse(stdout);
        const format = probeResult.format || {};
        const duration = parseFloat(format.duration) || 0;
        const size = parseInt(format.size, 10) || 0;
        const bitRate = parseInt(format.bit_rate, 10) || 0;

        return {
            duration,
            filesize: size,
            bitrate: bitRate
        };
    } catch (err) {
        throw new Error('Error running ffprobe: ' + err.message);
    }
}

async function convertMp3Audio(mp3FilePath, discName, audioType = 'mono', tempAudioDir) {
    if (!fs.existsSync(mp3FilePath)) {
        throw new Error('MP3 file not found: ' + mp3FilePath);
    }

    if (!fs.existsSync(tempAudioDir)) {
        fs.mkdirSync(tempAudioDir, { recursive: true });
    }

    const oggPath = path.join(tempAudioDir, `${discName}.ogg`);

    // Pre-cleaning
    if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath);

    try {
        // Convert MP3 to OGG with FFmpeg
        const ffmpegArgs = ['-i', mp3FilePath, '-vn', '-c:a', 'libvorbis', oggPath];
        if (audioType === 'mono') ffmpegArgs.splice(3, 0, '-ac', '1');

        await execFileAsync(FFMPEG_PATH, ffmpegArgs);
    } catch (err) {
        throw new Error('Failed to convert MP3 to OGG: ' + err.message);
    }

    if (!fs.existsSync(oggPath)) {
        throw new Error('OGG file not created.');
    }

    return oggPath;
}

module.exports = {
    getAudioInfo,
    downloadAndConvertAudio,
    getMp3AudioInfo,
    convertMp3Audio
};
