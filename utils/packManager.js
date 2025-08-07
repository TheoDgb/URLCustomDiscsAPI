const fs = require('fs');
const path = require('path');
const https = require('https');
const extract = require('extract-zip');
const AdmZip = require('adm-zip');

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const PACK_TEMPLATE_1_21_PATH = path.join(__dirname, '../data/serverResourcePacks/1_21/URLCustomDiscsPack.zip');
const PACK_TEMPLATE_1_21_4_PATH = path.join(__dirname, '../data/serverResourcePacks/1_21_4/URLCustomDiscsPack.zip')

function parseVersion(minecraftServerVersion) {
    const parts = minecraftServerVersion.split('.').map(Number);
    const major = parts[0] || 0;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0; // 0 by default
    return { major, minor, patch };
}

function selectPackTemplate(minecraftServerVersion) {
    const { major, minor, patch } = parseVersion(minecraftServerVersion);

    // From 1.21.4 and +, take the 1.21.4 pack
    if (
        major > 1 ||
        (major === 1 && minor > 21) ||
        (major === 1 && minor === 21 && patch >= 4)
    ) {
        return PACK_TEMPLATE_1_21_4_PATH;
    }

    return PACK_TEMPLATE_1_21_PATH;
}

function downloadPack(token, destinationPath) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

        const file = fs.createWriteStream(destinationPath);
        const url = `https://${R2_PUBLIC_URL}/${token}.zip`;

        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to download pack (${url}): ${response.statusCode}`));
            }

            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => {
            reject(new Error(`Network error while downloading pack: ${err.message}`));
        });
    });
}

async function unzipPack(zipPath, extractTo) {
    try {
        await extract(zipPath, { dir: extractTo });
    } catch (err) {
        throw new Error(`Unzipping failed for ${zipPath}: ${err.message}`);
    }
}

function addOggToPack(oggPath, unpackedDir, discName) {
    try {
        const targetPath = path.join(unpackedDir, 'assets', 'minecraft', 'sounds', 'custom', `${discName}.ogg`);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(oggPath, targetPath);
    } catch (err) {
        throw new Error(`Failed to copy OGG file to pack: ${err.message}`);
    }
}

function updateSoundsJson(unpackedDir, discName) {
    try {
        const soundsJsonPath = path.join(unpackedDir, 'assets', 'minecraft', 'sounds.json');
        let sounds = {};

        if (fs.existsSync(soundsJsonPath)) {
            const content = fs.readFileSync(soundsJsonPath, 'utf8');
            sounds = JSON.parse(content);
        }

        const key = `customdisc.${discName}`;

        if (!sounds[key]) {
            sounds[key] = {
                category: "record",
                sounds: [{ name: `custom/${discName}`, stream: true }]
            };
            fs.writeFileSync(soundsJsonPath, JSON.stringify(sounds, null, 2));
        }
    } catch (err) {
        throw new Error(`Unable to update sounds.json: ${err.message}`);
    }
}

function updateDiscModelJson(unpackedDir, discName, customModelData, minecraftServerVersion) {
    const { major, minor, patch } = parseVersion(minecraftServerVersion);
    const isNewFormat = (
        major > 1 ||
        (major === 1 && minor > 21) ||
        (major === 1 && minor === 21 && patch >= 4)
    );

    try {
        const modelPath = isNewFormat
            ? path.join(unpackedDir, 'assets', 'minecraft', 'items', 'music_disc_13.json')
            : path.join(unpackedDir, 'assets', 'minecraft', 'models', 'item', 'music_disc_13.json');

        // initialize the model
        let model = isNewFormat
            ? { entries: [] }
            : { overrides: [] };

        if (fs.existsSync(modelPath)) {
            const content = fs.readFileSync(modelPath, 'utf8');
            model = JSON.parse(content);

            if (isNewFormat) {
                if (!model.model.entries) model.model.entries = [];

                const alreadyExists = model.model.entries.some(entry =>
                    entry.threshold === customModelData
                );

                if (!alreadyExists) {
                    model.model.entries.push({
                        threshold: customModelData,
                        model: {
                            type: "model",
                            model: `item/custom_music_disc_${discName}`
                        }
                    });
                }
            } else {
                if (!model.overrides) model.overrides = [];

                const alreadyExists = model.overrides.some(override =>
                    override.predicate?.custom_model_data === customModelData
                );

                if (!alreadyExists) {
                    model.overrides.push({
                        predicate: { custom_model_data: customModelData },
                        model: `item/custom_music_disc_${discName}`
                    });
                }
            }
        }
        fs.writeFileSync(modelPath, JSON.stringify(model, null, 2));
    } catch (err) {
        throw new Error(`Unable to update disc model JSON: ${err.message}`);
    }
}

function createCustomMusicDiscModel(unpackedDir, discName, minecraftServerVersion) {
    const { major, minor, patch } = parseVersion(minecraftServerVersion);
    const isNewFormat = (
        major > 1 ||
        (major === 1 && minor > 21) ||
        (major === 1 && minor === 21 && patch >= 4)
    );

    try {
        const modelPath = path.join(unpackedDir, 'assets', 'minecraft', 'models', 'item', `custom_music_disc_${discName}.json`);

        const model = {
            parent: "minecraft:item/generated",
            textures: {
                layer0: isNewFormat
                    ? "item/record_custom" // no more `minecraft:` namespace for textures in 1.21.4+
                    : "minecraft:item/record_custom"
            }
        };

        fs.writeFileSync(modelPath, JSON.stringify(model, null, 2));
    } catch (err) {
        throw new Error(`Unable to create custom music disc model: ${err.message}`);
    }
}

function removeOggFromPack(unpackedDir, discName) {
    try {
        const oggPath = path.join(unpackedDir, 'assets', 'minecraft', 'sounds', 'custom', `${discName}.ogg`);
        if (fs.existsSync(oggPath)) {
            fs.unlinkSync(oggPath);
        } else {
            throw new Error(`OGG file not found: ${oggPath}`);
        }
    } catch (err) {
        throw new Error(`Failed to remove OGG file: ${err.message}`);
    }
}

function removeDiscFromSoundsJson(unpackedDir, discName) {
    try {
        const soundsJsonPath = path.join(unpackedDir, 'assets', 'minecraft', 'sounds.json');
        if (!fs.existsSync(soundsJsonPath)) return;

        const content = fs.readFileSync(soundsJsonPath, 'utf8');
        const sounds = JSON.parse(content);

        const key = `customdisc.${discName}`;
        if (sounds[key]) {
            delete sounds[key];
            fs.writeFileSync(soundsJsonPath, JSON.stringify(sounds, null, 2));
        } else {
            throw new Error(`Entry ${key} not found in sounds.json`);
        }
    } catch (err) {
        throw new Error(`Failed to remove entry from sounds.json: ${err.message}`);
    }
}

function removeDiscModelJson(unpackedDir, discName, minecraftServerVersion) {
    const { major, minor, patch } = parseVersion(minecraftServerVersion);
    const isNewFormat = (
        major > 1 ||
        (major === 1 && minor > 21) ||
        (major === 1 && minor === 21 && patch >= 4)
    );

    try {
        const customModelPath = path.join(unpackedDir, 'assets', 'minecraft', 'models', 'item', `custom_music_disc_${discName}.json`);
        if (fs.existsSync(customModelPath)) {
            fs.unlinkSync(customModelPath);
        }

        const modelPath = isNewFormat
            ? path.join(unpackedDir, 'assets', 'minecraft', 'items', 'music_disc_13.json')
            : path.join(unpackedDir, 'assets', 'minecraft', 'models', 'item', 'music_disc_13.json');

        let model = isNewFormat
            ? { model: { entries: [] } }
            : { overrides: [] };

        if (fs.existsSync(modelPath)) {
            const content = fs.readFileSync(modelPath, 'utf8');
            model = JSON.parse(content);

            if (isNewFormat) {
                if (!model.model?.entries || !Array.isArray(model.model.entries)) {
                    model.model = { entries: [] };
                }

                const before = model.model.entries.length;
                model.model.entries = model.model.entries.filter(entry =>
                    entry.model?.model !== `item/custom_music_disc_${discName}`
                );
                const after = model.model.entries.length;

                if (after < before) {
                    fs.writeFileSync(modelPath, JSON.stringify(model, null, 2));
                } else {
                    throw new Error(`Entry for ${discName} not found in entries`);
                }
            } else {


                const before = model.overrides.length;
                model.overrides = model.overrides.filter(override =>
                    override.model !== `item/custom_music_disc_${discName}`
                );
                const after = model.overrides.length;

                if (after < before) {
                    fs.writeFileSync(modelPath, JSON.stringify(model, null, 2));
                } else {
                    throw new Error(`Override for ${discName} not found in overrides`);
                }
            }
        }
    } catch (err) {
        throw new Error(`Failed to remove disc model JSON: ${err.message}`);
    }
}

function rezipPack(folderPath, outputZipPath) {
    try {
        const zip = new AdmZip();
        zip.addLocalFolder(folderPath);
        zip.writeZip(outputZipPath);
    } catch (err) {
        throw new Error(`Unable to rezip pack: ${err.message}`);
    }
}

module.exports = {
    selectPackTemplate,
    downloadPack,
    unzipPack,
    addOggToPack,
    updateSoundsJson,
    updateDiscModelJson,
    createCustomMusicDiscModel,
    removeOggFromPack,
    removeDiscFromSoundsJson,
    removeDiscModelJson,
    rezipPack
};
