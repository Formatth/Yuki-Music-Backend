const YTM_URL = 'https://music.youtube.com/youtubei/v1';

const CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240101.00.00',
    hl: 'id',
    gl: 'ID'
  }
};

const HEADERS = {
  'content-type': 'application/json',
  origin: 'https://music.youtube.com',
  referer: 'https://music.youtube.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
};

async function request(endpoint, body = {}) {
  const response = await fetch(`${YTM_URL}/${endpoint}?prettyPrint=false`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ context: CONTEXT, ...body })
  });
  if (!response.ok) throw new Error(`YouTube Music API ${response.status}`);
  return response.json();
}

function all(node, key, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const value of node) all(value, key, out); return out; }
  for (const [name, value] of Object.entries(node)) { if (name === key) out.push(value); all(value, key, out); }
  return out;
}
function first(node, key) { return all(node, key)[0]; }
function label(value) {
  if (!value) return '';
  if (value.simpleText) return value.simpleText;
  if (value.runs) return value.runs.map(run => run.text || '').join('');
  return '';
}
function thumbnail(node) {
  const list = all(node, 'thumbnails').flat().filter(item => item && item.url);
  if (!list.length) return null;
  return list.reduce((a, b) => (b.width || 0) > (a.width || 0) ? b : a).url;
}
function endpoint(nav) {
  if (!nav) return {};
  const watch = nav.watchEndpoint;
  const browse = nav.browseEndpoint;
  if (watch?.videoId) return { videoId: watch.videoId, playlistId: watch.playlistId || null };
  if (browse?.browseId) return { browseId: browse.browseId };
  return {};
}
function parseItem(renderer) {
  const columns = (renderer.flexColumns || [])
    .map(column => column.musicResponsiveListItemFlexColumnRenderer?.text).filter(Boolean);
  const titleColumn = columns[0];
  const title = label(titleColumn);
  let videoId = renderer.playlistItemData?.videoId || null;
  const titleRun = titleColumn?.runs?.[0];
  videoId ||= titleRun?.navigationEndpoint?.watchEndpoint?.videoId || null;
  const overlay = first(renderer.overlay || {}, 'watchEndpoint');
  videoId ||= overlay?.videoId || null;
  const subtitle = columns.slice(1).map(label).filter(Boolean).join(' • ');
  const durationRenderer = first(renderer, 'musicResponsiveListItemFixedColumnRenderer');
  return { type: videoId ? 'song' : 'browse', title, subtitle, videoId, thumbnail: thumbnail(renderer.thumbnail), duration: durationRenderer ? label(durationRenderer.text) : null };
}
function parseTwoRow(renderer) {
  const nav = endpoint(renderer.navigationEndpoint);
  return { type: nav.videoId ? 'song' : 'browse', title: label(renderer.title), subtitle: label(renderer.subtitle), thumbnail: thumbnail(renderer.thumbnailRenderer || renderer.thumbnail), videoId: nav.videoId || null, browseId: nav.browseId || null, playlistId: nav.playlistId || null };
}
function parseSections(contents = []) {
  return contents.map(section => {
    const carousel = section.musicCarouselShelfRenderer;
    const shelf = section.musicShelfRenderer;
    if (carousel) {
      const items = (carousel.contents || []).map(entry => entry.musicResponsiveListItemRenderer ? parseItem(entry.musicResponsiveListItemRenderer) : entry.musicTwoRowItemRenderer ? parseTwoRow(entry.musicTwoRowItemRenderer) : null).filter(item => item?.title);
      return items.length ? { title: label(first(carousel.header, 'title')), items } : null;
    }
    if (shelf) {
      const items = (shelf.contents || []).map(entry => entry.musicResponsiveListItemRenderer ? parseItem(entry.musicResponsiveListItemRenderer) : null).filter(item => item?.title);
      return items.length ? { title: label(shelf.title), items, list: true } : null;
    }
    return null;
  }).filter(Boolean);
}
const SEARCH_FILTERS = { songs: 'EgWKAQIIAWoMEA4QChADEAQQCRAF', videos: 'EgWKAQIQAWoMEA4QChADEAQQCRAF', albums: 'EgWKAQIYAWoMEA4QChADEAQQCRAF', artists: 'EgWKAQIgAWoMEA4QChADEAQQCRAF', playlists: 'EgeKAQQoAEABagwQDhAKEAMQBBAJEAU=' };
async function search(query, filter) {
  const body = { query }; if (SEARCH_FILTERS[filter]) body.params = SEARCH_FILTERS[filter];
  const data = await request('search', body);
  const sections = parseSections(all(data, 'musicShelfRenderer'));
  if (sections.length) return sections;
  const items = [], seen = new Set();
  for (const section of all(data, 'itemSectionRenderer')) for (const entry of section.contents || []) {
    if (!entry.musicResponsiveListItemRenderer) continue;
    const item = parseItem(entry.musicResponsiveListItemRenderer); const key = item.videoId || item.title;
    if (item.title && !seen.has(key)) { seen.add(key); items.push(item); }
  }
  return items.length ? [{ title: 'Results', items }] : [];
}
async function home() { const data = await request('browse', { browseId: 'FEmusic_home' }); return parseSections(first(data, 'sectionListRenderer')?.contents || []); }
async function charts() { const data = await request('browse', { browseId: 'FEmusic_charts' }); return parseSections(first(data, 'sectionListRenderer')?.contents || []); }
async function suggest(query) { const data = await request('music/get_search_suggestions', { input: query }); return all(data, 'searchSuggestionRenderer').map(item => label(item.suggestion)).filter(Boolean); }

async function next(videoId) {
  const data = await request('next', { videoId });
  const playlist = first(data, 'playlistPanelRenderer') || first(data, 'musicQueueRenderer');
  const items = (playlist?.contents || []).map(entry => {
    const r = entry.playlistPanelVideoRenderer;
    if (!r) return null;
    return { type: 'song', title: label(r.title), subtitle: label(r.shortBylineText), videoId: r.videoId || null, thumbnail: thumbnail(r.thumbnail), duration: label(r.lengthText) };
  }).filter(x => x?.videoId && x.title);
  return { queue: items, lyricsBrowseId: first(data, 'browseId') || null, relatedBrowseId: first(data, 'relatedBrowseId') || null };
}

async function related(browseId) {
  const data = await request('browse', { browseId });
  const sectionList = first(data, 'sectionListRenderer');
  return parseSections(sectionList?.contents || []);
}

async function browse(id, params) {
  const data = await request('browse', { browseId: id, ...(params ? { params } : {}) });
  const header = first(data, 'musicResponsiveHeaderRenderer') || first(data, 'musicDetailHeaderRenderer') || first(data, 'musicImmersiveHeaderRenderer');
  const shelves = all(data, 'musicShelfRenderer');
  const tracks = [];
  for (const shelf of shelves) for (const entry of shelf.contents || []) {
    if (!entry.musicResponsiveListItemRenderer) continue;
    const item = parseItem(entry.musicResponsiveListItemRenderer);
    if (item.videoId) tracks.push(item);
  }
  return { header: header ? { title: label(header.title), subtitle: label(header.subtitle), description: label(header.description), thumbnail: thumbnail(header.thumbnail || header) } : null, tracks, sections: parseSections(first(data, 'sectionListRenderer')?.contents || []) };
}

module.exports = { request, search, home, charts, suggest, next, related, browse, parseSections };
