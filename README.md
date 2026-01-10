# MetaMesh Plugin: Torrent

A MetaMesh plugin that parses `.torrent` files and extracts metadata.

## Description

This plugin decodes bencoded `.torrent` files to extract:

- **Tracker information**: Announce URLs
- **Content info**: Torrent name, file list
- **Metadata**: Creation date, creator, comments

## Metadata Fields

| Field | Description |
|-------|-------------|
| `announce` | Primary tracker URL |
| `info/name` | Torrent name |
| `comment` | Torrent comment |
| `createdBy` | Creator application |
| `creationDate` | Unix timestamp of creation |
| `info/files/{n}/length` | File size in bytes |
| `info/files/{n}/path` | File path within torrent |
| `announceList` | Set of all tracker URLs |

## Dependencies

- Requires `file-info` plugin to run first

## Configuration

No configuration required.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/manifest` | GET | Plugin manifest |
| `/configure` | POST | Update configuration |
| `/process` | POST | Process a file |

## Running Locally

```bash
npm install
npm run build
npm start
```

## Docker

```bash
docker build -t metamesh-plugin-torrent .
docker run -p 8080:8080 metamesh-plugin-torrent
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server host |

## License

MIT
