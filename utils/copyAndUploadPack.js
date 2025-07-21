const fs = require('fs');
const path = require('path');
const uploadFileToR2 = require('./uploadToR2');

const PACK_TEMPLATE_PATH = path.join(__dirname, '../data/URLCustomDiscsPack.zip');
const TEMP_DIR = path.join(__dirname, '../data/temp');

async function copyAndUploadPack(token) {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const tempZipPath = path.join(TEMP_DIR, `${token}.zip`);

    // Copier le fichier
    fs.copyFileSync(PACK_TEMPLATE_PATH, tempZipPath);

    // Envoyer sur R2
    await uploadFileToR2(tempZipPath, `${token}.zip`);

    // Supprimer le fichier temporaire après upload
    fs.unlinkSync(tempZipPath);
}

module.exports = copyAndUploadPack;
