<template>
    <MenuTemplate
        name='Cam Depot'
        :loading='false'
    >
        <template #buttons>
            <TablerRefreshButton
                title='Sync: check the camera catalog for changes and reload'
                :loading='state.loading || state.syncing'
                @click='sync'
            />
        </template>

        <template #default>
            <div class='col-12 px-2 py-2 d-flex flex-column gap-2'>
                <TablerToggle
                    v-model='state.visible'
                    label='Show cameras on the map'
                />

                <div class='d-flex align-items-center gap-2'>
                    <span class='form-label mb-0'>States</span>
                    <button
                        type='button'
                        class='btn btn-sm flex-grow-1 text-truncate justify-content-start'
                        :title='pickedLabel'
                        @click='picking = !picking'
                    >
                        <span
                            class='text-truncate'
                            v-text='pickedLabel'
                        />
                    </button>
                </div>

                <div
                    v-if='picking'
                    class='border rounded p-2 d-flex flex-column gap-1'
                >
                    <TablerInput
                        v-model='placeFilter'
                        icon='search'
                        placeholder='Find a state or province'
                    />
                    <div class='small text-secondary'>
                        {{ pickedCount.toLocaleString() }} cameras selected
                        <span v-if='pickedCount > BIG_SELECTION'>: a big selection can make the map slow</span>
                    </div>
                    <div class='cam-place-list'>
                        <template
                            v-for='group in placeGroups'
                            :key='group.label'
                        >
                            <div
                                v-if='group.items.length'
                                class='small fw-bold text-secondary mt-1'
                                v-text='group.label'
                            />
                            <label
                                v-for='s in group.items'
                                :key='s.id'
                                class='form-check mb-0'
                            >
                                <input
                                    class='form-check-input'
                                    type='checkbox'
                                    :checked='state.states.includes(s.id)'
                                    @change='togglePlace(s.id)'
                                >
                                <span class='form-check-label'>
                                    {{ s.name }}
                                    <span
                                        v-if='s.cameras'
                                        class='text-secondary'
                                    >({{ s.cameras.toLocaleString() }})</span>
                                </span>
                            </label>
                        </template>
                    </div>
                    <button
                        type='button'
                        class='btn btn-sm btn-primary'
                        @click='picking = false'
                    >
                        Done
                    </button>
                </div>

                <TablerInput
                    v-model='filter'
                    icon='search'
                    placeholder='Search cameras'
                />

                <TablerToggle
                    v-model='state.onScreen'
                    label='On screen only'
                />

                <div
                    v-if='state.syncNote'
                    class='small text-secondary'
                    v-text='state.syncNote'
                />

                <div class='small text-secondary d-flex gap-3'>
                    <span><span class='cam-dot cam-dot-video' /> Video {{ counts.video }}</span>
                    <span><span class='cam-dot cam-dot-still' /> Picture only {{ counts.still }}</span>
                    <span v-if='counts.offline'><span class='cam-dot cam-dot-offline' /> Offline {{ counts.offline }}</span>
                </div>
            </div>

            <TablerAlert
                v-if='state.error'
                :err='new Error(state.error)'
            />
            <TablerLoading
                v-else-if='state.loading && !state.cameras.length'
                desc='Loading cameras'
            />
            <TablerNone
                v-else-if='!shown.length'
                label='No cameras match'
                :create='false'
            />
            <div
                v-else
                class='list-group list-group-flush'
            >
                <div
                    v-for='cam in shown'
                    :key='cam.id'
                    class='list-group-item d-flex align-items-center gap-2 px-2 py-2 cursor-pointer hover'
                    role='button'
                    tabindex='0'
                    @click='goTo(cam)'
                    @keyup.enter='goTo(cam)'
                >
                    <span :class='["cam-dot", !cam.online ? "cam-dot-offline" : (cam.video ? "cam-dot-video" : "cam-dot-still")]' />
                    <div class='flex-grow-1 text-truncate'>
                        <div
                            class='text-truncate'
                            :title='cam.name'
                            v-text='cam.name'
                        />
                        <div
                            class='small text-secondary text-truncate'
                            v-text='cam.provider'
                        />
                    </div>
                    <span
                        v-if='!cam.online'
                        class='small text-secondary'
                    >offline</span>
                    <TablerIconButton
                        v-if='cam.still'
                        title='Show picture'
                        @click.stop='openCamera(pinia, cam, "still")'
                    >
                        <IconPhoto
                            :size='20'
                            stroke='1'
                        />
                    </TablerIconButton>
                    <TablerIconButton
                        v-if='cam.video'
                        title='Play live video'
                        @click.stop='openCamera(pinia, cam, "video")'
                    >
                        <IconPlayerPlay
                            :size='20'
                            stroke='1'
                        />
                    </TablerIconButton>
                </div>
                <div
                    v-if='matched.length > shown.length'
                    class='small text-secondary px-2 py-2'
                >
                    Showing {{ shown.length }} of {{ matched.length }}. Search or zoom in to narrow the list.
                </div>
            </div>
        </template>

        <template #footer>
            <div class='small text-secondary px-2 py-1'>
                <div v-if='state.catalog.credit'>
                    {{ state.catalog.credit }}<span v-if='catalogDate'>, catalog of {{ catalogDate }}</span>.
                    Cameras belong to the agency shown on each camera.
                </div>
                <div
                    v-for='p in state.providers'
                    :key='p.id'
                >
                    {{ p.id }}: {{ p.attribution }}<template v-if='p.license'>
                        <span v-if='p.attribution'>, </span>
                        <a
                            v-if='p.license_url'
                            :href='p.license_url'
                            target='_blank'
                            rel='noopener noreferrer'
                            v-text='p.license'
                        />
                        <span
                            v-else
                            v-text='p.license'
                        />
                    </template>
                </div>
                <div>Independent plugin inspired by takwerx Cam Depot for ATAK; not made or supported by takwerx.</div>
            </div>
        </template>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import type { Pinia } from 'pinia';
