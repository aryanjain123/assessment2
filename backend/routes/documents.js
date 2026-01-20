/**
 * Documents Route
 * GET /api/documents - Get list of uploaded documents
 */

const express = require('express');
const router = express.Router();
const { getUploadedDocuments, getIndexStats } = require('../pinecone');

/**
 * GET /api/documents
 * Returns list of all uploaded and processed documents
 */
router.get('/', async (req, res) => {
    try {
        const [documents, stats] = await Promise.all([
            getUploadedDocuments(),
            getIndexStats()
        ]);

        res.json({
            success: true,
            documents,
            totalVectors: stats?.totalRecordCount || 0,
            indexStats: stats
        });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({
            error: 'Failed to fetch documents',
            message: error.message
        });
    }
});

module.exports = router;
