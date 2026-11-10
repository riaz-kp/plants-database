// Shared by the catalog CSV import page and a project's bulk import page.
import { useEffect, useState } from 'react';
import { aiApi } from '../../api/ai';
import { plantsApi } from '../../api/plants';

// ── Step-by-step import (one plant per request, so progress is real and
//    long imports never hit a single request timeout) ─────────────────────────
export const TEXT_FIELDS = ['description', 'common_diseases', 'care_water', 'care_sunlight', 'care_soil', 'care_maintenance'];

export const IMPORT_STEPS = {
    ai: 'Generating missing details with AI',
    find: 'Finding plant images',
    icon: 'Uploading icon image',
    image: 'Uploading main image',
    save: 'Saving to catalog',
} as const;
export type ImportStep = keyof typeof IMPORT_STEPS;
export const STEP_ORDER = Object.keys(IMPORT_STEPS) as ImportStep[];

export type JobStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface ImportJob {
    name: string;
    status: JobStatus;
    step?: ImportStep;
    message?: string;
    warnings: string[];
}

const firstHttpsUrl = (raw: string | undefined) => raw?.match(/https:\/\/[^\s)\]',"]+/)?.[0] ?? '';
const isCloudinaryUrl = (url: string) => url.includes('res.cloudinary.com');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errorMessage = (err: any) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return detail?.message || err?.message || 'Unknown error';
};

/** Display name of a CSV row */
export const rowName = (r: Record<string, string>) =>
    r.common_name?.trim() || r.scientific_name?.trim() || r.species?.trim() || '';

/** AI-fill blank text, find missing images and upload them, reporting each step. */
export async function prepareImportRow(
    source: Record<string, string>,
    categories: string[] | undefined,
    onStep: (step: ImportStep) => void,
    warn: (msg: string) => void,
): Promise<Record<string, string>> {
    const row = { ...source };
    const scientific = row.scientific_name?.trim() || [row.genus, row.species].filter(Boolean).join(' ').trim();
    const common = row.common_name?.trim();

    if (TEXT_FIELDS.some(f => !row[f]?.trim())) {
        onStep('ai');
        try {
            const ai = await aiApi.generatePlantDetails({
                commonName: common || undefined,
                scientificName: scientific || undefined,
                categories,
            });
            const filled: Record<string, string | undefined> = {
                description: ai.description,
                common_diseases: ai.common_diseases,
                care_water: ai.care_data?.water,
                care_sunlight: ai.care_data?.sunlight,
                care_soil: ai.care_data?.soil,
                care_maintenance: ai.care_data?.maintenance,
            };
            for (const f of TEXT_FIELDS) {
                if (!row[f]?.trim() && filled[f]) row[f] = filled[f]!;
            }
        } catch {
            warn('AI details unavailable');
        }
    }

    row.icon_url = firstHttpsUrl(row.icon_url);
    row.image_url = firstHttpsUrl(row.image_url);
    if (!row.icon_url || !row.image_url) {
        onStep('find');
        try {
            const found = await aiApi.fetchPlantImages({ plantName: scientific || common });
            if (!row.icon_url && found.icon_url) row.icon_url = found.icon_url;
            if (!row.image_url && found.image_url) row.image_url = found.image_url;
        } catch {
            /* no images found — the plant is still imported without them */
        }
    }

    for (const [field, step, label] of [
        ['icon_url', 'icon', 'icon'],
        ['image_url', 'image', 'main image'],
    ] as const) {
        if (!row[field]) {
            warn(`no ${label}`);
            continue;
        }
        if (isCloudinaryUrl(row[field])) continue;
        onStep(step);
        try {
            const uploaded = await plantsApi.uploadImageFromUrl(row[field], field === 'icon_url' ? 'icon' : 'image');
            row[field] = uploaded.url;
        } catch {
            warn(`${label} upload failed`);
            row[field] = '';
        }
    }
    return row;
}

/** Seconds since `running` turned on; while it is on, leaving the page asks first. */
export function useImportClock(running: boolean) {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    // Each run starts from 0:00
    const [wasRunning, setWasRunning] = useState(running);
    if (running !== wasRunning) {
        setWasRunning(running);
        if (running) setElapsedSeconds(0);
    }
    useEffect(() => {
        if (!running) return;
        const started = Date.now();
        const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
        // Leaving mid-import would silently drop the remaining plants
        const warnOnLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', warnOnLeave);
        return () => { clearInterval(timer); window.removeEventListener('beforeunload', warnOnLeave); };
    }, [running]);
    return elapsedSeconds;
}

// ── AI prompt that turns a list of plant names into import CSV ─────────────────
export const DEFAULT_CATEGORY_LIST = 'Tree, Shrub, Palm, Creeper, Groundcover, Climber, Fern, Grass, Succulent, Aquatic, Other';

const PLANT_NAMES_PLACEHOLDER = '[PASTE YOUR PLANT NAMES HERE]';

export function buildBulkImportPrompt(categoriesList: string, plantNames?: string[]) {
    const list = plantNames?.length ? plantNames.map(n => `- ${n}`).join('\n') : PLANT_NAMES_PLACEHOLDER;
    return `Act as a botanical data expert.

Task: Generate a perfectly formatted CSV file for the plants listed below.

Header (MUST be the first line of your response):
kingdom,division,class,order,family,genus,species,common_name,scientific_name,category,planting_place,description,common_diseases,care_water,care_sunlight,care_soil,care_maintenance,icon_url,image_url

Strict Requirements (CRITICAL):
1. MANDATORY FIELDS: Every single column must have a value. DO NOT skip any columns.
2. SPECIES COLUMN: This is the specific epithet (the second word of the scientific name). For example, if the scientific name is "Psidium guajava", the species is "guajava". DO NOT leave the species column blank.
3. CATEGORY: MUST be exactly one of [${categoriesList}].
4. PLACE: MUST be exactly one of [Indoor, Outdoor, Indoor & Outdoor].
5. IMAGES: Use Wikimedia Special:FilePath URLs based on the scientific name (e.g. .../Special:FilePath/Scientific_Name.jpg?width=1000).
6. FORMATTING: Raw CSV text only. No markdown blocks (no \` \` \`), no explanations, no "Here is your CSV".

List of Plants to Process:
${list}`;
}
