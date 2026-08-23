const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'Yuki Music Backend',
    version: '0.1.0'
  });
});

app.get('/api', (_req, res) => {
  res.json({
    name: 'Yuki Music Backend',
    status: 'online',
    endpoints: [
      '/api/health',
      '/api/home',
      '/api/charts',
      '/api/search',
      '/api/suggest',
      '/api/next',
      '/api/related',
      '/api/browse',
      '/api/resolve',
      '/api/lyrics',
      '/api/thumb'
    ]
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Yuki Music Backend listening on ${PORT}`);
  });
}

module.exports = app;
