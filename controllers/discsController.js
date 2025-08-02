const fs = require('fs');
const path = require('path');

const generateToken = require('../utils/tokenGenerator');
const serverRegistry = require('../utils/serverRegistry');
const isRateLimited = require('../utils/rateLimiter');
const { activeTokens, MAX_ACTIVE_TOKENS } = require('../utils/activeTokens');
const enqueue = require('../utils/taskQueue');
const copyAndUploadPack = require('../utils/copyAndUploadPack');
const audioManager = require('../utils/audioManager');
const packManager = require('../utils/packManager');
const checkR2Quota = require('../utils/checkR2Quota');
const r2Utils = require('../utils/r2Utils');

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const MAX_AUDIO_FILE_SIZE = 12 * 1024 * 1024; // 12 MB
const MAX_PACK_SIZE = 80 * 1024 * 1024; // 80 MB

// Register a Minecraft server
exports.registerMcServer = async (req, res) => {
    const token = generateToken();
    serverRegistry.registerToken(token);

    try {
        await copyAndUploadPack(token);
        const downloadPackUrl = `https://${R2_PUBLIC_URL}/${token}.zip`;
        return res.status(200).json({
            success: true,
            message: 'Server registered successfully. Pack uploaded.',
            token,
            downloadPackUrl
        });
    } catch (err) {
        serverRegistry.unregisterToken(token);
        return res.status(500).json({
            success: false,
            error: 'Failed to upload pack. Token was not registered: ' + err.message
        });
    }
};

// Add a new audio disc into the server resource pack
exports.createCustomDisc = async (req, res) => {
    const { token } = req.body;

    if (!serverRegistry.isValidToken(token)) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or missing token. A new token will be assigned to your Minecraft server upon your next custom disc creation request.'
        });
    }

    serverRegistry.updateLastActivity(token);

    // Prevent request spamming: apply rate limiting per token (max 6 requests per minute)
    if (isRateLimited(token)) {
        return res.status(429).json({
            success: false,
            error: 'Too many requests. Limit reached. Try again in a moment.'
        });
    }

    // Check global concurrency limit (max 2 active tokens)
    if (!activeTokens.has(token) && activeTokens.size >= MAX_ACTIVE_TOKENS) {
        return res.status(503).json({
            success: false,
            error: 'API is busy. Too many concurrent requests. Please try again shortly.'
        });
    }

    // Manage a request queue by token
    enqueue(token, () => handleCreateCustomDisc(req.body, res)).catch(err => {
        console.error('[QUEUE ERROR]', err);
        res.status(500).json({
            success: false,
            error: 'Internal queue error.'
        });
    });
};

