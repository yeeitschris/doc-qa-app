# doc-qa-app

## What this is
A minimal RAG (Retrieval-Augmented Generation) document Q&A app: upload a `.txt` file, ask questions about it, get answers grounded only in that file's content, with the retrieved chunks shown alongside the answer. Built quickly via Claude Code with minimal manual input, as a real working artifact to discuss in a Seekr AI interview — not a production system.

## Stack
- Backend: FastAPI, `sentence-transformers` (`all-MiniLM-L6-v2`, local embedding model), Anthropic API (`claude-sonnet-4-6`), numpy
- Frontend: React 19 + Vite

## Architecture

### Backend (`backend/main.py`)
- `/upload` — accepts `.txt` only, requires UTF-8, chunks the text, embeds the chunks, appends to global in-memory state (`chunks: list[str]`, `embeddings: np.ndarray`)
- `/ask` — embeds the question, retrieves top-3 chunks via `top_k_chunks()`, formats `SYSTEM_PROMPT` with those chunks as context, calls the Anthropic API, returns `{answer, chunks}`
- Chunking: word-based sliding window, `CHUNK_SIZE=500` words, `CHUNK_OVERLAP=50` words (step=450) — overlap so an answer straddling a chunk boundary isn't lost
- Similarity: embeddings are normalized at encode time (`normalize_embeddings=True`), so cosine similarity reduces to a single vectorized dot product (`embeddings @ query_embedding`); top-k via `np.argsort`, brute-force over the full matrix
- Storage: parallel structures (`chunks` list + stacked `embeddings` matrix) rather than one list of dicts, so the similarity computation is one numpy call instead of a Python loop. Tradeoff: no per-chunk metadata — can't trace a chunk back to a specific source file/page
- Grounding: `SYSTEM_PROMPT` puts retrieved context in the *system* message (not appended to the user's question), instructs the model to use ONLY that context "even if you know the answer," and specifies an exact, deterministic refusal string when context is insufficient
- State is global, in-memory, single-process — resets on restart, no persistence layer

### Frontend (`frontend/src/App.jsx`)
- Two-step UI: upload, then ask
- Expandable "Context used" section shows the actual retrieved chunks per answer
- `API_BASE` hardcoded to `http://127.0.0.1:8000` — local dev only, no env-based config

## Known limitations (deliberate, undocumented elsewhere — not yet addressed)
- `.txt` ingestion only, no PDF/DOCX parsing
- No similarity/relevance threshold — always returns top-3 chunks even when nothing is actually relevant
- No multi-document source attribution
- No persistence (in-memory only)
- No retrieval-quality evaluation or automated tests
- Brute-force top-k won't scale past a small corpus without a real vector index (FAISS, pgvector, etc.)

## Known repo issue (found on review — not fixed automatically)
`frontend/node_modules` and `frontend/dist` are committed to git. There's no `frontend/.gitignore` and no root-level `.gitignore` — only `backend/.gitignore` (covers `venv/` and `.env`, but only applies within `backend/`). Roughly 4,250 of the ~4,253 files tracked in the repo are `node_modules`/`dist` noise, already pushed to `origin/main` on GitHub.

Fix, if wanted: add a root `.gitignore` (or `frontend/.gitignore`) covering `node_modules/` and `dist/`, then `git rm -r --cached frontend/node_modules frontend/dist` and commit/push. Not done here — confirm before rewriting tracked repo state or pushing.

## Security
- `backend/.env` holds the Anthropic API key. Gitignored via `backend/.gitignore`, confirmed **not** tracked in git as of this review.
- Never paste the key into chat, frontend code, or a commit.
- Setting `ANTHROPIC_API_KEY` as a global shell env var also affects Claude Code's own billing — keep it scoped to `backend/.env` via `python-dotenv` rather than exporting it globally.

## Why this exists
Built to backstop an interview conversation about RAG for Seekr AI, whose actual product (SeekrFlow) is a fine-tuning + RAG hybrid platform for domain-specific enterprise models. This app is intentionally the "naive RAG" baseline — small enough to fully understand end to end, with a known, articulable set of limitations, rather than something more polished but not actually understood.
