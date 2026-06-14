# iTechArena ERP — Frontend (React + Vite, Netlify-ready)

Talks to the Inventory ERP backend. Covers login (token refresh), dashboard,
products, inventory stock movements, and IMEI receive — plus live stock updates
over Socket.IO.

## Run locally
```bash
cp .env.example .env        # set VITE_API_URL to your backend, e.g. http://localhost:8080/api/v1
npm install
npm run dev                 # http://localhost:5173
```

## Deploy to Netlify
1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import from GitHub**, pick the repo.
3. Build settings are auto-detected from `netlify.toml` (build `npm run build`,
   publish `dist`).
4. Add an environment variable **`VITE_API_URL`** = your deployed backend URL
   (e.g. `https://your-backend.up.railway.app/api/v1`). Redeploy.

## Notes
- The backend must allow this Netlify origin in `CORS_ORIGINS`.
- Access token is held in memory; the refresh token is in `localStorage` so a
  page reload restores the session via silent refresh.
