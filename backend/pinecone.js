/**
 * Pinecone Vector Database Module
 * Uses Pinecone's hosted llama-text-embed-v2 for embeddings via Inference API
 */

const { Pinecone } = require('@pinecone-database/pinecone');

// Initialize clients
let pinecone = null;
let index = null;

// Embedding model configuration
const EMBEDDING_MODEL = 'llama-text-embed-v2';
const EMBEDDING_DIMENSION = 1024;

/**
 * Initialize Pinecone connection
 */
async function initPinecone() {
    if (pinecone && index) {
        return { pinecone, index };
    }

    if (!process.env.PINECONE_API_KEY) {
        throw new Error('PINECONE_API_KEY is not set');
    }

    // Initialize Pinecone
    pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY
    });

    const indexName = process.env.PINECONE_INDEX || 'rag-assessment';

    try {
        const indexes = await pinecone.listIndexes();
        const indexExists = indexes.indexes?.some(idx => idx.name === indexName);

        if (!indexExists) {
            console.log(`⚠️  Index '${indexName}' not found. Creating...`);
            await pinecone.createIndex({
                name: indexName,
                dimension: EMBEDDING_DIMENSION,
                metric: 'cosine',
                spec: {
                    serverless: {
                        cloud: 'aws',
                        region: 'us-east-1'
                    }
                }
            });
            console.log(`✅ Index '${indexName}' created. Waiting for it to be ready...`);

            // Wait for index to be ready
            await new Promise(resolve => setTimeout(resolve, 60000));
        }

        index = pinecone.index(indexName);
        console.log(`✅ Connected to Pinecone index: ${indexName}`);

    } catch (error) {
        console.error('Pinecone initialization error:', error);
        throw error;
    }

    return { pinecone, index };
}

/**
 * Generate embeddings using Pinecone's hosted llama-text-embed-v2 model
 * @param {string[]} texts - Array of texts to embed
 * @returns {number[][]} Array of embedding vectors
 */
async function generateEmbeddings(texts) {
    await initPinecone();

    const embeddings = [];

    // Process in batches to respect API limits
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        try {
            const response = await pinecone.inference.embed(
                EMBEDDING_MODEL,
                batch,
                { inputType: 'passage' }
            );

            // Extract embedding values
            for (const embedding of response.data) {
                embeddings.push(embedding.values);
            }
        } catch (error) {
            // Check for rate limit error (429)
            if (error.status === 429 ||
                error.message?.includes('429') ||
                error.message?.includes('RESOURCE_EXHAUSTED') ||
                error.message?.includes('max tokens per minute')) {
                const rateLimitError = new Error('Rate limit reached: You have exceeded the maximum tokens per minute for the embedding model. Please try with a smaller PDF file.');
                rateLimitError.isRateLimit = true;
                rateLimitError.status = 429;
                throw rateLimitError;
            }
            throw error;
        }
    }

    return embeddings;
}

/**
 * Generate embedding for a single query
 * @param {string} text - Query text
 * @returns {number[]} Embedding vector
 */
async function generateQueryEmbedding(text) {
    try {
        await initPinecone();

        const response = await pinecone.inference.embed(
            EMBEDDING_MODEL,
            [text],
            { inputType: 'query' }
        );

        if (!response.data || !response.data[0] || !response.data[0].values) {
            throw new Error('Invalid embedding response from Pinecone');
        }

        return response.data[0].values;
    } catch (error) {
        console.error('Error generating query embedding:', error);

        // Check for rate limit
        if (error.status === 429 || error.message?.includes('429')) {
            const rateLimitError = new Error('Rate limit exceeded for embedding API');
            rateLimitError.isRateLimit = true;
            rateLimitError.status = 429;
            throw rateLimitError;
        }

        throw error;
    }
}

/**
 * Upsert chunks to Pinecone
 * @param {Array} chunks - Array of chunk objects with text and metadata
 * @returns {Object} Upsert result
 */
