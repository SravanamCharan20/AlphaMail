# Deployment Prep Notes

This project is ready to be containerized as a multi-service app.

## Services you will containerize

- `frontend`: Next.js app
- `backend`: Express API
- `worker`: BullMQ worker
- `mongodb`: MongoDB database
- `redis`: Redis for queues and socket pub/sub

## Important environment variables

### Backend

Copy `backend/.env.example` to `backend/.env` and fill in the real values.

- `PORT`
- `CLIENT_ORIGIN`
- `MONGO_URL`
- `REDIS_URL` or `REDIS_HOST` + `REDIS_PORT`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

### Frontend

Copy `frontend/.env.example` to `frontend/.env.local`.

- `NEXT_PUBLIC_API_BASE`

## Startup commands

### Local app processes

- Backend API: `npm --prefix backend run start`
- Background worker: `npm --prefix backend run worker:start`
- Frontend: `npm --prefix frontend run start`

### Container-friendly commands

- Frontend dev in a container: `npm --prefix frontend run dev:container`
- Frontend prod in a container: `npm --prefix frontend run start:container`

## Notes for Docker Compose

- The backend and worker must use the same Redis instance.
- The backend and worker must use the same MongoDB instance.
- In Compose, containers should talk to each other by service name, not `localhost`.
- Typical service-name URLs:
  - MongoDB: `mongodb://mongodb:27017/alphamail`
  - Redis: `redis://redis:6379`
- The browser should still talk to the backend through a host-exposed URL such as `http://localhost:9000`, so `NEXT_PUBLIC_API_BASE` usually stays host-based during local Docker development.