async function handleCreateCustomDisc(body, res) {
    const { url, discName, audioType, customModelData, token } = body;

    try {
        let info;
        try {
            info = await audioManager.getAudioInfo(url);
        } catch (err) {
            console.error('[AUDIO INFO ERROR]', err);

            if (err.code === 419) {
                return res.status(419).json({
                    success: false,
                    error: err.message
                });
            }

            return res.status(400).json({
                success: false,
                error: 'Failed to retrieve audio information: ' + err.message
            });
        }

        if (!info.duration || info.duration > 300) {
            return res.status(409).json({
                success: false,
                error: !info.duration
                    ? 'Unable to determine audio duration.'
                    : 'Audio duration exceeds 5 minutes limit.'
            });
        }

        const estimatedSize = info.filesize || info.filesize_approx;
        if (!estimatedSize || estimatedSize > MAX_AUDIO_FILE_SIZE) {
            return res.status(409).json({
                success: false,
                error: !estimatedSize
                    ? 'Unable to determine audio file size.'
                    : 'Audio file exceeds 12 MB size limit.'
            });
        }

        const tempDir = path.join(__dirname, '..', 'data', 'temp', token);
        const tempAudioDir = path.join(tempDir, 'audios');
        const zipPath = path.join(tempDir, `${token}.zip`);
        try {
            let oggPath;
            try {
                oggPath = await audioManager.downloadAndConvertAudio(url, discName, audioType, tempAudioDir);
            } catch (err) {
                console.error('[AUDIO ERROR]', err);

                if (err.code === 419) {
                    return res.status(419).json({
                        success: false,
                        error: err.message
                    });
                }

                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }

            try {
                await packManager.downloadPack(token, zipPath);
            } catch (err) {
                console.error('[DOWNLOAD PACK ERROR]', err);
                return res.status(400).json({
                    success: false,
                    error: 'Failed to download resource pack: ' + err.message
                });
            }

            let oldPackSize;
            try {
                const stats = await fs.promises.stat(zipPath);
                oldPackSize = stats.size;
            } catch (err) {
                console.error('[STAT ZIP ERROR]', err);
                return res.status(400).json({
                    success: false,
                    error: 'Cannot access downloaded zip: ' + err.message
                });
            }

            const unpackedDir = path.join(tempDir, 'unpacked');
            try {
                await packManager.unzipPack(zipPath, unpackedDir);
            } catch (err) {
                console.error('[UNZIP ERROR]', err);
                return res.status(400).json({
                    success: false,
                    error: 'Failed to unzip the resource pack: ' + err.message
                });
            }

            const audioDir = path.join(unpackedDir, 'assets', 'minecraft', 'sounds', 'custom');
            const audioFiles = fs.readdirSync(audioDir).filter(f => f.endsWith('.ogg'));
            if (audioFiles.length >= 10) {
                return res.status(409).json({
                    success: false,
                    error: 'Resource pack already contains 10 custom discs.'
                });
            }

            try {
                packManager.addOggToPack(oggPath, unpackedDir, discName);
            } catch (err) {
                console.error('[ADD OGG ERROR]', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to add OGG file to the resource pack: ' + err.message
                });
            }

            try {
                packManager.updateSoundsJson(unpackedDir, discName);
            } catch (err) {
                console.error('[UPDATE SOUNDS.JSON ERROR]', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to update sounds.json: ' + err.message
                });
            }

            try {
                packManager.updateDiscModelJson(unpackedDir, discName, customModelData);
            } catch (err) {
                console.error('[UPDATE DISC MODEL JSON ERROR]', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to update disc model JSON: ' + err.message
                });
            }

            try {
                packManager.createCustomMusicDiscModel(unpackedDir, discName);
            } catch (err) {
                console.error('[CREATE CUSTOM MUSIC DISC MODEL ERROR]', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create custom music disc model: ' + err.message
                });
            }

            try {
                packManager.rezipPack(unpackedDir, zipPath);
            } catch (err) {
                console.error('[REZIP PACK ERROR]', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to rezip the resource pack: ' + err.message
                });
            }

            let newPackSize;
            try {
                const result = checkR2Quota.checkR2Quota(zipPath);
                newPackSize = result.packSize;
            } catch (err) {
                console.warn('[QUOTA CHECK ERROR]', err.message);
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }

            if (newPackSize > MAX_PACK_SIZE) {
                return res.status(409).json({
                    success: false,
                    error: 'Resource pack exceeds 80 MB size limit.'
                });
            }

            try {
                await r2Utils.uploadPackToR2(zipPath);
            } catch (err) {
                console.error('[UPLOAD ERROR]', err.message);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to upload pack to R2: ' + err.message
                });
            }

            try {
                checkR2Quota.updateQuotaAfterUpload(newPackSize, oldPackSize);
            } catch (err) {
                console.error('[QUOTA UPDATE ERROR]', err.message);
                console.warn('Quota not updated properly. Manual fix might be needed.');
            }
        } catch (err) {
            console.error('[PACK PROCESSING ERROR]', err);
            return res.status(500).json({
                success: false,
                error: 'An unexpected error occurred during resource pack processing: ' + err.message
            });
        } finally {
            if (fs.existsSync(tempDir)) {
                try {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (err) {
                    console.warn('[CLEANUP ERROR] Failed to delete temp dir:', err.message);
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: `Disc "${discName}" created successfully.`
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: 'Failed to process the audio.'
        });
    }
}

