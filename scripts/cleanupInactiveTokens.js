const fs = require('fs');
const path = require('path');
const { deletePackFromR2 } = require('../utils/r2Utils');

const SERVERS_FILE = path.join(__dirname, '..', 'data', 'servers.json');
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000; // 90 jours

function loadServers() {
    if (!fs.existsSync(SERVERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
}

function saveServers(servers) {
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
}

async function cleanupInactiveTokens() {
    const servers = loadServers();
    const now = Date.now();
    let changed = false;

    for (const [token, data] of Object.entries(servers)) {
        const lastActivity = new Date(data.lastActivityAt).getTime();

        if (now - lastActivity > THREE_MONTHS_MS) {
            console.log("\x1b[94m%s\x1b[0m", `Token ${token} is inactive. Cleaning up...`);


            try {
                await deletePackFromR2(`${token}.zip`);
                console.log("\x1b[94m%s\x1b[0m", `Deleted pack ${token}.zip from R2`);

                delete servers[token];
                changed = true;
            } catch (err) {
                console.warn(`Failed to delete pack for token ${token}: ${err.message}`);
            }
        }
    }

    if (changed) {
        saveServers(servers);
        console.log("\x1b[94m%s\x1b[0m", 'Updated servers.json after cleanup.');
    } else {
        console.log("\x1b[94m%s\x1b[0m", 'No inactive tokens to clean.');
    }
}

// node scripts/cleanupInactiveTokens.js
if (require.main === module) {
    (async () => {
        await cleanupInactiveTokens();
    })();
}

module.exports = cleanupInactiveTokens;
