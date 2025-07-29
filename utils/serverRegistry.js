const fs = require('fs');
const path = require('path');

const SERVERS_FILE = path.join(__dirname, '..', 'data', 'servers.json');

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

function isValidToken(token) {
    if (!fs.existsSync(SERVERS_FILE)) return false;
    const servers = loadServers();
    return token in servers;
}

function registerToken(token) {
    const servers = loadServers();
    const now = new Date().toISOString();
    servers[token] = {
        registeredAt: now,
        lastActivityAt: now
    };
    saveServers(servers);
}

function updateLastActivity(token) {
    const servers = loadServers();
    if (servers[token]) {
        servers[token].lastActivityAt = new Date().toISOString();
        saveServers(servers);
    }
}

function unregisterToken(token) {
    const servers = loadServers();
    if (servers[token]) {
        delete servers[token];
        saveServers(servers);
    }
}

module.exports = {
    isValidToken,
    registerToken,
    updateLastActivity,
    unregisterToken
};