# Deployment guide

This project includes a GitHub Actions workflow to build and push Docker images for the backend and frontend. Follow the steps below to enable CI builds and perform production deploys using pushed images.

1) Configure GitHub secrets in your repository settings:
   - `DOCKERHUB_USERNAME` — your Docker Hub username
   - `DOCKERHUB_TOKEN` — a Docker Hub access token (or password)

2) Push to `main` (or run workflow manually) to trigger the workflow that builds and pushes images:

   - Workflow: `.github/workflows/docker-image.yml`

3) Run production compose using the pushed images on your host or VM:

```bash
# on your server after logging in and pulling the repo
export DOCKERHUB_USERNAME=yourdockeruser
export OPENAI_API_KEY=sk-...
docker compose -f docker-compose.prod.yml up -d
```

4) Health and logs

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
```

Notes:
- The CI workflow tags images as `:latest`; change the workflow to include commit sha tags if you want immutable releases.
- For frontend hosting with Vercel, deploy the `frontend` directory directly and set `NEXT_PUBLIC_REST_URL` to the backend URL.
- For cloud run/containers, push images to a registry (Docker Hub, GCR, ECR) and deploy with your provider's run service.
