import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

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
