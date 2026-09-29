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

## 3) Automatic updates from `updates/`

Upload `updates/updates.txt` or `updates/updates.pdf` (downloaded from a persona's MyComputer)
and push to `main`. The workflow `.github/workflows/updates-to-pr.yml` then:

1. diffs `updates/` to find the new requests,
2. runs Claude Code to implement them, build-check, and tick them `[x]` in the request file,
3. opens a `[updates-bot]` PR, which CodeRabbit reviews automatically,
4. waits for you to merge it manually — merging deploys to Vercel.

Setup (once): add `ANTHROPIC_API_KEY` under GitHub → Settings → Secrets and variables → Actions,
and under Settings → Actions → General enable "Allow GitHub Actions to create and approve pull requests".
You can also run it manually from the Actions tab (it then picks up to 3 open `[ ]` items).
