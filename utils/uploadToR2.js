const fs = require('fs');
const path = require('path');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const r2 = require('../utils/r2Client');

const BUCKET_NAME = process.env.BUCKET_NAME;

async function uploadFileToR2(localFilePath, remoteFileName) {
    const fileStream = fs.createReadStream(localFilePath);

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `packs/${remoteFileName}`,
        Body: fileStream,
        ContentType: 'application/zip',
    });

    try {
        await r2.send(command);
        console.log(`[R2] Uploaded ${remoteFileName} to R2`);
    } catch (err) {
        console.error('[R2] Upload failed:', err);
        throw err;
    }
}

module.exports = uploadFileToR2;
