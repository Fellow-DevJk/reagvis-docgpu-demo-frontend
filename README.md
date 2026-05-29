# Reagvis DocGPU Demo Frontend

Static demo frontend for presentation/UAT.

## What it does

1. Upload up to 10 docs (`pdf/jpg/jpeg/png`)
2. Call `POST /uploads/presign` per file
3. Upload each file to S3 via presigned URL
4. Call `POST /jobs`
5. Poll `GET /jobs/{jobId}` until terminal
6. Fetch `GET /jobs/{jobId}/report`
7. Render styled forensic report preview
8. Export report JSON
9. Open printable report page for **Save as PDF**

## Run

Open `index.html` directly, or host the folder via any static hosting.

Input required:

- `API Base URL` (default: `https://api.verify.reagvis.com`)
- `Bearer Token` (tenant API key)
- Optional `x-origin-verify` (only when backend requires it)

## Notes

- Browser popup permission is required for printable PDF export page.
- If your hosting origin is not CORS-allowed by backend, browser calls fail.
- The demo renders report from `/jobs/{jobId}/report` JSON (operator view), not portal-only internals.
