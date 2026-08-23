# Yuki Music Backend

Backend API for Yuki Music.

This repository is being built as the backend foundation for the Yuki Music web/PWA client. Its API structure follows the project architecture we are adapting from the upstream YT-Music-Mod project, while the implementation and branding are maintained in this repository.

## Status

🚧 Early development — API baseline is online locally/Vercel-ready.

## API

- `GET /api`
- `GET /api/health`
- `/api/home`
- `/api/charts`
- `/api/search`
- `/api/suggest`
- `/api/next`
- `/api/related`
- `/api/browse`
- `/api/resolve`
- `/api/lyrics`
- `/api/thumb`

## Development

```bash
npm install
npm start
```

Health check:

```text
GET /api/health
```

## Upstream

The API design and project architecture are being adapted from `ramax100/YT-Music-Mod`. The upstream project should remain credited in project documentation.
