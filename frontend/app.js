/**
 * RAG Playground - Frontend Application
 * Handles document upload, querying, and result display
 * With comprehensive error handling
 */

// API base URL - auto-detect local vs production
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : 'https://assessment2-kplv.onrender.com';

// ==========================================
// Safe Element Getter
// ==========================================
function safeGetElement(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element with id '${id}' not found`);
    }
    return el;
}

// DOM Elements with null checks
const elements = {
    // Upload
    documentInput: safeGetElement('documentInput'),
    documentTitle: safeGetElement('documentTitle'),
    uploadBtn: safeGetElement('uploadBtn'),
    uploadPdfBtn: safeGetElement('uploadPdfBtn'),
    clearDocsBtn: safeGetElement('clearDocsBtn'),
    uploadStatus: safeGetElement('uploadStatus'),

    // Query
    queryInput: safeGetElement('queryInput'),
    queryBtn: safeGetElement('queryBtn'),

    // Results
    resultsSection: safeGetElement('resultsSection'),
    answerPanel: safeGetElement('answerPanel'),
    answerContent: safeGetElement('answerContent'),
    citationsPanel: safeGetElement('citationsPanel'),
    citationsContent: safeGetElement('citationsContent'),
    timingBadge: safeGetElement('timingBadge'),

    // Metrics
    retrievalTime: safeGetElement('retrievalTime'),
    rerankTime: safeGetElement('rerankTime'),
    generationTime: safeGetElement('generationTime'),
    tokenCount: safeGetElement('tokenCount'),
    costEstimate: safeGetElement('costEstimate'),

    // Loading
    loadingOverlay: safeGetElement('loadingOverlay'),
    loadingText: safeGetElement('loadingText'),

    // Toast
    toastContainer: safeGetElement('toastContainer'),

    // PDF Modal
    pdfModal: safeGetElement('pdfModal'),
    closePdfModal: safeGetElement('closePdfModal'),
    pdfDropZone: safeGetElement('pdfDropZone'),
    pdfFileInput: safeGetElement('pdfFileInput'),
    selectedFile: safeGetElement('selectedFile'),
    selectedFileName: safeGetElement('selectedFileName'),
    removeFile: safeGetElement('removeFile'),
    pdfTitle: safeGetElement('pdfTitle'),
    cancelPdfUpload: safeGetElement('cancelPdfUpload'),
    confirmPdfUpload: safeGetElement('confirmPdfUpload'),

    // Uploaded Documents
    uploadedDocs: safeGetElement('uploadedDocs'),
    docsList: safeGetElement('docsList'),
    refreshDocsBtn: safeGetElement('refreshDocsBtn')
};

// Current selected PDF file
let selectedPdfFile = null;

// ==========================================
// Utility Functions
// ==========================================

function showLoading(message = 'Processing...') {
    if (elements.loadingText) elements.loadingText.textContent = message;
    if (elements.loadingOverlay) elements.loadingOverlay.classList.add('active');
}

function hideLoading() {
    if (elements.loadingOverlay) elements.loadingOverlay.classList.remove('active');
}

function showToast(message, type = 'info') {
    if (!elements.toastContainer) {
        console.log(`Toast (${type}):`, message);
        return;
    }

    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || ''}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    elements.toastContainer.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, 5000);
}

function formatTime(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// Safe Event Listener Helper
// ==========================================
function addSafeEventListener(element, event, handler) {
    if (element) {
        element.addEventListener(event, function (e) {
            try {
                handler(e);
            } catch (error) {
                console.error(`Error in ${event} handler:`, error);
                showToast('An unexpected error occurred', 'error');
            }
        });
    }
}

// ==========================================
// Safe Fetch Wrapper
// ==========================================
async function safeFetch(url, options = {}) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Handle non-OK responses
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
            }

            const error = new Error(errorData.message || `Request failed with status ${response.status}`);
            error.status = response.status;
            error.data = errorData;
            throw error;
        }

        return response;
    } catch (error) {
        // Handle specific error types
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please try again.');
        }
        if (error.message === 'Failed to fetch') {
            throw new Error('Network error. Please check your connection and try again.');
        }
        throw error;
    }
}

// ==========================================
// Modal Functions
// ==========================================

function openPdfModal() {
    if (elements.pdfModal) {
        elements.pdfModal.classList.add('active');
        resetPdfModal();
    }
}

function closePdfModal() {
    if (elements.pdfModal) {
        elements.pdfModal.classList.remove('active');
        resetPdfModal();
    }
}

function resetPdfModal() {
    selectedPdfFile = null;
    if (elements.pdfFileInput) elements.pdfFileInput.value = '';
    if (elements.pdfTitle) elements.pdfTitle.value = '';
    if (elements.selectedFile) elements.selectedFile.style.display = 'none';
    if (elements.pdfDropZone) elements.pdfDropZone.style.display = 'block';
    if (elements.confirmPdfUpload) elements.confirmPdfUpload.disabled = true;
}

function selectFile(file) {
    if (!file) return;

    if (file.type !== 'application/pdf') {
        showToast('Please select a PDF file', 'error');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showToast('File size must be less than 10MB', 'error');
        return;
    }

    selectedPdfFile = file;
    if (elements.selectedFileName) elements.selectedFileName.textContent = file.name;
    if (elements.selectedFile) elements.selectedFile.style.display = 'flex';
    if (elements.pdfDropZone) elements.pdfDropZone.style.display = 'none';
    if (elements.confirmPdfUpload) elements.confirmPdfUpload.disabled = false;
}

// ==========================================
// API Functions
// ==========================================

async function uploadDocument() {
    if (!elements.documentInput) return;

    const text = elements.documentInput.value.trim();
    const title = elements.documentTitle?.value.trim() || 'Uploaded Document';

    if (!text) {
        showToast('Please enter some text to upload', 'error');
        return;
    }

    if (text.length < 50) {
        showToast('Please enter at least 50 characters', 'error');
        return;
    }

    showLoading('Chunking and embedding document...');
    if (elements.uploadBtn) elements.uploadBtn.disabled = true;

    try {
        const response = await safeFetch(`${API_BASE}/api/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text, title })
        });

        const data = await response.json();

        if (data.success) {
            if (elements.uploadStatus) {
                elements.uploadStatus.className = 'upload-status success';
                elements.uploadStatus.innerHTML = `
                    Uploaded: ${data.details?.chunksCreated || 0} chunks created 
                    (${formatTime(data.timing?.totalMs)})
                `;
            }
            showToast(`Document "${title}" uploaded successfully!`, 'success');

            // Clear inputs
            if (elements.documentInput) elements.documentInput.value = '';
            if (elements.documentTitle) elements.documentTitle.value = '';

            // Refresh documents list
            fetchUploadedDocuments();
        } else {
            throw new Error(data.message || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        if (elements.uploadStatus) {
            elements.uploadStatus.className = 'upload-status error';
            elements.uploadStatus.textContent = `Error: ${error.message}`;
        }
        showToast(error.message, 'error');
    } finally {
        hideLoading();
        if (elements.uploadBtn) elements.uploadBtn.disabled = false;
    }
}

