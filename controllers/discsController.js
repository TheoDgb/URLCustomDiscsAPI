const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const fs = require('fs');
const path = require('path');
const generateToken = require('../utils/tokenGenerator');
const copyAndUploadPack = require('../utils/copyAndUploadPack');

const SERVERS_FILE = path.join(__dirname, '../data/servers.json');
const YT_DLP_PATH = path.join(__dirname, '../bin/yt-dlp');
const FFMPEG_PATH = path.join(__dirname, '../bin/ffmpeg/ffmpeg');
const MUSIC_DIR = path.join(__dirname, '..', 'data', 'music');



// Register a Minecraft server
function loadServers() {
    if (!fs.existsSync(SERVERS_FILE)) {
        fs.mkdirSync(path.dirname(SERVERS_FILE), { recursive: true });
        fs.writeFileSync(SERVERS_FILE, JSON.stringify({}, null, 2));
        return {};
    }
    return JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
}

function saveServers(data) {
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(data, null, 2));
}

exports.registerMcServer = async (req, res) => {
    const token = generateToken();
    const servers = loadServers();

    servers[token] = {
        registeredAt: new Date().toISOString()
    };

    saveServers(servers);

    try {
        await copyAndUploadPack(token);
        console.log('[REGISTER] New token generated and pack uploaded:', token);
        const downloadPackUrl = `https://${process.env.R2_PUBLIC_URL}/${token}.zip`;
        res.json({ token, downloadPackUrl });
    } catch (err) {
        console.error('[REGISTER] Failed to upload pack, rolling back token:', err);
        delete servers[token];
        saveServers(servers);
        res.status(500).json({ error: 'Failed to upload pack. Token was not registered.' });
    }
};

function isValidToken(token) {
    if (!fs.existsSync(SERVERS_FILE)) return false;
    const servers = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
    return token in servers;
}



// Add a new audio disc into the server resource pack
async function getAudioInfo(url) {
    // Retrieve JSON information from video/audio
    try {
        const { stdout } = await execFileAsync(YT_DLP_PATH, ['-j', '--no-playlist', url]);
        const info = JSON.parse(stdout);

        // Find the best audio format (bestaudio)
        const audioFormats = info.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
        // Take the best in quality
        const bestAudio = audioFormats.sort((a, b) => b.abr - a.abr)[0];

        return {
            duration: info.duration, // in seconds
            filesize: bestAudio.filesize || bestAudio.filesize_approx || 0 // in bytes, sometimes missing
        };
    } catch (err) {
        throw new Error('Error retrieving audio information: ' + err.message);
    }
}

async function downloadAndConvertAudio(url, discName, audioType) {
    const mp3Path = path.join(MUSIC_DIR, discName + '.mp3');
    const oggPath = path.join(MUSIC_DIR, discName + '.ogg');

    if (!fs.existsSync(path.dirname(mp3Path))) {
        fs.mkdirSync(path.dirname(mp3Path), { recursive: true });
    }

    // Delete old files if they exist
    [mp3Path, oggPath].forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });

    // Download audio in mp3 with yt-dlp
    await execFileAsync(YT_DLP_PATH, [
        '-f', 'bestaudio[ext=m4a]/best',
        '--audio-format', 'mp3',
        '-o', mp3Path,
        url
    ]);

    // Convert to ogg with ffmpeg
    const ffmpegArgs = ['-i', mp3Path, '-c:a', 'libvorbis', oggPath];
    if (audioType === 'mono') ffmpegArgs.splice(2, 0, '-ac', '1'); // insérer après -i mp3Path

    await execFileAsync(FFMPEG_PATH, ffmpegArgs);

    // Delete mp3
    if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);

    return oggPath;
}

exports.createCustomDisc = async (req, res) => {
    const { url, discName, audioType, token } = req.body;

    if (!isValidToken(token)) {
        return res.status(401).json({ error: 'Invalid or missing token.' });
    }

    try {
        const info = await getAudioInfo(url);

        if (!info.duration || info.duration > 300) {
            return res.status(400).json({ error: 'Audio duration exceeds 300 seconds limit.' });
        }
        if (!info.filesize || info.filesize > 10 * 1024 * 1024) {
            return res.status(400).json({ error: 'Audio filesize exceeds 10 MB limit.' });
        }

        const oggPath = await downloadAndConvertAudio(url, discName, audioType);

        // NEXT

        res.json({ success: true, message: 'Disc created successfully.' });
    } catch (err) {
        console.error('[CREATE CUSTOM DISC] Error:', err);
        res.status(500).json({ error: 'Failed to process the audio.' });
    }

    // TODO: add validation, queueing, saving...
};
