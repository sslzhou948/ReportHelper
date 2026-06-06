# Self-Hosted Docker Deployment

This guide is for a small trial deployment on a Linux home lab. It runs:

- Fastify backend in Docker
- PostgreSQL in Docker
- uploaded report images on a host-mounted directory

The mini program frontend is not hosted in Docker. It is uploaded through WeChat DevTools, then it calls your backend HTTPS domain.

## 1. Prepare Domain And Reverse Proxy

Create an HTTPS domain such as:

```text
https://api.your-domain.com
```

In Nginx Proxy Manager, proxy it to:

```text
http://<linux-lan-ip>:8787
```

Enable WebSocket support only if your proxy template requires it; the current backend uses ordinary HTTP APIs.

## 2. Copy Files To Linux

Copy the repository to your Linux host, then from the repository root:

```bash
cp deploy/compose.env.example .env
mkdir -p data/postgres data/uploads
```

Edit `.env`:

```env
BACKEND_HOST_PORT=8787
POSTGRES_DATA_DIR=/your/persistent/path/postgres
UPLOAD_DATA_DIR=/your/persistent/path/uploads
JWT_SECRET=use-a-new-long-random-secret
WECHAT_APP_SECRET=your-wechat-app-secret
BACKEND_PUBLIC_BASE_URL=https://api.your-domain.com
OPENAI_API_BASE_URL=https://api.ads8260.win:8260/v1
OPENAI_OCR_MODEL=gpt-5.4-mini
OPENAI_API_KEY=your-new-server-side-key
```

Use a new LLM API key for deployment. Any key pasted into chat or local notes should be treated as exposed.

## 3. Start Services

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

The backend container runs Prisma migrations before it starts. Check health:

```bash
curl http://127.0.0.1:8787/api/health
curl https://api.your-domain.com/api/health
```

Expected response contains:

```json
{"data":{"ok":true,"service":"healthhelper-backend"}}
```

## 4. Backup

Back up both directories:

```text
data/postgres
data/uploads
```

PostgreSQL data is the source of truth for users, reports, OCR tasks, and health data. `data/uploads` stores uploaded report images for OCR.

## 5. Upgrade

After pulling new code:

```bash
docker compose up -d --build
docker compose logs -f backend
```

Migrations run automatically unless `RUN_PRISMA_MIGRATIONS=false`.

## 6. Mini Program Trial Release Steps

Before uploading the mini program:

1. Edit `miniprogram/utils/api-config.js`.
2. Replace `https://api.your-domain.com` in `DEPLOYED_BACKEND_BASE_URL` with your real HTTPS API domain.
3. In WeChat public platform, configure server domains:
   - `request` valid domain: `https://api.your-domain.com`
   - `uploadFile` valid domain: `https://api.your-domain.com`
   - `downloadFile` valid domain: `https://api.your-domain.com` if future previews/downloads use it
4. In WeChat DevTools, turn URL check back on for a release-like test.
5. Upload code as a trial/experience version.
6. Test on a phone:
   - login
   - create profile
   - upload a report photo
   - OCR recognition
   - edit/confirm
   - save to case folder
   - view health data and metric trend

`trial` and `release` mini program environments now force backend mode. Local `develop` still defaults to mock unless you set storage overrides in DevTools.

## 7. Known Limits For Home-Lab Trial

This setup is good enough for controlled trial users, but not ideal for broad production:

- local upload storage is a mounted directory, not object storage
- uptime depends on your home lab, power, router, and broadband
- public exposure requires careful firewall and proxy hardening
- formal launch should migrate to a cloud host and managed object storage

For production, keep the same Docker image and move PostgreSQL/upload storage to cloud-managed services or a cloud VM with backups.
