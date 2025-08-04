const express = require('express');
const multer = require('multer');
const upload = multer({ dest: 'data/mp3_uploads_temp/' }); // Temp folder for mp3

const router = express.Router();
const {
    registerMcServer,
    createCustomDisc,
    createCustomDiscFromMp3,
    deleteCustomDisc
} = require('../controllers/discsController');

router.post('/register-mc-server', registerMcServer);
router.post('/create-custom-disc', createCustomDisc);
router.post('/create-custom-disc-from-mp3', upload.single('file'), createCustomDiscFromMp3);
router.post('/delete-custom-disc', deleteCustomDisc);

module.exports = router;