async function uploadPdf() {
    if (!selectedPdfFile) {
        showToast('Please select a PDF file', 'error');
        return;
    }

    // Save references before closing modal (which resets them)
    const file = selectedPdfFile;
    const title = elements.pdfTitle?.value.trim() || file.name.replace('.pdf', '');

    closePdfModal();
    showLoading('Extracting text and processing PDF...');

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);

        const response = await safeFetch(`${API_BASE}/api/upload/pdf`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            if (elements.uploadStatus) {
                elements.uploadStatus.className = 'upload-status success';
                elements.uploadStatus.innerHTML = `
                    PDF uploaded: ${data.details?.chunksCreated || 0} chunks from ${data.details?.pages || 0} pages
                    (${formatTime(data.timing?.totalMs)})
                `;
            }
            showToast(`PDF "${data.details?.filename || file.name}" processed successfully!`, 'success');
            fetchUploadedDocuments();
        } else {
            throw new Error(data.message || 'PDF upload failed');
        }
    } catch (error) {
        console.error('PDF upload error:', error);

        // Check for rate limit error
        if (error.status === 429 || error.data?.isRateLimit) {
            if (elements.uploadStatus) {
                elements.uploadStatus.className = 'upload-status error';
                elements.uploadStatus.innerHTML = `
                    Rate limit exceeded! The PDF is too large for the current API limits.<br>
                    <small>Please try uploading a smaller PDF file (fewer pages or less content).</small>
                `;
            }
            showToast('Rate limit exceeded. Please try a smaller PDF file.', 'error');
        } else {
            if (elements.uploadStatus) {
                elements.uploadStatus.className = 'upload-status error';
                elements.uploadStatus.textContent = `Error: ${error.message}`;
            }
            showToast(error.message, 'error');
        }
    } finally {
        hideLoading();
    }
}