// Delete a custom disc from the server resource pack
exports.deleteCustomDisc = async (req, res) => {
    const { token } = req.body;

    if (!serverRegistry.isValidToken(token)) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or missing token. A new token will be assigned to your Minecraft server upon your next custom disc creation request.'
        });
    }

    serverRegistry.updateLastActivity(token);

    // Prevent request spamming: apply rate limiting per token (max 6 requests per minute)
    if (isRateLimited(token)) {
        return res.status(429).json({
            success: false,
            error: 'Too many requests. Limit reached. Try again in a moment.'
        });
    }

    // Check global concurrency limit (max 2 active tokens)
    if (!activeTokens.has(token) && activeTokens.size >= MAX_ACTIVE_TOKENS) {
        return res.status(503).json({
            success: false,
            error: 'API is busy. Too many concurrent requests. Please try again shortly.'
        });
    }

    // Manage a request queue by token
    enqueue(token, () => handleDeleteCustomDisc(req.body, res)).catch(err => {
        console.error('[QUEUE ERROR]', err);
        res.status(500).json({
            success: false,
            error: 'Internal queue error.'
        });
    });
};

async function handleDeleteCustomDisc(body, res) {
    const { discName, token } = body;

    const tempDir = path.join(__dirname, '..', 'data', 'temp', token);
    const zipPath = path.join(tempDir, `${token}.zip`);
    try {
        try {
            await packManager.downloadPack(token, zipPath);
        } catch (err) {
            console.error('[DOWNLOAD PACK ERROR]', err);
            return res.status(400).json({
                success: false,
                error: 'Failed to download resource pack: ' + err.message
            });
        }

        let oldPackSize;
        try {
            const stats = await fs.promises.stat(zipPath);
            oldPackSize = stats.size;
        } catch (err) {
            console.error('[STAT ZIP ERROR]', err);
            return res.status(400).json({
                success: false,
                error: 'Cannot access downloaded zip: ' + err.message
            });
        }

        const unpackedDir = path.join(tempDir, 'unpacked');
        try {
            await packManager.unzipPack(zipPath, unpackedDir);
        } catch (err) {
            console.error('[UNZIP ERROR]', err);
            return res.status(400).json({
                success: false,
                error: 'Failed to unzip the resource pack: ' + err.message
            });
        }

        try {
            packManager.removeOggFromPack(unpackedDir, discName);
        } catch (err) {
            return res.status(409).json({
                success: false,
                error: `Disc "${discName}" was not found.`
            });
        }

        try {
            packManager.removeDiscFromSoundsJson(unpackedDir, discName);
        } catch (err) {
            return res.status(400).json({
                success: false,
                error: 'Could not update sounds.json: ' + err.message
            });
        }

        try {
            packManager.removeDiscModelJson(unpackedDir, discName);
        } catch (err) {
            console.warn('[MODEL JSON REMOVE WARNING]', err.message);
        }

        try {
            packManager.rezipPack(unpackedDir, zipPath);
        } catch (err) {
            console.error('[REZIP PACK ERROR]', err);
            return res.status(500).json({
                success: false,
                error: 'Failed to rezip the resource pack: ' + err.message
            });
        }

        let newPackSize;
        try {
            const result = checkR2Quota.checkR2Quota(zipPath);
            newPackSize = result.packSize;
        } catch (err) {
            console.warn('[QUOTA CHECK ERROR]', err.message);
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }

        try {
            await r2Utils.uploadPackToR2(zipPath);
        } catch (err) {
            console.error('[UPLOAD ERROR]', err.message);
            return res.status(500).json({
                success: false,
                error: 'Failed to upload pack to R2: ' + err.message
            });
        }

        try {
            checkR2Quota.updateQuotaAfterUpload(newPackSize, oldPackSize);
        } catch (err) {
            console.error('[QUOTA UPDATE ERROR]', err.message);
            console.warn('Quota not updated properly. Manual fix might be needed.');
        }

        return res.status(200).json({
            success: true,
            message: `Disc "${discName}" deleted successfully.`
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: 'Failed to delete disc: ' + err.message
        });
    } finally {
        if (fs.existsSync(tempDir)) {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (err) {
                console.warn('[CLEANUP ERROR] Failed to delete temp dir:', err.message);
            }
        }
    }
}
