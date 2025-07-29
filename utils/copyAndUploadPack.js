const fs = require('fs');
const path = require('path');
const r2Utils = require('./r2Utils');
const { checkR2Quota, updateQuotaAfterUpload } = require('./checkR2Quota');

const PACK_TEMPLATE_PATH = path.join(__dirname, '../data/URLCustomDiscsPack.zip');
const TEMP_DIR = path.join(__dirname, '../data/temp');

async function copyAndUploadPack(token) {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const tempZipPath = path.join(TEMP_DIR, `${token}.zip`);

    // Copy the template pack
    fs.copyFileSync(PACK_TEMPLATE_PATH, tempZipPath);

    // Check quota before sending
    const { packSize } = checkR2Quota(tempZipPath);

    try {
        // Upload to R2
        await r2Utils.uploadPackToR2(tempZipPath, `${token}.zip`);

        // Quota update only after successful upload
        updateQuotaAfterUpload(packSize);
    } catch (err) {
        throw new Error(`Upload to R2 failed: ${err.message}`);
    } finally {
        // Delete the temporary pack
        if (fs.existsSync(tempZipPath)) {
            fs.unlinkSync(tempZipPath);
        }
    }
}

module.exports = copyAndUploadPack;
