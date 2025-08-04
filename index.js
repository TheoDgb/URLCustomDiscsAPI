const fs = require('fs');
const path = require('path');

require('dotenv').config();

const { setupBinaries } = require('./scripts/setupBinaries');

const cron = require('node-cron');
const cleanupInactiveTokens = require('./scripts/cleanupInactiveTokens');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const discsRoutes = require('./routes/discsRoutes');

const tempDir = path.join(__dirname, 'data', 'temp');
const mp3UploadsTempDir = path.join(__dirname, 'data', 'mp3_uploads_temp');

const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
    console.log('GET / received');
    res.send('API URLCustomDiscs is running.');
});

app.use('/', discsRoutes);

// CRON JOB: Delete every Monday at 3AM tokens and Cloudflare packs that have been inactive for 3 months
// minute / hour / day of the month / month / day of the week
cron.schedule('0 3 * * 1', () => {
    console.log('Running cleanup job (every Monday at 3AM)...');
    cleanupInactiveTokens()
        .then(() => console.log('Cleanup finished.'))
        .catch(err => console.error('Cleanup failed:', err));
    }, {
    timezone: 'America/New_York'
});

// // CRON JOB: Refresh cookies every 6 hours
// cron.schedule('0 */6 * * *', () => {
//     console.log('Running cookie refresh job...');
//     cookieManager.refreshCookies()
//         .then(() => console.log('Cookie refresh finished.'))
//         .catch(err => console.error('Cookie refresh failed:', err));
// }, {
//     timezone: 'America/New_York'
// });

(async () => {
    try {
        await setupBinaries();

        // Clean temporary files
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Clean temporary upload MP3 files
        if (fs.existsSync(mp3UploadsTempDir)) {
            fs.rmSync(mp3UploadsTempDir, { recursive: true, force: true });
            fs.mkdirSync(mp3UploadsTempDir, { recursive: true });
        }

        // Start Express Server
        app.listen(port, '0.0.0.0', () => {
            console.log(`URLCustomDiscs API listening on port ${port}`);
        });

    } catch (err) {
        console.error('Failed to setup application:', err);
        process.exit(1);
    }
})();
