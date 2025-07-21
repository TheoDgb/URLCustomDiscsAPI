require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const discsRoutes = require('./routes/discsRoutes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

app.use('/', discsRoutes);

app.listen(port, () => {
    console.log(`URLCustomDiscs API listening on port ${port}`);
});
