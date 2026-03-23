# Render + Vercel Deployment Notes

## Recommended architecture

- Vercel hosts the Next.js frontend.
- Render hosts the backend API as a Docker web service.
- Render hosts the BullMQ process as a Docker background worker.
- Render Key Value stores queues and pub/sub state.
- MongoDB Atlas stores application data.

This repo now includes:

- [render.yaml](/Users/charan/Desktop/AlphaMail/render.yaml) for Render Blueprints
- [backend/Dockerfile](/Users/charan/Desktop/AlphaMail/backend/Dockerfile) with Python support for embeddings

## Why MongoDB Atlas is recommended here

Render supports connecting to Atlas directly, and it is simpler than self-hosting MongoDB unless you specifically want to operate your own database.

## Why Render Key Value uses a paid plan here

The Blueprint now uses the `starter` plan for Render Key Value instead of `free`.

That is intentional for deployment readiness. Render's free Key Value tier does not include persistent storage, which means queued jobs can be lost if the instance restarts. This app uses BullMQ, so persistence is the safer default.

## Variables you must set during Render creation

Render will prompt for these values because they are marked `sync: false` in `render.yaml`:

- `CLIENT_ORIGIN`
  - Example: `https://your-frontend.vercel.app`
- `MONGO_URL`
  - Example: your MongoDB Atlas connection string
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
  - Example: `https://your-backend-name.onrender.com/googleAuth/google/callback`
- `PUBSUB_TOPIC`
- `PUBSUB_PUSH_SERVICE_ACCOUNT`
- `PUBSUB_PUSH_AUDIENCE`

## Variables you must set in Vercel

- `NEXT_PUBLIC_API_BASE`
  - Example: `https://your-backend-name.onrender.com`

## Important embedding note

The backend image now installs Python and the embedding dependencies, so `python3` is available when the Node backend starts `workers/embedding_worker.py`.

The embedding model still downloads on first use. On Render, the filesystem is ephemeral, so a fresh instance may need to download the model again after redeploys or cold starts.

Render Key Value is wired through `REDIS_HOST` and `REDIS_PORT` in [render.yaml](/Users/charan/Desktop/AlphaMail/render.yaml), which matches Render's documented Blueprint service references for Key Value instances.
