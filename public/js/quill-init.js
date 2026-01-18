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
        console.error('Quill not loaded!');
        return;
    }

    quill = new Quill('#quillEditor', {
        theme: 'bubble',
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

// Expose to global scope
window.quill = quill;
window.getQuillHTML = getQuillHTML;
window.getQuillText = getQuillText;
window.setQuillContent = setQuillContent;
window.focusQuill = focusQuill;
window.sendQuillMessage = sendQuillMessage;
