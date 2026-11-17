/**
 * Cam Depot for CloudTAK - shared state and camera loading
 */
import { reactive } from 'vue';
import { std, stdurl } from '../../../src/std.ts';

export type Camera = {
    id: string;
    name: string;
    lat: number;
    lon: number;
    /** Picture URL (absolute) */
    still: string | null;
    video: boolean;
    /** Stream URL from the catalog */
    stream: string | null;
    /** false = the agency serves an error or its "camera offline" card */
    online: boolean;
    provider: string;
    county: string;
    state: string;
};

export type StateSource = {
    id: string;
    name: string;
    country: string;
    cameras: number;
};

export type ProviderCredit = {
    id: string;
    attribution: string;
    license: string;
    license_url: string;
};

type StateCameras = {
    cameras: Camera[];
    providers: ProviderCredit[];
    loadedAt: number;
};

const PREFS_KEY = 'cam-depot:prefs';
const RELOAD_MS = 5 * 60 * 1000;

type Prefs = {
    visible: boolean;
    states: string[];
    onScreen: boolean;
};

function loadPrefs(): Prefs {
    const prefs: Prefs = { visible: true, states: ['KS'], onScreen: false };
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) {
            const saved = JSON.parse(raw) as Partial<Prefs> & { state?: string };
            if (typeof saved.visible === 'boolean') prefs.visible = saved.visible;
            if (typeof saved.onScreen === 'boolean') prefs.onScreen = saved.onScreen;
            if (Array.isArray(saved.states)) prefs.states = saved.states.filter((s) => typeof s === 'string');
            // Milestone 1 kept a single state
            else if (typeof saved.state === 'string') prefs.states = [saved.state];
        }
    } catch { /* storage unavailable - defaults */ }
    return prefs;
}

export const state = reactive({
    ...loadPrefs(),
    sources: [] as StateSource[],
    catalog: { available: false, generated: '', credit: '' },
    cameras: [] as Camera[],
    /** Provider credit lines (attribution / license) for what is loaded */
    providers: [] as ProviderCredit[],
    loading: false,
    syncing: false,
    syncNote: '',
    error: '' as string,
});

const perState = new Map<string, StateCameras>();

export function savePrefs(): void {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({
            visible: state.visible,
            states: state.states,
            onScreen: state.onScreen,
        }));
    } catch { /* storage unavailable */ }
}

const listeners = new Set<() => void>();

/** Called whenever the camera list changes (the map layer redraws) */
export function onCamerasChanged(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export async function loadStates(): Promise<void> {
    const body = await std('/api/cam-depot/states') as {
        catalog: { available: boolean; generated: string; credit: string };
        items: StateSource[];
    };
    state.sources = body.items;
    state.catalog = body.catalog;

    const known = new Set(state.sources.map((s) => s.id));
    const kept = state.states.filter((s) => known.has(s));
    if (kept.length !== state.states.length) {
        state.states = kept.length ? kept : (state.sources.length ? [state.sources[0].id] : []);
        savePrefs();
    }
}

async function fetchState(st: string): Promise<StateCameras> {
    const url = stdurl('/api/cam-depot/cameras');
    url.searchParams.set('state', st);
    const body = await std(url) as {
        providers: ProviderCredit[];
        items: Array<Omit<Camera, 'state'>>;
    };
    return {
        providers: body.providers,
        loadedAt: Date.now(),
        cameras: body.items.map((c) => ({
            ...c,
            // The server may hand back a path on itself (live pictures)
            still: c.still ? new URL(c.still, stdurl('/')).href : null,
            state: st,
        })),
    };
}

function merge(): void {
    const cameras: Camera[] = [];
    const providers = new Map<string, ProviderCredit>();

    for (const st of state.states) {
        const loaded = perState.get(st);
        if (!loaded) continue;
        cameras.push(...loaded.cameras);
        for (const p of loaded.providers) providers.set(p.id, p);
    }

    state.cameras = cameras;
    state.providers = [...providers.values()];
}

/** Load every selected state (each kept for 5 minutes unless forced) */
let again = false;

export async function loadCameras(force = false): Promise<void> {
    // A change made while loading is picked up right after
    if (state.loading) {
        again = true;
        return;
    }

    state.loading = true;
    state.error = '';
    const errors: string[] = [];
    try {
        if (!state.sources.length || force) await loadStates();

        await Promise.all(state.states.map(async (st) => {
            const have = perState.get(st);
            if (have && !force && Date.now() - have.loadedAt < RELOAD_MS) return;
            try {
                perState.set(st, await fetchState(st));
            } catch (err) {
                errors.push(`${st}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }));

        for (const st of [...perState.keys()]) {
            if (!state.states.includes(st)) perState.delete(st);
        }
        merge();
        if (errors.length) state.error = errors.join('; ');
    } catch (err) {
        state.error = err instanceof Error ? err.message : String(err);
    } finally {
        state.loading = false;
        for (const fn of listeners) fn();
    }

    if (again) {
        again = false;
        await loadCameras();
    }
}

/** Sync: ask the server to check the catalog for changes, then reload the cameras */
export async function sync(): Promise<void> {
    if (state.syncing) return;
    state.syncing = true;
    state.syncNote = '';
    try {
        const before = state.catalog.generated;
        const body = await std('/api/cam-depot/sync', { method: 'POST' }) as { checked: boolean; generated: string; available: boolean };
        perState.clear();
        await loadCameras(true);
        if (!body.checked) state.syncNote = 'Checked recently - camera lists reloaded';
        else if (body.generated && body.generated !== before) state.syncNote = 'New camera catalog loaded';
        else state.syncNote = 'Camera catalog is up to date';
    } catch (err) {
        state.error = err instanceof Error ? err.message : String(err);
    } finally {
        state.syncing = false;
    }
}

export function findCamera(id: string): Camera | undefined {
    return state.cameras.find((c) => c.id === id);
}
