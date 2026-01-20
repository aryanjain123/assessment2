/**
 * Health Route
 * GET /api/health - Service health check
 */

const express = require('express');
const router = express.Router();
const { getChunkingConfig } = require('../chunker');
const { getRerankerConfig } = require('../reranker');
const { getLLMConfig } = require('../llm');

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/', async (req, res) => {
    const startTime = Date.now();

    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
            pinecone: {
                status: process.env.PINECONE_API_KEY ? 'configured' : 'missing_key',
                index: process.env.PINECONE_INDEX || 'rag-assessment'
            },
            cohere: {
                status: process.env.COHERE_API_KEY ? 'configured' : 'missing_key',
                ...getRerankerConfig()
            },
            gemini: {
                status: process.env.GEMINI_API_KEY ? 'configured' : 'missing_key',
                ...getLLMConfig()
            }
        },
        config: {
            chunking: getChunkingConfig()
        },
        responseTime: Date.now() - startTime
    };

    // Check if any required services are missing
    const missingServices = Object.entries(health.services)
        .filter(([_, service]) => service.status === 'missing_key')
        .map(([name]) => name);

    if (missingServices.length > 0) {
        health.status = 'degraded';
        health.warnings = [`Missing API keys for: ${missingServices.join(', ')}`];
    }

    res.json(health);
});

/**
 * GET /api/health/ready
 * Readiness check - verifies all services are ready
 */
router.get('/ready', async (req, res) => {
    const checks = {
        pinecone: !!process.env.PINECONE_API_KEY,
        cohere: !!process.env.COHERE_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY
    };

    const allReady = Object.values(checks).every(v => v);

    if (allReady) {
        res.json({ ready: true, checks });
    } else {
        res.status(503).json({ ready: false, checks });
    }
});

module.exports = router;
