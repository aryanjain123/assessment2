/**
 * Query Route
 * POST /api/query - RAG query with retrieval, reranking, and LLM generation
 */

const express = require('express');
const router = express.Router();
const { queryChunks } = require('../pinecone');
const { rerankChunks } = require('../reranker');
const { generateAnswer, estimateCost } = require('../llm');

/**
 * POST /api/query
 * Query documents with RAG pipeline
 */
router.post('/', async (req, res) => {
    const startTime = Date.now();
    const timing = {};

    try {
        const { query, topK = 10, topN = 5 } = req.body;

        // Validate input
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Missing or invalid query',
                message: 'Please provide a "query" field with your question'
            });
        }

        if (query.trim().length < 3) {
            return res.status(400).json({
                error: 'Query too short',
                message: 'Please provide at least 3 characters'
            });
        }

        console.log(`🔍 Query: "${query.substring(0, 50)}..."`);

        // Step 1: Retrieve from Pinecone
        const retrieveStart = Date.now();
        const retrievalResult = await queryChunks(query, topK);
        timing.retrieval = Date.now() - retrieveStart;

        console.log(`📚 Retrieved ${retrievalResult.chunks.length} chunks`);

        // Handle no results
        if (retrievalResult.chunks.length === 0) {
            return res.json({
                success: true,
                answer: "I don't have any documents to search through. Please upload some text first using the upload feature.",
                citations: [],
                sources: [],
                timing: {
                    totalMs: Date.now() - startTime,
                    retrievalMs: timing.retrieval
                },
                noDocuments: true
            });
        }

        // Step 2: Rerank with Cohere
        const rerankStart = Date.now();
        const rerankResult = await rerankChunks(query, retrievalResult.chunks, topN);
        timing.rerank = Date.now() - rerankStart;

        console.log(`🎯 Reranked to top ${rerankResult.chunks.length} chunks`);

        // Step 3: Generate answer with Gemini
        const generateStart = Date.now();
        const llmResult = await generateAnswer(query, rerankResult.chunks);
        timing.generation = Date.now() - generateStart;

        console.log(`💬 Answer generated (${llmResult.answer.length} chars)`);

        const totalTime = Date.now() - startTime;

        // Prepare sources for display
        const sources = rerankResult.chunks.map((chunk, idx) => ({
            number: idx + 1,
            title: chunk.metadata?.title || 'Document',
            section: chunk.metadata?.section || 'Content',
            text: chunk.text,
            relevanceScore: chunk.relevanceScore?.toFixed(4) || chunk.score?.toFixed(4),
            position: chunk.metadata?.position
        }));

        // Calculate cost estimate
        const costEstimate = llmResult.tokensUsed ? estimateCost(llmResult.tokensUsed) : null;

        res.json({
            success: true,
            answer: llmResult.answer,
            citations: llmResult.citations,
            sources: sources,
            timing: {
                totalMs: totalTime,
                retrievalMs: timing.retrieval,
                rerankMs: timing.rerank,
                generationMs: timing.generation
            },
            tokens: llmResult.tokensUsed,
            costEstimate: costEstimate,
            metadata: {
                query: query,
                chunksRetrieved: retrievalResult.chunks.length,
                chunksAfterRerank: rerankResult.chunks.length,
                model: llmResult.model,
                rerankFallback: rerankResult.fallback || false
            }
        });

    } catch (error) {
        console.error('Query error:', error);
        res.status(500).json({
            error: 'Query failed',
            message: error.message,
            timing: {
                totalMs: Date.now() - startTime,
                ...timing
            },
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router;
