const express = require('express');
const { home, charts, search, suggest } = require('./lib/ytm');

const app = express();
const PORT = process.env.PORT || 3000;
const cache = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < ttl) return hit.value;
  const value = await fn();
  cache.set(key, { value, time: Date.now() });
  return value;
}

app.get('/', (_req, res) => {
  res.json({ name: 'Yuki Music Backend', status: 'online', version: '0.1.0' });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Yuki Music Backend', version: '0.1.0' });
});

app.get('/api', (_req, res) => {
  res.json({
    name: 'Yuki Music Backend',
    status: 'online',
    endpoints: ['/api/health', '/api/home', '/api/charts', '/api/search', '/api/suggest', '/api/next', '/api/related', '/api/browse', '/api/resolve', '/api/lyrics', '/api/thumb']
  });
});

app.get('/api/home', async (_req, res) => {
  try {
    res.json({ sections: await cached('home', 10 * 60 * 1000, home) });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/charts', async (_req, res) => {
  try {
    res.json({ sections: await cached('charts', 30 * 60 * 1000, charts) });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ sections: [] });
  try {
    res.json({ sections: await search(q, String(req.query.filter || '')) });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/suggest', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ suggestions: [] });
  try {
    res.json({ suggestions: await suggest(q) });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Yuki Music Backend listening on ${PORT}`));
}

module.exports = app;
