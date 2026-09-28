# Persona Chat (Next.js)

This project is your archived `persona-chat.jsx` migrated to a Next.js app so it can be deployed on Vercel from GitHub.

## 1) Install and run locally

```bash
npm install
```

Create `.env.local`:

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

Start dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## 2) Deploy with GitHub + Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, import that GitHub repo.
3. Add environment variables in Vercel Project Settings:
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL` (optional, defaults to `claude-sonnet-4-20250514`)
4. Deploy.

## Notes

- The client now calls `POST /api/chat`.
- Anthropic API key is server-side only (safe for Vercel hosting).

## 3) PR review automation MVP

This repo now includes a comment-only GitHub webhook endpoint at `POST /api/github/pr-review`.

### What it does

- accepts GitHub `pull_request` webhooks for `opened` and `synchronize`
- verifies the `x-hub-signature-256` header with `GITHUB_WEBHOOK_SECRET`
- fetches the PR files, commits, and check status from GitHub
- sends structured PR context to Claude using the existing Anthropic API setup
- posts one deduplicated PR comment per head SHA with review feedback

### Required environment variables

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-sonnet-4-20250514
PR_AUTOMATION_ENABLED=true
GITHUB_TOKEN=github_token_with_pull_request_comment_access
GITHUB_WEBHOOK_SECRET=replace_with_a_random_secret
PR_AUTOMATION_BOT_NAME=Claude PR MVP
```

### GitHub webhook setup

1. Create a webhook pointing to `https://your-deployment.example.com/api/github/pr-review`
2. Choose `application/json`
3. Set the same secret value used in `GITHUB_WEBHOOK_SECRET`
4. Subscribe to the **Pull requests** event

### MVP safety limits

- This MVP only comments on PRs; it does not commit, push, or merge changes.
- It ignores repeated deliveries for the same PR head SHA once a review comment has already been posted.
- Large PR context is trimmed before sending it to Claude to keep the review focused and bounded.