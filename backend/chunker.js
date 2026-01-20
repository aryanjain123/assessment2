/**
 * Text Chunking Module
 * Implements chunking strategy: 800-1200 tokens with 10-15% overlap
 * Stores metadata (source, title, section, position) for citations
 */

const { v4: uuidv4 } = require('uuid');

// Configuration
const CONFIG = {
    MIN_CHUNK_SIZE: 800,    // minimum tokens
    MAX_CHUNK_SIZE: 1200,   // maximum tokens
    OVERLAP_PERCENT: 0.12,  // 12% overlap
    CHARS_PER_TOKEN: 4      // rough estimate
};

/**
 * Estimate token count from text (rough approximation)
 */
function estimateTokens(text) {
    return Math.ceil(text.length / CONFIG.CHARS_PER_TOKEN);
}

/**
 * Split text into sentences for cleaner chunk boundaries
 */
function splitIntoSentences(text) {
    // Split on sentence-ending punctuation followed by space or newline
    return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
}

/**
 * Detect section headers in text
 */
function detectSections(text) {
    const sections = [];
    const lines = text.split('\n');
    let currentSection = 'Introduction';
    let currentPosition = 0;

    for (const line of lines) {
        // Detect markdown headers or ALL CAPS headers
        const headerMatch = line.match(/^#+\s+(.+)$/) ||
            (line.trim().length < 100 && line.trim() === line.trim().toUpperCase() && line.trim().length > 3);

        if (headerMatch) {
            currentSection = headerMatch[1] || line.trim();
        }

        sections.push({
            text: line,
            section: currentSection,
            position: currentPosition
        });
        currentPosition++;
    }

    return sections;
}

/**
 * Chunk text with overlap and metadata
 * @param {string} text - The text to chunk
 * @param {object} metadata - Document metadata (source, title)
 * @returns {Array} Array of chunk objects with text and metadata
 */
function chunkText(text, metadata = {}) {
    const chunks = [];
    const sentences = splitIntoSentences(text);

    if (sentences.length === 0) {
        return chunks;
    }

    const targetChunkTokens = (CONFIG.MIN_CHUNK_SIZE + CONFIG.MAX_CHUNK_SIZE) / 2;
    const overlapTokens = Math.floor(targetChunkTokens * CONFIG.OVERLAP_PERCENT);

    let currentChunk = [];
    let currentTokens = 0;
    let chunkPosition = 0;
    let overlapBuffer = [];
    let overlapTokenCount = 0;

    // Detect sections for better metadata
    const sectionMap = new Map();
    let currentSection = 'Content';
    for (const sentence of sentences) {
        // Simple section detection from sentence content
        if (sentence.match(/^#+\s+/) || (sentence.length < 80 && sentence === sentence.toUpperCase())) {
            currentSection = sentence.replace(/^#+\s+/, '').trim();
        }
        sectionMap.set(sentence, currentSection);
    }

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        const sentenceTokens = estimateTokens(sentence);

        // If adding this sentence exceeds max, finalize current chunk
        if (currentTokens + sentenceTokens > CONFIG.MAX_CHUNK_SIZE && currentChunk.length > 0) {
            // Create chunk
            const chunkText = currentChunk.join(' ');
            chunks.push({
                id: uuidv4(),
                text: chunkText,
                metadata: {
                    source: metadata.source || 'user_upload',
                    title: metadata.title || 'Untitled Document',
                    section: sectionMap.get(currentChunk[0]) || 'Content',
                    position: chunkPosition,
                    tokenEstimate: estimateTokens(chunkText),
                    charCount: chunkText.length
                }
            });

            chunkPosition++;

            // Calculate overlap - take last sentences up to overlap tokens
            overlapBuffer = [];
            overlapTokenCount = 0;
            for (let j = currentChunk.length - 1; j >= 0 && overlapTokenCount < overlapTokens; j--) {
                overlapBuffer.unshift(currentChunk[j]);
                overlapTokenCount += estimateTokens(currentChunk[j]);
            }

            // Start new chunk with overlap
            currentChunk = [...overlapBuffer];
            currentTokens = overlapTokenCount;
        }

        currentChunk.push(sentence);
        currentTokens += sentenceTokens;
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
        const chunkText = currentChunk.join(' ');
        chunks.push({
            id: uuidv4(),
            text: chunkText,
            metadata: {
                source: metadata.source || 'user_upload',
                title: metadata.title || 'Untitled Document',
                section: sectionMap.get(currentChunk[0]) || 'Content',
                position: chunkPosition,
                tokenEstimate: estimateTokens(chunkText),
                charCount: chunkText.length
            }
        });
    }

    return chunks;
}

/**
 * Get chunking configuration
 */
function getChunkingConfig() {
    return {
        minChunkSize: CONFIG.MIN_CHUNK_SIZE,
        maxChunkSize: CONFIG.MAX_CHUNK_SIZE,
        overlapPercent: CONFIG.OVERLAP_PERCENT * 100,
        charsPerToken: CONFIG.CHARS_PER_TOKEN
    };
}

module.exports = {
    chunkText,
    estimateTokens,
    getChunkingConfig
};
