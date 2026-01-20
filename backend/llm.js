/**
 * LLM Module - OpenRouter with xiaomi/mimo-v2-flash:free
 * Generates grounded answers with inline citations
 */

let initialized = false;

/**
 * Initialize OpenRouter client
 */
function initOpenRouter() {
    if (initialized) {
        return;
    }

    if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY is not set');
    }

    initialized = true;
    console.log('✅ OpenRouter client initialized (xiaomi/mimo-v2-flash:free)');
}

/**
 * Build the RAG prompt with context and citations
 */
function buildRAGPrompt(query, chunks) {
    const contextParts = chunks.map((chunk, idx) => {
        const citation = `[${idx + 1}]`;
        const metadata = chunk.metadata || {};
        return `${citation} Source: ${metadata.title || 'Document'} | Section: ${metadata.section || 'Content'}
${chunk.text}`;
    }).join('\n\n---\n\n');

    return `You are a helpful assistant that answers questions based on the provided context.
Your task is to provide accurate, well-structured answers using ONLY the information from the context below.

IMPORTANT RULES:
1. Use inline citations like [1], [2], etc. to reference the source of your information
2. If the context doesn't contain relevant information, say "I don't have enough information to answer this question based on the provided documents."
3. Be concise but comprehensive
4. If multiple sources support the same point, cite all of them (e.g., [1][2])
5. Do not make up information that isn't in the context

CONTEXT:
${contextParts}

---

USER QUESTION: ${query}

Please provide a well-structured answer with inline citations:`;
}

/**
 * Generate answer using OpenRouter with RAG context
 * @param {string} query - User's question
 * @param {Array} chunks - Relevant context chunks
 * @returns {Object} Generated answer with metadata
 */
async function generateAnswer(query, chunks) {
    initOpenRouter();

    const startTime = Date.now();

    // Handle no context case
    if (!chunks || chunks.length === 0) {
        return {
            answer: "I don't have any documents to search through. Please upload some text first using the upload feature.",
            citations: [],
            duration: Date.now() - startTime,
            tokensUsed: 0,
            noContext: true
        };
    }

    try {
        const prompt = buildRAGPrompt(query, chunks);

        // Estimate input tokens (rough)
        const inputTokens = Math.ceil(prompt.length / 4);

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

        let response;
        try {
            response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://assessment2-ocm4.onrender.com',
                    'X-Title': 'RAG Playground'
                },
                body: JSON.stringify({
                    model: 'xiaomi/mimo-v2-flash:free',
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                }),
                signal: controller.signal
            });
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error('Request timed out. The LLM service is taking too long to respond.');
            }
            throw new Error(`Network error connecting to LLM service: ${fetchError.message}`);
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorData = {};
            try {
                errorData = await response.json();
            } catch {
                // Ignore JSON parse errors
            }

            const errorMessage = errorData.error?.message || `OpenRouter API error: ${response.status}`;

            // Handle specific status codes
            if (response.status === 429) {
                return {
                    answer: "The LLM service is currently rate limited. Please wait a moment and try again.",
                    citations: [],
                    duration: Date.now() - startTime,
                    error: 'rate_limit',
                    model: 'xiaomi/mimo-v2-flash:free'
                };
            }

            if (response.status >= 500) {
                return {
                    answer: "The LLM service is temporarily unavailable. Please try again later.",
                    citations: [],
                    duration: Date.now() - startTime,
                    error: 'service_unavailable',
                    model: 'xiaomi/mimo-v2-flash:free'
                };
            }

            throw new Error(errorMessage);
        }

        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
            throw new Error('Invalid response from LLM service');
        }

        const answer = data.choices?.[0]?.message?.content || 'No response generated';

        const duration = Date.now() - startTime;

        // Estimate output tokens
        const outputTokens = Math.ceil(answer.length / 4);

        // Extract citation references from answer (with safe regex)
        let citationMatches = [];
        try {
            citationMatches = answer.match(/\[\d+\]/g) || [];
        } catch {
            // Ignore regex errors
        }

        const usedCitations = [...new Set(citationMatches.map(c => {
            const match = c.match(/\d+/);
            return match ? parseInt(match[0]) : 0;
        }).filter(n => n > 0))];

        // Map citations to source chunks
        const citations = usedCitations
            .filter(num => num <= chunks.length)
            .map(num => {
                const chunk = chunks[num - 1];
                return {
                    number: num,
                    text: chunk.text ? chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : '') : '',
                    source: chunk.metadata?.title || 'Document',
                    section: chunk.metadata?.section || 'Content'
                };
            });

        return {
            answer,
            citations,
            duration,
            tokensUsed: {
                input: inputTokens,
                output: outputTokens,
                total: inputTokens + outputTokens
            },
            model: 'xiaomi/mimo-v2-flash:free'
        };

    } catch (error) {
        console.error('OpenRouter generation error:', error);

        // Handle specific error cases
        if (error.message?.includes('quota') || error.message?.includes('rate') || error.message?.includes('429')) {
            return {
                answer: "I'm currently experiencing high demand. Please try again in a moment.",
                citations: [],
                duration: Date.now() - startTime,
                error: 'rate_limit',
                model: 'xiaomi/mimo-v2-flash:free'
            };
        }

        // For any other error, return a graceful error response instead of throwing
        return {
            answer: `Unable to generate answer: ${error.message}`,
            citations: [],
            duration: Date.now() - startTime,
            error: 'generation_error',
            model: 'xiaomi/mimo-v2-flash:free'
        };
    }
}

/**
 * Estimate cost for the query (free model = $0)
 */
function estimateCost(tokensUsed) {
    // Free model - no cost
    return {
        inputCost: '0.000000',
        outputCost: '0.000000',
        totalCost: '0.000000',
        currency: 'USD'
    };
}

/**
 * Get LLM configuration
 */
function getLLMConfig() {
    return {
        model: 'xiaomi/mimo-v2-flash:free',
        provider: 'OpenRouter',
        description: 'Free model via OpenRouter for RAG applications'
    };
}

module.exports = {
    generateAnswer,
    estimateCost,
    getLLMConfig
};
