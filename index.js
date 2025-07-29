require('dotenv').config();
require('./scripts/setupBinaries');

const cron = require('node-cron');
const cleanupInactiveTokens = require('./scripts/cleanupInactiveTokens');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const discsRoutes = require('./routes/discsRoutes');

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

app.listen(port, '0.0.0.0', () => {
    console.log(`URLCustomDiscs API listening on port ${port}`);
});
