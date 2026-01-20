# RAG Playground

A full-stack RAG (Retrieval-Augmented Generation) application built with Pinecone, Cohere, and Gemini.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Frontend                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────────┐  │
│  │ Upload UI   │  │  Query Box   │  │   Answer + Citations Panel    │  │
│  └─────────────┘  └──────────────┘  └───────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ REST API
┌──────────────────────────────▼──────────────────────────────────────────┐
│                           Backend (Express.js)                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │   Chunker   │→ │   Pinecone   │→ │   Reranker   │→ │     LLM     │  │
│  │ 800-1200tok │  │ Top-10 MMR   │  │    Cohere    │  │   Gemini    │  │
│  └─────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd assessment2/backend
npm install
```

### 2. Configure Environment

Create `.env` file with your API keys:

```
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=rag-assessment
COHERE_API_KEY=your_cohere_api_key
GEMINI_API_KEY=your_gemini_api_key
PORT=3000
```

### 3. Run the Server

```bash
npm start
```

Visit `http://localhost:3000`

## 📋 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload and process documents |
| POST | `/api/query` | Query with RAG pipeline |
| GET | `/api/health` | Service health check |
| DELETE | `/api/upload` | Clear all documents |

## ⚙️ Configuration

### Chunking Parameters
- **Size**: 800-1200 tokens (target ~1000)
- **Overlap**: 10-15% between chunks
- **Token Estimation**: ~4 characters per token

### Retriever Settings
- **Provider**: Pinecone (serverless)
- **Embedding Model**: `llama-text-embed-v2` (hosted by Pinecone)
- **Dimension**: 1024
- **Top-K**: 10 initial retrieval

### Reranker Settings
- **Provider**: Cohere
- **Model**: `rerank-english-v3.0`
- **Top-N**: 5 after reranking

### LLM Settings
- **Provider**: Google AI
- **Model**: `gemini-2.5-flash-lite`
- **Features**: Inline citations, grounded answers

## 📊 Evaluation

See [evaluation.md](./evaluation.md) for:
- 5 Q/A gold set pairs
- Precision/recall observations
- Success rate metrics

## ⚠️ Remarks

### Provider Limits
- **Pinecone Free Tier**: 1 index, 100k vectors
- **Cohere Free Tier**: 100 calls/minute
- **Gemini Free Tier**: 15 RPM, 1M tokens/day

### Trade-offs Made
1. **Token Estimation**: Using character count / 4 for rough estimates
2. **Single Index**: All documents go to one Pinecone index

### Future Improvements
- [ ] File upload (PDF, DOCX, TXT)
- [ ] Multi-document namespace support
- [ ] Caching for repeated queries
- [ ] Streaming responses
- [ ] Better token counting with tiktoken

## 📁 Project Structure

```
assessment2/
├── backend/
│   ├── server.js        # Express server
│   ├── chunker.js       # Text chunking
│   ├── pinecone.js      # Vector DB integration
│   ├── reranker.js      # Cohere reranker
│   ├── llm.js           # Gemini LLM
│   └── routes/
│       ├── upload.js    # Upload endpoint
│       ├── query.js     # Query endpoint
│       └── health.js    # Health check
├── frontend/
│   ├── index.html       # UI structure
│   ├── styles.css       # Dark theme styling
│   └── app.js           # Frontend logic
├── .env.example         # Environment template
├── evaluation.md        # Q/A evaluation
└── README.md            # This file
```

## 🔗 Resume Link

[Your Resume Link Here]

---

Built with ❤️ using Pinecone • Cohere • Gemini
