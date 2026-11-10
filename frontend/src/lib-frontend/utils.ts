import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type React from "react";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Classes for a link that stretches over its whole card (via ::after), so a click anywhere
 * follows it and Ctrl/Cmd/middle-click still opens a new tab. The card needs `relative`;
 * buttons that must stay clickable inside it need `relative z-10`.
 * Not for table rows: Safari doesn't treat a <tr> as the box to stretch over, so every link
 * covers the whole table. Use `rowLinkProps` there.
 */
export const stretchedLink =
    "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring";

// Clicks on these inside a row do their own thing
const ROW_CONTROLS = 'a, button, input, textarea, select, label, [role="menuitem"], [role="dialog"]';

function followRowLink(e: React.MouseEvent<HTMLElement>, newTab: boolean) {
    const target = e.target as HTMLElement;
    // React bubbles clicks from portalled menus and dialogs up to the row; those aren't row clicks
    if (e.defaultPrevented || !e.currentTarget.contains(target) || target.closest(ROW_CONTROLS)) return;
    // Selecting text in a row shouldn't navigate
    if (window.getSelection()?.toString()) return;
    const link = e.currentTarget.querySelector<HTMLAnchorElement>('a[data-row-link]');
    if (!link) return;
    if (newTab || e.metaKey || e.ctrlKey || e.shiftKey) window.open(link.href, '_blank', 'noopener');
    else link.click();
}

/**
 * Spread on a table row to make a click anywhere follow the row's main link, the `a[data-row-link]`
 * inside it. Buttons and links in the row keep their own clicks; Ctrl/Cmd/Shift-click and
 * middle-click open the link in a new tab.
 */
export const rowLinkProps = {
    onClick: (e: React.MouseEvent<HTMLElement>) => followRowLink(e, false),
    onAuxClick: (e: React.MouseEvent<HTMLElement>) => { if (e.button === 1) followRowLink(e, true); },
};

/**
 * A Cloudinary image resized for display, in WebP/AVIF where the browser supports it.
 * `size` is the displayed width in CSS pixels (doubled for sharp screens); "fill" crops
 * to a square, "limit" keeps the aspect ratio. Non-Cloudinary URLs are returned as is.
 */
export function cloudinaryThumb(url: string | null | undefined, size: number, crop: 'fill' | 'limit' = 'fill') {
    if (!url || !url.includes('res.cloudinary.com/') || !url.includes('/image/upload/')) return url ?? undefined;
    const px = Math.round(size * 2);
    const resize = crop === 'fill' ? `c_fill,w_${px},h_${px}` : `c_limit,w_${px}`;
    return url.replace('/image/upload/', `/image/upload/${resize},f_auto,q_auto/`);
}
