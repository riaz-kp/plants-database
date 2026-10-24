import { client } from '../api/client';
import type { Project } from '../types/project';

async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result as string);
        r.onerror = () => rej(null);
        r.readAsDataURL(blob);
    });
}

/** Pixel size an export needs: `w` wide, cropped to `w` × `h` when `h` is given. */
export interface ImgSize {
    w: number;
    h?: number;
}

// About 3 px per PDF point, so photos stay sharp when printed
const THUMB: ImgSize = { w: 96, h: 96 };   // table thumbnails, 26–30 pt
const ICON: ImgSize = { w: 168, h: 168 };  // plant card icon, 56 pt
const HERO: ImgSize = { w: 630, h: 450 };  // plant card photo, 210 × 150 pt

const isCloudinary = (url: string) => url.includes('res.cloudinary.com/') && url.includes('/image/upload/');

/**
 * A white-backed JPEG copy of a Cloudinary image at `size`. react-pdf can only embed
 * JPEG and PNG (WebP photos went missing), and full-size photos made a 70-plant
 * inventory PDF about 40 MB.
 */
function cloudinaryJpeg(url: string, { w, h }: ImgSize) {
    const resize = h ? `c_fill,w_${w},h_${h}` : `c_limit,w_${w}`;
    return url.replace('/image/upload/', `/image/upload/${resize},f_jpg,b_white,q_auto/`);
}

export async function imgToDataUrl(url: string | null | undefined, size?: ImgSize): Promise<string | null> {
    if (!url) return null;
    if (isCloudinary(url)) {
        // Cloudinary allows cross-origin requests, so fetch it directly; the original
        // is the fallback in case resized copies are ever switched off on the account
        for (const src of size ? [cloudinaryJpeg(url, size), url] : [url]) {
            try {
                const res = await fetch(src);
                if (res.ok) return await blobToDataUrl(await res.blob());
            } catch { /* try the next one */ }
        }
        return null;
    }
    // Other hosts may not allow cross-origin requests; the API's image proxy needs the login token
    try {
        const res = await client.get<Blob>('/proxy/image', { params: { url }, responseType: 'blob' });
        return await blobToDataUrl(res.data);
    } catch {
        return null;
    }
}

/**
 * Data URLs for a project's plant images, keyed the way the PDF documents read them:
 * `<plant id>` table thumbnail, `icon_<plant id>` and `hero_<plant id>` for plant cards.
 * Documents without plant cards (BOQ, quotation) pass `cards: false`.
 */
export async function prepareProjectImageCache(project: Project, { cards = true } = {}) {
    const jobs: Array<{ key: string; url: string; size: ImgSize }> = [];
    for (const pp of project.plants) {
        const p = pp.plant;
        if (!p) continue;
        if (p.icon_url) {
            jobs.push({ key: p.id, url: p.icon_url, size: THUMB });
            if (cards) jobs.push({ key: `icon_${p.id}`, url: p.icon_url, size: ICON });
        }
        if (cards && p.image_url) {
            jobs.push({ key: `hero_${p.id}`, url: p.image_url, size: HERO });
        }
    }

    const results = await Promise.all(
        jobs.map(({ key, url, size }) => imgToDataUrl(url, size).then(data => ({ key, data })))
    );

    const cache: Record<string, string> = {};
    for (const { key, data } of results) {
        if (data) cache[key] = data;
    }
    return cache;
}
