const fs = require('fs');
const path = require('path');
const generateToken = require('../utils/tokenGenerator');

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

exports.registerMcServer = (req, res) => {
    const token = generateToken();
    const servers = loadServers();

    servers[token] = {
        registeredAt: new Date().toISOString()
    };

    saveServers(servers);

    console.log('[REGISTER] New token generated:', token);
    res.json({ token });
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
