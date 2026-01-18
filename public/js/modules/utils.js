
// 🌿 Utilities Module
export function formatDate(dateStr) {
    if (!dateStr) return '';
    // assuming input YYYY-MM-DD
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`; // DD.MM.YYYY
    }
    return dateStr;
}

export function parseDate(dateStr) {
    if (!dateStr) return new Date();
    // Case 1: DD.MM.YYYY (Ukrainian)
    const parts = dateStr.toString().split('.');
    if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    // Case 2: Standard ISO or other
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
}

export function safeParseDate(val) {
    if (!val) return new Date(0);
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;

    // Try Ukrainian format DD.MM.YYYY HH:mm:ss
    const match = val.toString().match(/^(\d{2})\.(\d{2})\.(\d{4})(.*)$/);
    if (match) {
        const [, dd, mm, yyyy, time] = match;
        const iso = `${yyyy}-${mm}-${dd}${time ? 'T' + time.trim().replace(/\s+/g, '') : ''}`;
        const finalDate = new Date(iso);
        if (!isNaN(finalDate.getTime())) return finalDate;
    }
    console.warn('DEBUG: safeParseDate failed for:', val);
    return new Date(0);
}

export function isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
}

// Global Exposure
window.formatDate = formatDate;
window.safeParseDate = safeParseDate;
window.isToday = isToday;

export function getColorForUser(id) {
    let hash = 0;
    const str = String(id || 'default');
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return \hsl(\, 70%, 50%)\;
}

window.getColorForUser = getColorForUser;
