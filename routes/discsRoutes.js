const express = require('express');
const router = express.Router();
const {
    registerMcServer,
    createCustomDisc
} = require('../controllers/discsController');

router.post('/register-mc-server', registerMcServer);
router.post('/create-custom-disc', createCustomDisc);

module.exports = router;
