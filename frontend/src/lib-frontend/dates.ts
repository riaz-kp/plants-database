/** API timestamps are UTC; some arrive without a zone suffix, which `new Date` would read as local time */
export const parseApiDate = (iso: string) => new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(iso) ? iso : `${iso}Z`);

/** "Nov 10, 2026" */
export const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(parseApiDate(iso));

/** "just now", "5m ago", "3h ago", "2d ago", then "Nov 4" (or "Nov 4, 2025" in another year) */
export const timeAgo = (iso?: string | null) => {
    if (!iso) return '';
    const date = parseApiDate(iso);
    const minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
    }).format(date);
};
