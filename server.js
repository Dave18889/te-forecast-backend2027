// Optional: run the same /api function locally with plain Node/Express,
// without needing the Vercel CLI. `vercel dev` is the other option and
// behaves closer to production — see README.
const express = require('express');
const path = require('path');

const teForecast = require('./api/te-forecast');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/te-forecast', teForecast);

// Serve the static frontend files from the project root.
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`2027 T&E portal running at http://localhost:${PORT}`);
});
