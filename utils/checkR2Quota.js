const fs = require('fs');
const path = require('path');

const QUOTA_PATH = path.join(__dirname, '../data/quota.json');
const MAX_STORAGE = 9 * 1024 * 1024 * 1024; // 9 GB

function loadQuota() {
    try {
        if (!fs.existsSync(QUOTA_PATH)) {
            const defaultQuota = { usedBytes: 0 };
            fs.writeFileSync(QUOTA_PATH, JSON.stringify(defaultQuota, null, 2));
            return defaultQuota;
        }
        const data = fs.readFileSync(QUOTA_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        throw new Error(`Could not read quota file: ${err.message}`);
    }
}

function saveQuota(data) {
    try {
        fs.writeFileSync(QUOTA_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        throw new Error(`Could not write quota file: ${err.message}`);
    }
}

function checkR2Quota(zipPath) {
    let packSize;
    try {
        packSize = fs.statSync(zipPath).size;
    } catch (err) {
        throw new Error(`Could not check file size: ${err.message}`);
    }

    const quota = loadQuota();

    if (quota.usedBytes + packSize > MAX_STORAGE) {
        throw new Error('Storage quota exceeded.');
    }

    return { packSize }; // for update after success
}

function updateQuotaAfterUpload(newPackSize, oldPackSize = 0) {
    try {
        const quota = loadQuota();
        quota.usedBytes = quota.usedBytes - oldPackSize + newPackSize;
        saveQuota(quota);
    } catch (err) {
        throw new Error(`Could not update quota: ${err.message}`);
    }
}

module.exports = {
    checkR2Quota,
    updateQuotaAfterUpload,
};
