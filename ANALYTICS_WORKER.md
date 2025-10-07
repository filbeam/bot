# Analytics Worker

Cloudflare Worker that receives TTFB metrics from the FilBeam bot and stores them in Analytics Engine.

## API

**POST /** - Send TTFB data

```json
{
  "blobs": ["url", "location", "client", "cid"],
  "doubles": [ttfb, status, bytes]
}
```

**Response:**
```json
{"success": true}
```

## Deploy

### Install Wrangler
```bash
npm install -g wrangler
```

### Deploy Worker
```bash
wrangler deploy
```

### Deploy to Dev Environment
```bash
wrangler deploy --env dev
```
