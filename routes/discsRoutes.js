const express = require('express');
const router = express.Router();
const {
    registerMcServer,
    createCustomDisc,
    deleteCustomDisc
} = require('../controllers/discsController');

router.post('/register-mc-server', registerMcServer);
router.post('/create-custom-disc', createCustomDisc);
router.post('/delete-custom-disc', deleteCustomDisc);

module.exports = router;
