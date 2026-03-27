const express = require('express');
const path = require('path');
const app = express();

// Serve the test page
app.use(express.static(__dirname));

// Serve sample videos from parent directory
app.use('/sample_video', express.static(path.join(__dirname, '..', 'sample_video')));

const port = 8360;
app.listen(port, () => {
  console.log(`360° Video Test Server running at http://localhost:${port}`);
  console.log('Open in Chrome and click Play to test.');
});
