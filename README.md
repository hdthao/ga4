# GA4 React Report

Dashboard React cho du lieu GA4, chuyen tu script `ga4_report.py`.

## Chay local

```bash
npm install
npm run dev
```

Mo:

- React UI: http://localhost:5173
- API local: http://localhost:5174/api/config

Neu UI bao `Failed to fetch`, thuong la server API `5174` chua chay. Dung terminal dang chay app roi chay lai `npm run dev`.

## Cau hinh local

File `.env` dang tro ve service account JSON o thu muc cha:

```env
GA4_PROPERTY_ID=540979592
GOOGLE_APPLICATION_CREDENTIALS=../ga-analytic-505616-cafd8fd84be8.json
GA4_HOSTNAME_FILTER=
GA4_SITE_TITLE=noticias.storymyst.com
PORT=5174
```

De loc co dinh mot hostname:

```env
GA4_HOSTNAME_FILTER=noticias.storymyst.com
```

Credential chi duoc doc o backend, khong dua vao bundle React.

## Deploy Vercel

Backend GA4 da duoc chuyen thanh Vercel Serverless Functions trong thu muc `api/`.

Tren Vercel, dat Environment Variables:

```env
GA4_PROPERTY_ID=540979592
GA4_SITE_TITLE=noticias.storymyst.com
GA4_HOSTNAME_FILTER=
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
```

Khong upload file service account JSON len Vercel. Dan toan bo noi dung JSON vao `GOOGLE_APPLICATION_CREDENTIALS_JSON`, hoac encode base64 roi dung:

```env
GOOGLE_APPLICATION_CREDENTIALS_BASE64=...
```

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

Dropdown GA4 property dung Google Analytics Admin API. Neu API bao loi `Google Analytics Admin API has not been used... or it is disabled`, bat `analyticsadmin.googleapis.com` cho project chua service account.
