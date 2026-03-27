/* eslint-disable @typescript-eslint/no-require-imports */
const express = require('express');
const path = require('path');
const getOverpassData = require("./server/_getOverpassData");
const createPatternFillImages = require("./server/_createPatternFillImages");

const app = express();
const port = 3000;

createPatternFillImages();
getOverpassData().then(() => {
  console.log('=== SKKU 실내 내비게이션 서버 시작 ===');
  app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`)
  })
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.json());

  // Serve video files from sample_video directory (fallback for development)
  app.use('/videos', express.static(path.join(__dirname, '..', 'sample_video')));

  // Mock route API (until Spring Boot backend is ready)
  app.get('/api/route', (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: '출발지(from)와 도착지(to)를 지정하세요.' });
    }

    // Return mock route data
    res.json({
      path: [from, 'corridor-1f-main', 'stairs-a', 'corridor-5f-main', to],
      edges: [
        { from: from, to: 'corridor-1f-main', video: '/videos/clip1_h264.mp4', duration: 8 },
        { from: 'corridor-1f-main', to: 'stairs-a', video: '/videos/clip2_h264.mp4', duration: 5 },
        { from: 'stairs-a', to: 'corridor-5f-main', video: '/videos/clip3_h264.mp4', duration: 10 },
        { from: 'corridor-5f-main', to: to, video: '/videos/clip4_h264.mp4', duration: 6 },
      ],
      totalDistance: 150,
      estimatedTime: '3분',
    });
  });

}).catch(reason => {
  console.error('### Error: '+ reason + ' ###');
})
