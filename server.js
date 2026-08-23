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

app.get('/', (_req, res) => res.json({ name: 'Yuki Music Backend', status: 'online', version: '0.2.1' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Yuki Music Backend', version: '0.2.1' }));
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

function normLyricsText(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, ' ').trim();
}
function similarity(a, b) {
  const x = normLyricsText(a), y = normLyricsText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const A = new Set(x.split(' ')), B = new Set(y.split(' '));
  let common = 0; for (const word of A) if (B.has(word)) common++;
  return common / Math.max(A.size, B.size, 1);
}

async function lrclibGet(params) {
  const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, { headers: { accept: 'application/json', 'user-agent': 'Yuki-Music/0.2.1' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`LRCLIB ${response.status}`);
  return response.json();
}

async function lrclibSearch(title, artist) {
  const q = [title, artist].filter(Boolean).join(' ').trim();
  if (!q) return [];
  const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json', 'user-agent': 'Yuki-Music/0.2.1' } });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

app.get('/api/lyrics', async (req, res) => {
  const title = String(req.query.title || '').trim();
  const artist = String(req.query.artist || '').trim();
  const duration = Number(req.query.duration || 0);
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    // First try LRCLIB's exact endpoint. Duration is only sent when it is a real value.
    const exact = await lrclibGet(new URLSearchParams({ track_name: title, artist_name: artist, ...(duration > 0 ? { duration: String(Math.round(duration)) } : {}) }));
    if (exact) return res.json({ synced: exact.syncedLyrics || null, plain: exact.plainLyrics || null, source: 'lrclib', title: exact.trackName || title, artist: exact.artistName || artist });

    // LRCLIB can reject /get with 400 for imperfect metadata. Search is more tolerant,
    // then we choose the closest title/artist/duration match instead of returning random lyrics.
    const candidates = await lrclibSearch(title, artist);
    const ranked = candidates.map(item => {
      const titleScore = similarity(title, item.trackName);
      const artistScore = artist ? similarity(artist, item.artistName) : 0.5;
      const durationScore = duration > 0 && Number.isFinite(Number(item.duration)) ? Math.max(0, 1 - Math.abs(Number(item.duration) - duration) / 30) : 0.5;
      return { item, score: titleScore * 0.55 + artistScore * 0.35 + durationScore * 0.10 };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 0.55) return res.json({ synced: null, plain: null, source: 'lrclib', match: null });

    const item = best.item;
    return res.json({ synced: item.syncedLyrics || null, plain: item.plainLyrics || null, source: 'lrclib-search', match: { score: Number(best.score.toFixed(3)), title: item.trackName || null, artist: item.artistName || null, duration: item.duration || null } });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/thumb', (req, res) => {
  const id = String(req.query.videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return res.status(400).json({ error: 'videoId is required' });
  res.json({ videoId: id, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, maxres: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` });
});

app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found' }));
if (require.main === module) app.listen(PORT, () => console.log(`Yuki Music Backend listening on ${PORT}`));
module.exports = app;
