const fs = require('fs');
const path = require('path');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const r2 = require('../utils/r2Client');

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

async function uploadPackToR2(localFilePath) {
    const fileName = path.basename(localFilePath);

    let fileStream;
    try {
        fileStream = fs.createReadStream(localFilePath);
    } catch (err) {
        throw new Error(`Unable to read file for upload: ${err.message}`);
    }

    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileName,
        Body: fileStream,
        ContentType: 'application/zip',
    });

    try {
        await r2.send(command);
    } catch (err) {
        throw new Error(`Upload to R2 failed: ${err.message}`);
    }
}

async function deletePackFromR2(fileName) {
    const command = new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileName,
    });

    try {
        await r2.send(command);
    } catch (err) {
        throw new Error(`Delete from R2 failed: ${err.message}`);
    }
}

module.exports = {
    uploadPackToR2,
    deletePackFromR2
};
