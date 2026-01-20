/**
 * Upload Route
 * POST /api/upload - Process and store documents (text or PDF)
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
// pdf-parse v2.x exports PDFParse as a class
const { PDFParse } = require('pdf-parse');
const { chunkText, getChunkingConfig } = require('../chunker');
const { upsertChunks, getIndexStats } = require('../pinecone');

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept PDF files
        if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Helper to wrap multer for proper error handling
const uploadPdf = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error('Multer error:', err);
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        error: 'File too large',
                        message: 'File size must be less than 10MB'
                    });
                }
                return res.status(400).json({
                    error: 'Upload error',
                    message: err.message
                });
            }
            return res.status(400).json({
                error: 'File error',
                message: err.message
            });
        }
        next();
    });
};

/**
 * POST /api/upload
 * Upload text document for RAG processing
 */
router.post('/', async (req, res) => {
    const startTime = Date.now();

    try {
        const { text, title, source } = req.body;

        // Validate input
        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                error: 'Missing or invalid text',
                message: 'Please provide a "text" field with the document content'
            });
        }

        if (text.trim().length < 50) {
            return res.status(400).json({
                error: 'Text too short',
                message: 'Please provide at least 50 characters of text'
            });
        }

        console.log(`📄 Processing document: ${title || 'Untitled'} (${text.length} chars)`);

        // Chunk the text
        const metadata = {
            title: title || 'Uploaded Document',
            source: source || 'user_upload'
        };

        const chunks = chunkText(text, metadata);
        console.log(`✂️  Created ${chunks.length} chunks`);

        if (chunks.length === 0) {
            return res.status(400).json({
                error: 'No chunks created',
                message: 'The text could not be chunked properly'
            });
        }

        // Upsert to Pinecone
        const upsertResult = await upsertChunks(chunks);

        const duration = Date.now() - startTime;

        // Get updated stats
        let stats = null;
        try {
            stats = await getIndexStats();
        } catch (e) {
            console.log('Could not fetch index stats');
        }

        res.json({
            success: true,
            message: 'Document processed and stored successfully',
            details: {
                title: metadata.title,
                originalLength: text.length,
                chunksCreated: chunks.length,
                chunkingConfig: getChunkingConfig(),
                vectorsUpserted: upsertResult.upsertedCount,
                indexName: upsertResult.indexName
            },
            timing: {
                totalMs: duration,
                chunkingMs: upsertResult.duration ? duration - upsertResult.duration : null,
                upsertMs: upsertResult.duration
            },
            indexStats: stats
        });

    } catch (error) {
        console.error('Upload error:', error);

        // Check for rate limit error
        if (error.isRateLimit || error.status === 429 ||
            error.message?.includes('RESOURCE_EXHAUSTED') ||
            error.message?.includes('max tokens per minute')) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: 'You have exceeded the maximum tokens per minute for the embedding model. Please try uploading a smaller document.',
                isRateLimit: true
            });
        }

        res.status(500).json({
            error: 'Upload failed',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * POST /api/upload/pdf
 * Upload PDF file for RAG processing (text extraction only)
 */
router.post('/pdf', uploadPdf, async (req, res) => {
    const startTime = Date.now();

    console.log('📄 PDF upload request received');
    console.log('   - req.file:', req.file ? `${req.file.originalname} (${req.file.size} bytes)` : 'undefined');

    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please upload a PDF file'
            });
        }

        console.log(`📄 Processing PDF: ${req.file.originalname} (${req.file.size} bytes)`);

        // Parse PDF using PDFParse v2.x class API
        // Pass buffer via { data: buffer } option
        const pdfParser = new PDFParse({ data: req.file.buffer });
        const textResult = await pdfParser.getText();
        const text = textResult.text;
        const pdfInfo = await pdfParser.getInfo();
        const numpages = pdfInfo.numPages || pdfInfo.total || 0;
        await pdfParser.destroy();

        if (!text || text.trim().length < 50) {
            return res.status(400).json({
                error: 'PDF has insufficient text',
                message: 'The PDF must contain at least 50 characters of extractable text. Note: This tool only extracts text content, not images or scanned documents.'
            });
        }

        console.log(`📝 Extracted ${text.length} characters from ${numpages} pages`);

        // Chunk the text
        const metadata = {
            title: req.body.title || req.file.originalname.replace('.pdf', ''),
            source: 'pdf_upload',
            pages: numpages,
            pdfInfo: pdfInfo?.Title || null
        };

        const chunks = chunkText(text, metadata);
        console.log(`✂️  Created ${chunks.length} chunks`);

        if (chunks.length === 0) {
            return res.status(400).json({
                error: 'No chunks created',
                message: 'The PDF text could not be chunked properly'
            });
        }

        // Upsert to Pinecone
        const upsertResult = await upsertChunks(chunks);

        const duration = Date.now() - startTime;

        // Get updated stats
        let stats = null;
        try {
            stats = await getIndexStats();
        } catch (e) {
            console.log('Could not fetch index stats');
        }

        res.json({
            success: true,
            message: 'PDF processed and stored successfully',
            details: {
                filename: req.file.originalname,
                title: metadata.title,
                pages: numpages,
                originalLength: text.length,
                chunksCreated: chunks.length,
                chunkingConfig: getChunkingConfig(),
                vectorsUpserted: upsertResult.upsertedCount,
                indexName: upsertResult.indexName
            },
            timing: {
                totalMs: duration,
                parsingMs: null,
                upsertMs: upsertResult.duration
            },
            indexStats: stats
        });

    } catch (error) {
        console.error('PDF upload error:', error);

        // Check for rate limit error
        if (error.isRateLimit || error.status === 429 ||
            error.message?.includes('RESOURCE_EXHAUSTED') ||
            error.message?.includes('max tokens per minute')) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: 'You have exceeded the maximum tokens per minute for the embedding model. Please try uploading a smaller PDF file.',
                isRateLimit: true
            });
        }

        res.status(500).json({
            error: 'PDF upload failed',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * DELETE /api/upload
 * Clear all documents from the index
 */
router.delete('/', async (req, res) => {
    try {
        const { clearIndex } = require('../pinecone');
        await clearIndex();

        res.json({
            success: true,
            message: 'All documents cleared from index'
        });
    } catch (error) {
        console.error('Clear error:', error);
        res.status(500).json({
            error: 'Clear failed',
            message: error.message
        });
    }
});

module.exports = router;
