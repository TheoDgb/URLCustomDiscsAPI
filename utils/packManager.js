const fs = require('fs');
const path = require('path');
const https = require('https');
const extract = require('extract-zip');
const AdmZip = require('adm-zip');

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

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

function updateDiscModelJson(unpackedDir, discName, customModelData) {
    try {
        const modelPath = path.join(unpackedDir, 'assets', 'minecraft', 'models', 'item', 'music_disc_13.json');
        let model = { overrides: [] };

        if (fs.existsSync(modelPath)) {
            const content = fs.readFileSync(modelPath, 'utf8');
            model = JSON.parse(content);
        }

        if (!model.overrides) model.overrides = [];

        const alreadyExists = model.overrides.some(override =>
            override.predicate?.custom_model_data === customModelData
        );

        if (!alreadyExists) {
            model.overrides.push({
                predicate: { custom_model_data: customModelData },
                model: `item/custom_music_disc_${discName}`
            });
            fs.writeFileSync(modelPath, JSON.stringify(model, null, 2));
        }
    } catch (err) {
        throw new Error(`Unable to update disc model JSON: ${err.message}`);
    }
}

function createCustomMusicDiscModel(unpackedDir, discName) {
    try {
        const modelPath = path.join(unpackedDir, 'assets', 'minecraft', 'models', 'item', `custom_music_disc_${discName}.json`);
        const model = {
            parent: "minecraft:item/generated",
            textures: {
                layer0: "minecraft:item/record_custom"
            }
        };
        fs.writeFileSync(modelPath, JSON.stringify(model, null, 2));
    } catch (err) {
        throw new Error(`Unable to create custom music disc model: ${err.message}`);
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
    downloadPack,
    unzipPack,
    addOggToPack,
    updateSoundsJson,
    updateDiscModelJson,
    createCustomMusicDiscModel,
    rezipPack
};
