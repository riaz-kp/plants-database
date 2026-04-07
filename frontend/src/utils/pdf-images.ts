const API_BASE = 'http://localhost:8000/api/v1';

async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result as string);
        r.onerror = () => rej(null);
        r.readAsDataURL(blob);
    });
}

export async function imgToDataUrl(url: string | null | undefined): Promise<string | null> {
    if (!url) return null;
    try {
        const proxyUrl = `${API_BASE}/proxy/image?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
            const blob = await res.blob();
            return await blobToDataUrl(blob);
        }
    } catch { /* fall through */ }
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) {
            const blob = await res.blob();
            return await blobToDataUrl(blob);
        }
    } catch { /* fall through */ }
    return null;
}

export async function prepareProjectImageCache(project: any) {
    const urls: Array<{ key: string; url: string }> = [];
    for (const pp of project.plants) {
        const p = pp.plant;
        if (!p) continue;
        if (p.icon_url) {
            urls.push({ key: p.id, url: p.icon_url });
            urls.push({ key: `icon_${p.id}`, url: p.icon_url });
        }
        if (p.image_url) {
            urls.push({ key: `hero_${p.id}`, url: p.image_url });
        }
    }

    const results = await Promise.all(
        urls.map(({ key, url }) => imgToDataUrl(url).then(data => ({ key, data })))
    );

    const cache: Record<string, string> = {};
    for (const { key, data } of results) {
        if (data) cache[key] = data;
    }
    return cache;
}
