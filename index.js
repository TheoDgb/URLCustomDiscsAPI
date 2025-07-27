require('dotenv').config();
require('./scripts/setupBinaries');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const discsRoutes = require('./routes/discsRoutes');

const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(bodyParser.json());

app.use('/', discsRoutes);

app.listen(port, '0.0.0.0', () => {
    console.log(`URLCustomDiscs API listening on port ${port}`);
});
