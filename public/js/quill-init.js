/**
 * Quill WYSIWYG Editor Integration 🌿
 * Telegram-style formatting with custom spoiler support
 */

// Custom Spoiler Blot for Telegram-style spoilers
const Inline = Quill.import('blots/inline');

class SpoilerBlot extends Inline {
    static create() {
        const node = super.create();
        node.classList.add('tg-spoiler');
        return node;
    }
    static formats(node) {
        return node.classList.contains('tg-spoiler') || undefined;
    }
}
SpoilerBlot.blotName = 'spoiler';
SpoilerBlot.tagName = 'span';

// Register custom blot
Quill.register(SpoilerBlot);

// Initialize Quill
let quill;

function initQuillEditor() {
    if (typeof Quill === 'undefined') {
        console.error('Quill not loaded! Falling back to regular input.');
        createFallbackInput();
        return;
    }

    try {
        quill = new Quill('#quillEditor', {
            theme: 'snow',
            placeholder: 'Написати повідомлення...',
            modules: {
                toolbar: '#quillToolbar',
                keyboard: {
                    bindings: {
                        // Enter to send
                        enter: {
                            key: 13,
                            handler: function () {
                                sendQuillMessage();
                                return false;
                            }
                        },
                        // Shift+Enter for new line
                        'shift-enter': {
                            key: 13,
                            shiftKey: true,
                            handler: function (range) {
                                quill.insertText(range.index, '\n');
                                return false;
                            }
                        }
                    }
                }
            },
            formats: ['bold', 'italic', 'strike', 'code', 'code-block', 'blockquote', 'link', 'spoiler']
        });

        // Add spoiler button handler
        const spoilerBtn = document.querySelector('.ql-spoiler');
        if (spoilerBtn) {
            spoilerBtn.addEventListener('click', () => {
                const range = quill.getSelection();
                if (range && range.length > 0) {
                    const format = quill.getFormat(range);
                    quill.format('spoiler', !format.spoiler);
                }
            });
        }

        console.log('🌿 Quill editor initialized');
    } catch (e) {
        console.error('Quill init error:', e);
        createFallbackInput();
    }
}

function createFallbackInput() {
    const container = document.getElementById('quillEditor');
    if (!container) return;

    // Create regular input
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'messageInput';
    input.className = 'message-input';
    input.placeholder = 'Написати повідомлення...';
    input.style.width = '100%';
    input.style.padding = '10px';
    input.style.borderRadius = '20px';
    input.style.border = '1px solid #2b5278';
    input.style.background = '#0e1621';
    input.style.color = '#fff';

    // Replace Quill container
    container.parentNode.replaceChild(input, container);

    // Hide Quill toolbar
    const toolbar = document.getElementById('quillToolbar');
    if (toolbar) toolbar.style.display = 'none';

    // Re-init listener
    if (typeof window.initMessageInput === 'function') { // Wait, initMessageInput is internal in message-sender.js
        // We need to bind manually here or rely on message-sender.js handling it if it finds #messageInput
        // message-sender.js calls initMessageInput() on load. If we create input later, listeners won't attach.
        // We should attach listener manually
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.onclick = window.handleSendMessage; // handleSendMessage is global? No
            // We can't easily rebind global listeners if functions aren't exposed.
            // But handleSendMessage IS exposed? No.

            // Let's just RELOAD message-sender logic if possible?
            // Actually message-sender.js might have failed finding input.
            // Let's just bind 'Enter'
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('sendBtn').click();
                }
            });
        }
    }
}

