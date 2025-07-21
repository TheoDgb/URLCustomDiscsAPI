const fs = require('fs');
const path = require('path');
const generateToken = require('../utils/tokenGenerator');
const copyAndUploadPack = require('../utils/copyAndUploadPack');

const SERVERS_FILE = path.join(__dirname, '../data/servers.json');

function loadServers() {
    if (!fs.existsSync(SERVERS_FILE)) {
        fs.mkdirSync(path.dirname(SERVERS_FILE), { recursive: true });
        fs.writeFileSync(SERVERS_FILE, JSON.stringify({}, null, 2));
        return {};
    }
    return JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
}

function saveServers(data) {
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(data, null, 2));
}

exports.registerMcServer = async (req, res) => {
    const token = generateToken();
    const servers = loadServers();

    servers[token] = {
        registeredAt: new Date().toISOString()
    };

    saveServers(servers);

    try {
        await copyAndUploadPack(token);
        console.log('[REGISTER] New token generated and pack uploaded:', token);
        const downloadPackUrl = `https://${process.env.R2_PUBLIC_URL}/${token}.zip`;
        res.json({ token, downloadPackUrl });
    } catch (err) {
        console.error('[REGISTER] Failed to upload pack, rolling back token:', err);
        delete servers[token];
        saveServers(servers);
        res.status(500).json({ error: 'Failed to upload pack. Token was not registered.' });
    }
};

function isValidToken(token) {
    if (!fs.existsSync(SERVERS_FILE)) return false;
    const servers = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
    return token in servers;
}

exports.createCustomDisc = (req, res) => {
    const { url, discName, audioType, token } = req.body;

    if (!isValidToken(token)) {
        return res.status(401).json({ error: 'Invalid or missing token.' });
    }

    console.log(`[CREATE] Request received:`);
    console.log(`- URL: ${url}`);
    console.log(`- Disc Name: ${discName}`);
    console.log(`- Audio Type: ${audioType}`);
    console.log(`- Token: ${token}`);

    // TODO: add validation, queueing, saving...
    res.json({ success: true, message: 'Disc queued for processing.' });
};
