/**
 * Cohere Reranker Module
 * Uses rerank-english-v3.0 for improved retrieval accuracy
 */

const { CohereClient } = require('cohere-ai');

let cohere = null;

/**
 * Initialize Cohere client
 */
function initCohere() {
    if (cohere) {
        return cohere;
    }

    if (!process.env.COHERE_API_KEY) {
        throw new Error('COHERE_API_KEY is not set');
    }

    cohere = new CohereClient({
        token: process.env.COHERE_API_KEY
    });

    console.log('✅ Cohere client initialized');
    return cohere;
}

/**
 * Rerank retrieved chunks using Cohere
 * @param {string} query - The user query
 * @param {Array} chunks - Array of chunk objects with text
 * @param {number} topN - Number of top results to return after reranking
 * @returns {Array} Reranked chunks with relevance scores
 */
async function rerankChunks(query, chunks, topN = 5) {
    const client = initCohere();

    if (!chunks || chunks.length === 0) {
        return { chunks: [], duration: 0 };
    }

    const startTime = Date.now();

    try {
        // Prepare documents for reranking
        const documents = chunks.map(chunk => chunk.text);

        // Call Cohere rerank API
        const response = await client.rerank({
            model: 'rerank-english-v3.0',
            query: query,
            documents: documents,
            topN: Math.min(topN, chunks.length),
            returnDocuments: true
        });

        const duration = Date.now() - startTime;

        // Map reranked results back to original chunks
        const rerankedChunks = response.results.map(result => ({
            ...chunks[result.index],
            relevanceScore: result.relevanceScore,
            rerankIndex: result.index
        }));

        console.log(`✅ Reranked ${chunks.length} chunks to top ${rerankedChunks.length}`);

        return {
            chunks: rerankedChunks,
            duration,
            originalCount: chunks.length,
            rerankedCount: rerankedChunks.length
        };

    } catch (error) {
        console.error('Cohere rerank error:', error);

        // Fallback: return original chunks sorted by their retrieval score
        console.log('⚠️  Falling back to retrieval scores');
        const sortedChunks = [...chunks]
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, topN);

        return {
            chunks: sortedChunks,
            duration: Date.now() - startTime,
            originalCount: chunks.length,
            rerankedCount: sortedChunks.length,
            fallback: true
        };
    }
}

/**
 * Get reranker configuration
 */
function getRerankerConfig() {
    return {
        model: 'rerank-english-v3.0',
        provider: 'Cohere',
        description: 'English language reranker for improved retrieval accuracy'
    };
}

module.exports = {
    rerankChunks,
    getRerankerConfig
};
