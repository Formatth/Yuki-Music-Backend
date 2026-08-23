const express = require('express');
const { home, charts, search, suggest, next, related, browse } = require('./lib/ytm');

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

app.get('/', (_req, res) => res.json({ name: 'Yuki Music Backend', status: 'online', version: '0.2.0' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Yuki Music Backend', version: '0.2.0' }));
app.get('/api', (_req, res) => res.json({ name: 'Yuki Music Backend', status: 'online', endpoints: ['/api/health','/api/home','/api/charts','/api/search','/api/suggest','/api/next','/api/related','/api/browse','/api/resolve','/api/lyrics','/api/thumb'] }));

app.get('/api/home', async (_req, res) => { try { res.json({ sections: await cached('home', 10 * 60 * 1000, home) }); } catch (e) { res.status(502).json({ error: e.message }); } });
app.get('/api/charts', async (_req, res) => { try { res.json({ sections: await cached('charts', 30 * 60 * 1000, charts) }); } catch (e) { res.status(502).json({ error: e.message }); } });
app.get('/api/search', async (req, res) => { const q = String(req.query.q || '').trim(); if (!q) return res.json({ sections: [] }); try { res.json({ sections: await search(q, String(req.query.filter || '')) }); } catch (e) { res.status(502).json({ error: e.message }); } });
app.get('/api/suggest', async (req, res) => { const q = String(req.query.q || '').trim(); if (!q) return res.json({ suggestions: [] }); try { res.json({ suggestions: await suggest(q) }); } catch (e) { res.status(502).json({ error: e.message }); } });

app.get('/api/next', async (req, res) => {
  const id = String(req.query.videoId || '').trim();
  if (!id) return res.status(400).json({ error: 'videoId is required' });
  try { res.json(await cached(`next:${id}`, 2 * 60 * 1000, () => next(id))); } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/related', async (req, res) => {
  const id = String(req.query.browseId || '').trim();
  if (!id) return res.status(400).json({ error: 'browseId is required' });
  try { res.json({ sections: await cached(`related:${id}`, 10 * 60 * 1000, () => related(id)) }); } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/browse', async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id is required' });
  try { res.json(await cached(`browse:${id}:${req.query.params || ''}`, 10 * 60 * 1000, () => browse(id, req.query.params))); } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/resolve', (req, res) => {
  try {
    const raw = String(req.query.url || '').trim();
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const videoId = u.searchParams.get('v');
    const playlistId = u.searchParams.get('list');
    const path = u.pathname;
    if (videoId) return res.json({ kind: 'song', videoId, playlistId: playlistId || null, player: { type: 'youtube-iframe', videoId } });
    if (playlistId) return res.json({ kind: 'playlist', id: playlistId });
    if (path.startsWith('/browse/')) { const id = path.split('/')[2]; return res.json({ kind: id?.startsWith('MPRE') ? 'album' : 'browse', id }); }
    if (path.startsWith('/channel/')) return res.json({ kind: 'artist', id: path.split('/')[2] });
    return res.status(400).json({ error: 'Unsupported music URL' });
  } catch { return res.status(400).json({ error: 'Invalid URL' }); }
});

app.get('/api/lyrics', async (req, res) => {
  const title = String(req.query.title || '').trim();
  const artist = String(req.query.artist || '').trim();
  const duration = Number(req.query.duration || 0);
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (duration > 0) params.set('duration', String(Math.round(duration)));
    const response = await fetch(`https://lrclib.net/api/get?${params}`);
    if (response.status === 404) return res.json({ synced: null, plain: null, source: 'lrclib' });
    if (!response.ok) throw new Error(`LRCLIB ${response.status}`);
    const data = await response.json();
    res.json({ synced: data.syncedLyrics || null, plain: data.plainLyrics || null, source: 'lrclib', title: data.trackName || title, artist: data.artistName || artist });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/thumb', (req, res) => {
  const id = String(req.query.videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return res.status(400).json({ error: 'videoId is required' });
  res.json({ videoId: id, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, maxres: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` });
});

app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found' }));
if (require.main === module) app.listen(PORT, () => console.log(`Yuki Music Backend listening on ${PORT}`));
module.exports = app;
