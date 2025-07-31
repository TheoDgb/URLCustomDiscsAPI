const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { createWriteStream } = require('fs');
const lzma = require('lzma-native');
const tar = require('tar');

const BIN_DIR = path.join(__dirname, '../bin');
const YT_DLP_PATH = path.join(BIN_DIR, 'yt-dlp');
const FFMPEG_ARCHIVE = path.join(BIN_DIR, 'ffmpeg.tar.xz');
const FFMPEG_DIR = path.join(BIN_DIR, 'ffmpeg');

function downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
        const file = createWriteStream(destination);

        const handleRequest = (urlToGet) => {
            https.get(urlToGet, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Redirection
                    const redirectUrl = response.headers.location;
                    if (!redirectUrl) return reject(new Error('Redirection without location header'));
                    handleRequest(redirectUrl); // follow redirect
                    return;
                }

                if (response.statusCode !== 200) {
                    return reject(new Error(`Failed to download ${urlToGet} (status ${response.statusCode})`));
                }

                response.pipe(file);
                file.on('finish', () => file.close(resolve));
            }).on('error', (err) => {
                fs.unlinkSync(destination);
                reject(err);
            });
        };

        handleRequest(url);
    });
}

function fetchLatestYtDlpVersion() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/yt-dlp/yt-dlp/releases/latest',
            headers: {
                'User-Agent': 'Node.js',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    if (release && release.tag_name) {
                        resolve(release.tag_name.replace(/^v/, ''));
                    } else {
                        reject(new Error('Invalid yt-dlp GitHub API response: tag_name missing'));
                    }
                } catch (err) {
                    reject(new Error(`Failed to parse yt-dlp GitHub response: ${err.message}`));
                }
            });
        }).on('error', reject);
    });
}

function getLocalYtDlpVersion() {
    try {
        return execSync(`${YT_DLP_PATH} --version`).toString().trim();
    } catch (err) {
        return null; // Not installed or corrupted
    }
}

async function setupYtDlp() {
    const localVersion = getLocalYtDlpVersion();
    const latestVersion = await fetchLatestYtDlpVersion();

    console.log(`[SETUP] Local yt-dlp version: ${localVersion || 'none'}`);
    console.log(`[SETUP] Latest yt-dlp version: ${latestVersion}`);

    if (localVersion !== latestVersion) {
        console.log('[SETUP] Updating yt-dlp...');
        if (fs.existsSync(YT_DLP_PATH)) fs.unlinkSync(YT_DLP_PATH);

        await downloadFile(
            'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
            YT_DLP_PATH
        );
        fs.chmodSync(YT_DLP_PATH, 0o755);
        console.log('[SETUP] yt-dlp updated.');
    } else {
        console.log('[SETUP] yt-dlp is up-to-date.');
    }
}

async function extractTarXz(filePath, destDir) {
    return new Promise((resolve, reject) => {
        const decompressor = lzma.createDecompressor();
        const source = fs.createReadStream(filePath);
        const tarExtract = tar.x({ cwd: destDir });

        source.pipe(decompressor).pipe(tarExtract);

        tarExtract.on('finish', resolve);
        tarExtract.on('error', reject);
        decompressor.on('error', reject);
        source.on('error', reject);
    });
}

async function setupFfmpeg() {
    if (!fs.existsSync(FFMPEG_DIR)) {
        console.log('[SETUP] Downloading ffmpeg...');
        await downloadFile('https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz', FFMPEG_ARCHIVE);
        console.log('[SETUP] Extracting ffmpeg...');
        await extractTarXz(FFMPEG_ARCHIVE, BIN_DIR);
        const extractedDir = fs.readdirSync(BIN_DIR).find(d => d.startsWith('ffmpeg-') && d.endsWith('-static'));
        if (extractedDir) {
            fs.renameSync(path.join(BIN_DIR, extractedDir), FFMPEG_DIR);
            const ffmpegBinaryPath = path.join(FFMPEG_DIR, 'ffmpeg');
            if (fs.existsSync(ffmpegBinaryPath)) {
                fs.chmodSync(ffmpegBinaryPath, 0o755);
            }
        }
        fs.unlinkSync(FFMPEG_ARCHIVE);
    }
}

async function setupBinaries() {
    console.log('[SETUP] Checking binaries...');
    if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR);
    await setupYtDlp();
    await setupFfmpeg();
    console.log('[SETUP] yt-dlp and ffmpeg are ready.');
}

// node scripts/setupBinaries.js
if (require.main === module) {
    (async () => {
        console.log('[SETUP] Checking binaries...');
        if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR);
        await setupYtDlp();
        await setupFfmpeg();
        console.log('[SETUP] yt-dlp and ffmpeg are ready.');
    })();
}

module.exports = {
    setupYtDlp,
    setupBinaries
};
