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

const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(bodyParser.json());

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

(async () => {
    try {
        await setupBinaries();

        // Clean temporary files
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
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