import {
    TablerAlert,
    TablerIconButton,
    TablerInput,
    TablerLoading,
    TablerNone,
    TablerRefreshButton,
    TablerToggle,
} from '@tak-ps/vue-tabler';
import { IconPhoto, IconPlayerPlay } from '@tabler/icons-vue';
import MenuTemplate from '../../src/components/CloudTAK/util/MenuTemplate.vue';
import { useMapStore } from '../../src/stores/map.ts';
import { state, loadCameras, savePrefs, sync } from './lib/state.ts';
import type { Camera } from './lib/state.ts';
import { openCamera } from './lib/open.ts';
import { syncCots } from './lib/cots.ts';

const LIST_LIMIT = 200;
const BIG_SELECTION = 5000;

const pinia = getActivePinia() as Pinia;
const mapStore = useMapStore();

const filter = ref('');
const picking = ref(false);
const placeFilter = ref('');

const pickedLabel = computed(() => {
    if (!state.states.length) return 'Pick states';
    const names = state.states.map((id) => state.sources.find((s) => s.id === id)?.name || id);
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
});

const pickedCount = computed(() => state.sources
    .filter((s) => state.states.includes(s.id))
    .reduce((n, s) => n + s.cameras, 0));

const placeGroups = computed(() => {
    const words = placeFilter.value.toLowerCase().split(/\s+/).filter(Boolean);
    const match = state.sources.filter((s) => words.every((w) => s.name.toLowerCase().includes(w) || s.id.toLowerCase() === w));
    return [
        { label: 'United States', items: match.filter((s) => s.country !== 'CA') },
        { label: 'Canada', items: match.filter((s) => s.country === 'CA') },
    ];
});

const catalogDate = computed(() => {
    const d = new Date(state.catalog.generated);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
});

let placeTimer: ReturnType<typeof setTimeout> | undefined;

function togglePlace(id: string): void {
    state.states = state.states.includes(id) ? state.states.filter((s) => s !== id) : [...state.states, id];
    savePrefs();
    // Wait for a pause in clicking before loading
    if (placeTimer) clearTimeout(placeTimer);
    placeTimer = setTimeout(() => { void loadCameras(); }, 800);
}
const bounds = ref<[number, number, number, number] | null>(null);

function readView(): void {
    const map = mapStore.map;
    if (!map) return;
    const b = map.getBounds();
    bounds.value = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

const counts = computed(() => {
    const live = state.cameras.filter((c) => c.online);
    const video = live.filter((c) => c.video).length;
    return { video, still: live.length - video, offline: state.cameras.length - live.length };
});

const matched = computed<Camera[]>(() => {
    const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
    const box = state.onScreen ? bounds.value : null;

    return state.cameras.filter((c) => {
        if (box && (c.lon < box[0] || c.lon > box[2] || c.lat < box[1] || c.lat > box[3])) return false;
        const name = c.name.toLowerCase();
        return words.every((w) => name.includes(w));
    }).sort((a, b) => a.name.localeCompare(b.name));
});

const shown = computed(() => matched.value.slice(0, LIST_LIMIT));

function goTo(cam: Camera): void {
    mapStore.map.flyTo({ center: [cam.lon, cam.lat], zoom: Math.max(mapStore.map.getZoom(), 12) });
    openCamera(pinia, cam);
}


watch(() => state.visible, async () => {
    savePrefs();
    await syncCots(pinia);
});

watch(() => state.onScreen, savePrefs);


onMounted(async () => {
    readView();
    mapStore.map.on('moveend', readView);
    await loadCameras();
});

onUnmounted(() => {
    mapStore.map.off('moveend', readView);
});
</script>

<style scoped>
.cam-place-list {
    max-height: 260px;
    overflow-y: auto;
}

.cam-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid #ffffff;
    flex: 0 0 auto;
    vertical-align: middle;
}

.cam-dot-video {
    background: #2fb344;
}

.cam-dot-still {
    background: #4299e1;
}

.cam-dot-offline {
    background: #868e96;
}
</style>