async function clearDocuments() {
    if (!confirm('Are you sure you want to clear all documents?')) {
        return;
    }

    showLoading('Clearing documents...');

    try {
        const response = await safeFetch(`${API_BASE}/api/upload`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            if (elements.uploadStatus) {
                elements.uploadStatus.className = 'upload-status success';
                elements.uploadStatus.textContent = 'All documents cleared';
            }
            showToast('All documents cleared', 'success');
            fetchUploadedDocuments();
        } else {
            throw new Error(data.message || 'Clear failed');
        }
    } catch (error) {
        console.error('Clear error:', error);
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Fetch and display uploaded documents
 */
async function fetchUploadedDocuments() {
    if (!elements.docsList) return;

    try {
        elements.docsList.innerHTML = '<p class="docs-loading">Loading documents...</p>';

        const response = await safeFetch(`${API_BASE}/api/documents`);
        const data = await response.json();

        if (data.success) {
            displayUploadedDocuments(data.documents);
        } else {
            elements.docsList.innerHTML = '<p class="placeholder-text">Unable to load documents.</p>';
        }
    } catch (error) {
        console.error('Error fetching documents:', error);
        elements.docsList.innerHTML = '<p class="placeholder-text">Error loading documents.</p>';
    }
}

/**
 * Display uploaded documents in the UI
 */
function displayUploadedDocuments(documents) {
    if (!elements.docsList) return;

    if (!documents || documents.length === 0) {
        elements.docsList.innerHTML = '<p class="placeholder-text">No documents uploaded yet.</p>';
        return;
    }

    elements.docsList.innerHTML = documents.map(doc => {
        const icon = '📄';
        const pageInfo = doc.pages ? `${doc.pages} pages` : '';
        const chunkInfo = `${doc.chunksCount || 0} chunks`;

        return `
            <div class="doc-item">
                <span class="doc-icon">${icon}</span>
                <div class="doc-info">
                    <div class="doc-title" title="${escapeHtml(doc.title || 'Untitled')}">${escapeHtml(doc.title || 'Untitled')}</div>
                    <div class="doc-meta">
                        ${pageInfo ? `<span>${pageInfo}</span>` : ''}
                        <span>${chunkInfo}</span>
                    </div>
                </div>
                <span class="doc-status">✓ Processed</span>
            </div>
        `;
    }).join('');
}

async function queryDocuments() {
    if (!elements.queryInput) return;

    const query = elements.queryInput.value.trim();

    if (!query) {
        showToast('Please enter a question', 'error');
        return;
    }

    showLoading('Searching and generating answer...');
    if (elements.queryBtn) elements.queryBtn.disabled = true;

    try {
        const response = await safeFetch(`${API_BASE}/api/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        const data = await response.json();

        if (data.success) {
            displayResults(data);
        } else {
            throw new Error(data.message || 'Query failed');
        }
    } catch (error) {
        console.error('Query error:', error);
        if (elements.answerContent) {
            elements.answerContent.innerHTML = `<p class="placeholder-text" style="color: var(--error);">Error: ${escapeHtml(error.message)}</p>`;
        }
        showToast(error.message, 'error');
    } finally {
        hideLoading();
        if (elements.queryBtn) elements.queryBtn.disabled = false;
    }
}

// ==========================================
// Display Functions
// ==========================================

function displayResults(data) {
    if (!data) return;

    // Display answer with citation highlighting
    if (elements.answerContent) {
        const answerHtml = formatAnswerWithCitations(data.answer || 'No answer available');
        elements.answerContent.innerHTML = answerHtml;
    }

    // Display timing badge
    if (elements.timingBadge) {
        elements.timingBadge.textContent = `Total: ${formatTime(data.timing?.totalMs)}`;
    }

    // Display citations/sources
    if (elements.citationsContent) {
        if (data.sources && data.sources.length > 0) {
            elements.citationsContent.innerHTML = data.sources.map(source => `
                <div class="citation-item" id="source-${source.number || 0}">
                    <div class="citation-header">
                        <span class="citation-number">${source.number || 0}</span>
                        <div class="citation-meta">
                            <div class="citation-title">${escapeHtml(source.title || 'Document')}</div>
                            <div class="citation-section">${escapeHtml(source.section || 'Content')}</div>
                        </div>
                        <span class="citation-score">Score: ${source.relevanceScore || 'N/A'}</span>
                    </div>
                    <div class="citation-text">${escapeHtml(source.text || '')}</div>
                </div>
            `).join('');
        } else {
            elements.citationsContent.innerHTML = '<p class="placeholder-text">No sources available</p>';
        }
    }

    // Display metrics with null checks
    if (elements.retrievalTime) elements.retrievalTime.textContent = formatTime(data.timing?.retrievalMs);
    if (elements.rerankTime) elements.rerankTime.textContent = formatTime(data.timing?.rerankMs);
    if (elements.generationTime) elements.generationTime.textContent = formatTime(data.timing?.generationMs);

    if (data.tokens && elements.tokenCount) {
        elements.tokenCount.textContent = data.tokens.total || '-';
    }

    if (data.costEstimate && elements.costEstimate) {
        elements.costEstimate.textContent = `$${data.costEstimate.totalCost || '0.00'}`;
    }
}

function formatAnswerWithCitations(answer) {
    if (typeof answer !== 'string') return '<p>No answer available</p>';

    let formatted = answer;

    // Step 1: Replace [1], [2], etc. with clickable citation links
    formatted = formatted.replace(/\[(\d+)\]/g, (match, num) => {
        return `<span class="citation-ref" onclick="scrollToSource(${num})" title="View source ${num}">${num}</span>`;
    });

    // Step 2: Handle LaTeX expressions (preserve them, wrap in code-like styling)
    // Match \( ... \) and \[ ... \] 
    formatted = formatted.replace(/\\\((.*?)\\\)/g, '<code class="math-inline">$1</code>');
    formatted = formatted.replace(/\\\[(.*?)\\\]/g, '<div class="math-block"><code>$1</code></div>');
    // Match $...$ for inline math
    formatted = formatted.replace(/\$([^$]+)\$/g, '<code class="math-inline">$1</code>');

    // Step 3: Handle markdown bold **text** -> <strong>text</strong>
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Step 4: Handle markdown italic *text* -> <em>text</em>
    // Be careful not to match already processed ** patterns
    formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

    // Step 5: Handle markdown headers (## Header)
    formatted = formatted.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^# (.+)$/gm, '<h3>$1</h3>');

    // Step 6: Handle bullet points (- item or * item at start of line)
    // Convert consecutive bullet lines into a <ul> list
    const lines = formatted.split('\n');
    let inList = false;
    let result = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)$/);

        if (bulletMatch) {
            if (!inList) {
                result.push('<ul>');
                inList = true;
            }
            result.push(`<li>${bulletMatch[1]}</li>`);
        } else {
            if (inList) {
                result.push('</ul>');
                inList = false;
            }
            result.push(line);
        }
    }
    if (inList) {
        result.push('</ul>');
    }

    formatted = result.join('\n');

    // Step 7: Convert double newlines to paragraph breaks
    const paragraphs = formatted.split('\n\n').filter(p => p.trim());

    // Wrap non-list content in paragraphs
    const htmlContent = paragraphs.map(p => {
        // Don't wrap if it's already a block element
        if (p.trim().startsWith('<ul>') || p.trim().startsWith('<h') || p.trim().startsWith('<div')) {
            return p.replace(/\n/g, '');
        }
        return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return htmlContent;
}

function scrollToSource(num) {
    const sourceEl = document.getElementById(`source-${num}`);
    if (sourceEl) {
        sourceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sourceEl.style.borderColor = 'var(--accent-primary)';
        sourceEl.style.boxShadow = '0 0 20px var(--accent-glow)';
        setTimeout(() => {
            sourceEl.style.borderColor = '';
            sourceEl.style.boxShadow = '';
        }, 2000);
    }
}

// Make scrollToSource available globally
window.scrollToSource = scrollToSource;

// ==========================================
// Event Listeners (with safe binding)
// ==========================================

// Upload button
addSafeEventListener(elements.uploadBtn, 'click', uploadDocument);

// PDF upload button
addSafeEventListener(elements.uploadPdfBtn, 'click', openPdfModal);

// Clear button
addSafeEventListener(elements.clearDocsBtn, 'click', clearDocuments);

// Query button
addSafeEventListener(elements.queryBtn, 'click', queryDocuments);

// Enter key for query
addSafeEventListener(elements.queryInput, 'keypress', (e) => {
    if (e.key === 'Enter') {
        queryDocuments();
    }
});

// Ctrl+Enter for upload
addSafeEventListener(elements.documentInput, 'keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        uploadDocument();
    }
});

// PDF Modal events
addSafeEventListener(elements.closePdfModal, 'click', closePdfModal);
addSafeEventListener(elements.cancelPdfUpload, 'click', closePdfModal);
addSafeEventListener(elements.confirmPdfUpload, 'click', uploadPdf);

// Click outside modal to close
addSafeEventListener(elements.pdfModal, 'click', (e) => {
    if (e.target === elements.pdfModal) {
        closePdfModal();
    }
});

// PDF drop zone click
addSafeEventListener(elements.pdfDropZone, 'click', () => {
    if (elements.pdfFileInput) elements.pdfFileInput.click();
});

// File input change
addSafeEventListener(elements.pdfFileInput, 'change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        selectFile(e.target.files[0]);
    }
});

// Remove selected file
addSafeEventListener(elements.removeFile, 'click', () => {
    resetPdfModal();
});

// Drag and drop handlers
addSafeEventListener(elements.pdfDropZone, 'dragover', (e) => {
    e.preventDefault();
    if (elements.pdfDropZone) elements.pdfDropZone.classList.add('dragover');
});

addSafeEventListener(elements.pdfDropZone, 'dragleave', () => {
    if (elements.pdfDropZone) elements.pdfDropZone.classList.remove('dragover');
});

addSafeEventListener(elements.pdfDropZone, 'drop', (e) => {
    e.preventDefault();
    if (elements.pdfDropZone) elements.pdfDropZone.classList.remove('dragover');

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        selectFile(e.dataTransfer.files[0]);
    }
});

// Refresh documents button
addSafeEventListener(elements.refreshDocsBtn, 'click', fetchUploadedDocuments);

// ==========================================
// Initialization
// ==========================================

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    // Don't show toast for every error to avoid spam
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    // Prevent the default behavior which logs to console
    event.preventDefault();
});

// Fetch uploaded documents on load
try {
    fetchUploadedDocuments();
} catch (e) {
    console.error('Error during initialization:', e);
}

console.log('RAG Playground initialized');