async function upsertChunks(chunks) {
    await initPinecone();

    const startTime = Date.now();

    // Generate embeddings using Pinecone's inference API
    console.log(`🔄 Generating embeddings for ${chunks.length} chunks using ${EMBEDDING_MODEL}...`);
    const texts = chunks.map(c => c.text);
    const embeddings = await generateEmbeddings(texts);

    console.log(`✅ Generated ${embeddings.length} embeddings`);

    // Prepare vectors for upsert
    const vectors = chunks.map((chunk, i) => ({
        id: chunk.id,
        values: embeddings[i],
        metadata: {
            ...chunk.metadata,
            text: chunk.text
        }
    }));

    // Upsert in batches of 100
    const batchSize = 100;
    let upsertedCount = 0;

    for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await index.upsert(batch);
        upsertedCount += batch.length;
        console.log(`Upserted ${upsertedCount}/${vectors.length} chunks`);
    }

    const duration = Date.now() - startTime;

    return {
        upsertedCount,
        duration,
        indexName: process.env.PINECONE_INDEX || 'rag-assessment',
        embeddingModel: EMBEDDING_MODEL
    };
}

/**
 * Query Pinecone for similar chunks
 * @param {string} query - Query text
 * @param {number} topK - Number of results to return
 * @returns {Array} Array of matching chunks with scores
 */
async function queryChunks(query, topK = 10) {
    try {
        await initPinecone();

        const startTime = Date.now();

        // Generate embedding for query using Pinecone's inference API
        let queryEmbedding;
        try {
            queryEmbedding = await generateQueryEmbedding(query);
        } catch (embedError) {
            console.error('Error generating query embedding:', embedError);
            throw new Error(`Failed to generate query embedding: ${embedError.message}`);
        }

        // Query Pinecone
        let results;
        try {
            results = await index.query({
                vector: queryEmbedding,
                topK,
                includeMetadata: true
            });
        } catch (queryError) {
            console.error('Error querying Pinecone:', queryError);
            throw new Error(`Failed to query vector database: ${queryError.message}`);
        }

        const duration = Date.now() - startTime;

        // Format results
        const chunks = (results.matches || []).map((match, idx) => ({
            id: match.id,
            score: match.score,
            text: match.metadata?.text || '',
            metadata: {
                source: match.metadata?.source || '',
                title: match.metadata?.title || '',
                section: match.metadata?.section || '',
                position: match.metadata?.position || idx
            }
        }));

        return {
            chunks,
            duration,
            queryTokens: Math.ceil(query.length / 4)
        };
    } catch (error) {
        console.error('queryChunks error:', error);
        throw error;
    }
}

/**
 * Delete all vectors from the index (for cleanup)
 */
async function clearIndex() {
    await initPinecone();

    try {
        await index.deleteAll();
        console.log('✅ Index cleared');
        return { success: true };
    } catch (error) {
        console.error('Error clearing index:', error);
        throw error;
    }
}

/**
 * Get index stats
 */
async function getIndexStats() {
    await initPinecone();

    try {
        const stats = await index.describeIndexStats();
        return stats;
    } catch (error) {
        console.error('Error getting index stats:', error);
        throw error;
    }
}

/**
 * Get list of unique uploaded documents from Pinecone metadata
 * @returns {Array} Array of unique documents with their metadata
 */
async function getUploadedDocuments() {
    await initPinecone();

    try {
        // Query with a dummy vector to get all vectors with metadata
        // We use a zero vector since we just want the metadata
        const dummyVector = new Array(EMBEDDING_DIMENSION).fill(0);

        const results = await index.query({
            vector: dummyVector,
            topK: 10000, // Get as many as possible
            includeMetadata: true
        });

        // Extract unique documents from metadata
        const documentsMap = new Map();

        for (const match of (results.matches || [])) {
            const metadata = match.metadata || {};
            const title = metadata.title || 'Untitled';
            const source = metadata.source || 'unknown';

            // Use title as unique key
            if (!documentsMap.has(title)) {
                documentsMap.set(title, {
                    title,
                    source,
                    pages: metadata.pages || null,
                    chunksCount: 1,
                    firstChunkId: match.id
                });
            } else {
                // Increment chunk count for existing document
                documentsMap.get(title).chunksCount++;
            }
        }

        return Array.from(documentsMap.values());
    } catch (error) {
        console.error('Error getting uploaded documents:', error);
        return [];
    }
}

module.exports = {
    initPinecone,
    upsertChunks,
    queryChunks,
    clearIndex,
    getIndexStats,
    getUploadedDocuments,
    EMBEDDING_MODEL
};