// Send message from Quill
function sendQuillMessage() {
    if (!quill) return;

    const html = quill.root.innerHTML;
    const text = quill.getText().trim();

    if (!text) return;

    // Convert Quill HTML to Telegram HTML
    let telegramHtml = html
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '\n')
        .replace(/<strong>/g, '<b>').replace(/<\/strong>/g, '</b>')
        .replace(/<em>/g, '<i>').replace(/<\/em>/g, '</i>')
        .replace(/<s>/g, '<s>').replace(/<\/s>/g, '</s>')
        .replace(/<span class="tg-spoiler">/g, '<tg-spoiler>').replace(/<\/span>/g, '</tg-spoiler>')
        .replace(/<pre class="ql-syntax" spellcheck="false">/g, '<pre>').replace(/<\/pre>/g, '</pre>')
        .replace(/<blockquote>/g, '❝ ').replace(/<\/blockquote>/g, '\n')
        .replace(/<br>/g, '\n')
        .trim();

    // Clean up empty tags and extra whitespace
    telegramHtml = telegramHtml.replace(/<[^/>]+><\/[^>]+>/g, '').trim();

    // Use existing send logic
    if (typeof window.sendFormattedMessage === 'function') {
        window.sendFormattedMessage(telegramHtml);
    } else {
        console.log('📨 Message to send:', telegramHtml);
    }

    // Clear editor
    quill.setText('');
}

// Get HTML content for external use
function getQuillHTML() {
    if (!quill) return '';
    return quill.root.innerHTML;
}

// Get plain text
function getQuillText() {
    if (!quill) return '';
    return quill.getText().trim();
}

// Set content
function setQuillContent(html) {
    if (!quill) return;
    quill.root.innerHTML = html;
}

// Focus editor
function focusQuill() {
    if (!quill) return;
    quill.focus();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuillEditor);
} else {
    initQuillEditor();
}

// Export to global scope
window.quill = quill;
window.getQuillHTML = getQuillHTML;
window.getQuillText = getQuillText;
window.setQuillContent = setQuillContent;
window.focusQuill = focusQuill;
window.sendQuillMessage = sendQuillMessage;

// ========== Manual Mode Logic 🌿 ==========

/**
 * Load manual mode state for chat
 */
window.loadManualModeState = async function (chatId) {
    if (!chatId) return;

    try {
        const response = await fetch(`/api/get-manual-mode?chat_id=${chatId}`);
        if (response.ok) {
            const data = await response.json();
            updateManualModeUI(data.enabled);
        }
    } catch (e) {
        console.error('Error loading manual mode:', e);
    }
};

/**
 * Update UI checkboxes without triggering API
 */
function updateManualModeUI(enabled) {
    const toolbarToggle = document.getElementById('manualModeToggleToolbar');
    // Also sync with main header toggle if exists
    const mainToggle = document.getElementById('manualModeToggle');

    if (toolbarToggle) toolbarToggle.checked = enabled;
    if (mainToggle) mainToggle.checked = enabled;

    // Update label visual state if needed
    // (CSS handles checkbox state)
}

/**
 * Handle toggle change
 */
async function handleManualModeChange(e) {
    const enabled = e.target.checked;
    const chatId = window.selectedChatId; // Assuming global

    if (!chatId) {
        alert('Оберіть чат!');
        e.target.checked = !enabled; // Revert
        return;
    }

    // Optimistic update
    updateManualModeUI(enabled);

    try {
        const response = await fetch('/api/set-manual-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, enabled: enabled })
        });

        if (!response.ok) throw new Error('Failed');
        console.log(`Manual mode ${enabled ? 'ON' : 'OFF'} for ${chatId}`);

    } catch (err) {
        console.error('Error setting manual mode:', err);
        updateManualModeUI(!enabled); // Revert on error
        alert('Error setting manual mode');
    }
}

// Init listeners
document.addEventListener('DOMContentLoaded', () => {
    const toolbarToggle = document.getElementById('manualModeToggleToolbar');
    if (toolbarToggle) {
        toolbarToggle.addEventListener('change', handleManualModeChange);
    }

    // Sync with existing if present
    const mainToggle = document.getElementById('manualModeToggle');
    if (mainToggle) {
        mainToggle.addEventListener('change', handleManualModeChange);
    }
});
