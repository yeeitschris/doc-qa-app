from typing import Optional

import numpy as np
from anthropic import Anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Loaded once at startup (see note on /upload) — model load takes
# real time and memory, so we don't want to pay that cost per request.
embedder = SentenceTransformer("all-MiniLM-L6-v2")
anthropic_client = Anthropic()

# In-memory store: parallel lists of chunk text and chunk embeddings,
# index i in `chunks` corresponds to index i in `embeddings`. A list
# of dicts (one per chunk) would be more self-contained, but keeping
# embeddings as a single stacked array lets us hand the whole matrix
# to numpy for the similarity computation in one vectorized call
# instead of looping in Python.
chunks: list[str] = []
embeddings: Optional[np.ndarray] = None  # shape (num_chunks, embedding_dim)

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    words = text.split()
    if not words:
        return []

    result = []
    start = 0
    step = chunk_size - overlap
    while start < len(words):
        chunk_words = words[start : start + chunk_size]
        result.append(" ".join(chunk_words))
        if start + chunk_size >= len(words):
            break
        start += step
    return result


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    global embeddings

    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="Only .txt files are supported")

    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded text")

    new_chunks = chunk_text(text)
    if new_chunks:
        new_embeddings = embedder.encode(new_chunks, normalize_embeddings=True)
        chunks.extend(new_chunks)
        embeddings = new_embeddings if embeddings is None else np.vstack([embeddings, new_embeddings])

    return {"filename": file.filename, "num_chunks": len(new_chunks), "total_chunks": len(chunks)}


def top_k_chunks(query: str, k: int = 3) -> list[str]:
    if embeddings is None or len(chunks) == 0:
        return []

    query_embedding = embedder.encode(query, normalize_embeddings=True)
    # Embeddings are normalized, so the dot product equals cosine similarity.
    similarities = embeddings @ query_embedding
    top_indices = np.argsort(similarities)[::-1][:k]
    return [chunks[i] for i in top_indices]


class AskRequest(BaseModel):
    question: str


SYSTEM_PROMPT = """You are answering questions using ONLY the context provided below. \
Do not use any outside knowledge, even if you know the answer.

If the context does not contain enough information to answer the question, \
respond with exactly: "I don't have enough information to answer that."

Context:
{context}"""


@app.post("/ask")
async def ask(request: AskRequest):
    if not chunks:
        raise HTTPException(status_code=400, detail="No documents have been uploaded yet")

    relevant_chunks = top_k_chunks(request.question, k=3)
    context = "\n\n".join(relevant_chunks)

    response = anthropic_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT.format(context=context),
        messages=[{"role": "user", "content": request.question}],
    )

    return {"answer": response.content[0].text, "chunks": relevant_chunks}
