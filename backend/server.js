require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const uploadRoutes = require('./routes/upload');
const queryRoutes = require('./routes/query');
const healthRoutes = require('./routes/health');
const documentsRoutes = require('./routes/documents');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// Middleware
// ==========================================

// CORS configuration - allow all origins with proper preflight handling
const corsOptions = {
    origin: true, // Reflect the request origin (allows any origin with credentials)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 200, // Some legacy browsers choke on 204
    preflightContinue: false
};

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Apply CORS to all routes
app.use(cors(corsOptions));

// Body parser with error handling
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({ error: 'Invalid JSON', message: e.message });
            throw new Error('Invalid JSON');
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.path.startsWith('/api')) {
            console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
        }
    });
    next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// ==========================================
// API Routes
// ==========================================
app.use('/api/upload', uploadRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/documents', documentsRoutes);

// ==========================================
// Catch-all and Error Handlers
// ==========================================

// Serve frontend for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `API endpoint ${req.method} ${req.originalUrl} not found`
    });
});

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack || err);

    // Handle specific error types
    if (err.name === 'SyntaxError' && err.status === 400) {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid JSON in request body'
        });
    }

    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Payload Too Large',
            message: 'Request body exceeds the 10MB limit'
        });
    }

    // Default error response
    res.status(err.status || 500).json({
        error: err.name || 'Internal Server Error',
        message: process.env.NODE_ENV === 'production'
            ? 'Something went wrong. Please try again later.'
            : err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// ==========================================
// Process-level Error Handlers
// ==========================================

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Log the error but don't exit - let the process manager handle restarts
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Log the error but don't exit - let the process manager handle restarts
});

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 RAG Server running on http://localhost:${PORT}`);
    console.log(`📚 API Documentation:`);
    console.log(`   - POST /api/upload     - Upload text documents`);
    console.log(`   - POST /api/upload/pdf - Upload PDF files`);
    console.log(`   - POST /api/query      - Query with RAG`);
    console.log(`   - GET  /api/documents  - List uploaded documents`);
    console.log(`   - GET  /api/health     - Health check`);
});

module.exports = app;
