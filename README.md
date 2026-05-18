# Reagvis DocGPU Demo Frontend

Minimal static frontend for demo/presentation:

1. Upload documents (max 10)
2. Call `POST /uploads/presign`
3. Upload to S3
4. Call `POST /jobs`
5. Poll `GET /jobs/{jobId}`

## Usage

Open `index.html` in a browser, then provide:

- API base URL (default `https://api.verify.reagvis.com`)
- Bearer token (`Bearer key_xxx.sk_live_xxx`)
- Files

## Important

If your hosting origin is not CORS-allowed by backend, browser calls will fail.
For direct execute-api calls, fill `x-origin-verify` if required by environment.
