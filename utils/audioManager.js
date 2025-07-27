const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const YT_DLP_PATH = path.join(__dirname, '..', 'bin', 'yt-dlp');
const FFMPEG_PATH = path.join(__dirname, '..', 'bin', 'ffmpeg', 'ffmpeg');

async function getAudioInfo(url) {
    try {
        const { stdout } = await execFileAsync(YT_DLP_PATH, ['-j', '--no-playlist', url]);
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
        const stderr = err.stderr ? `\nDetails: ${err.stderr.toString()}` : '';
        throw new Error('Error retrieving audio information: ' + err.message + stderr);
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
        // Download MP3 audio with yt-dlp
        await execFileAsync(YT_DLP_PATH, [
            '-f', 'bestaudio[ext=m4a]/best',
            '--audio-format', 'mp3',
            '-o', mp3Path,
            url
        ]);
    } catch (err) {
        throw new Error('Failed to download audio: ' + err.message);
    }

    try {
        // Convert MP3 to OGG with FFmpeg
        const ffmpegArgs = ['-i', mp3Path, '-c:a', 'libvorbis', oggPath];
        if (audioType === 'mono') ffmpegArgs.splice(2, 0, '-ac', '1');

        await execFileAsync(FFMPEG_PATH, ffmpegArgs);
    } catch (err) {
        throw new Error('Failed to convert audio to OGG: ' + err.message);
    }

    if (!fs.existsSync(oggPath)) {
        throw new Error('OGG file not created.');
    }

    return oggPath;
}

module.exports = {
    getAudioInfo,
    downloadAndConvertAudio
};
