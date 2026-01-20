Goal: Build and host a small RAG app: users input text (upload file is optional) from the frontend, you store it in a cloud-hosted vector DB, retrieve the most relevant chunks with a retriever + reranker, and answer the query via an LLM. Show citations.
Requirements
1. Vector database (hosted)
a. Use any cloud option (Pinecone).
b. Document index/collection name, dimensionality, and upsert strategy.
2. Embeddings & Chunking
a. Use any embedding model (use the pinecone hosted llama-text-embed-v2 model for embedding (that is we want the pinecone itself to provide the embedding model and handle the embedding process) ).
b. Implement a clear chunking strategy (size & overlap; e.g., 800–1,200 tokens with 10–15% overlap).
c. Store metadata (source, title, section, position) for later citation.
3. Retriever + Reranker
a. Top-k retrieval (MMR or similar) from vector DB.
b. Apply a reranker (use cohere reranker) before answering.
4. LLM & Answering
a. Use any provider (use gemini-2.5-flash-lite for the llm).
b. Generate a grounded answer with inline citations (e.g., [1], [2]) that map to source snippets shown below the answer.
c. Handle no-answer cases gracefully.
5. Frontend
a. Upload/paste area for text, a query box, and an answers panel with citations & sources.
b. Show simple request timing and token/cost estimates (rough is fine).
6. Hosting & Docs
a. Deploy on a free host (e.g., Vercel/Netlify/Render/HF Spaces/Railway/Fly).
b. Keep API keys server-side; provide .env.example.
c. README with architecture diagram, chunking params, retriever/reranker settings, providers used, and quick-start.
d. Add a Remarks section if you hit provider limits or made tradeoffs.
Acceptance Criteria
Working URL; first screen loads without console errors.
Query → retrieved chunks → reranked → LLM answer with citations visible.
Minimal eval: include 5 Q/A pairs (gold set) and a short note on precision/recall or success rate.
Submission Checklist (both tracks)
Live URL(s)
Public GitHub repo
README with setup, architecture, and resume link
Clear schema (Track A) / index config (Track B)
"Remarks" section (limits, trade-offs, what you’d do next)
Disqualifiers
Broken/non-loading URL, missing README, or no schema/index details.
No working query flow (Track A filters / Track B retrieval → rerank → answer).
Obvious plagiarism (copy-paste repos without attribution or understanding).
Notes for Candidates (fairness & scope)
Keep scope small but production-minded: proper errors, env vars, basic logging.
You may use templates/boilerplates; cite them.
Aim for 2–6 hours of focused effort within the 72-hour window.
