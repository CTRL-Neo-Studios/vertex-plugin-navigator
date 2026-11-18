<script setup lang="ts">
import type {PluginMenuItem} from '@type32/vertex-plugin'
import {computed, nextTick, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch} from 'vue'
import {dateLabel, isNote, tagsOf, withoutExt, type Group, type Item, type SortBy} from './model'
import {toggleKey, type Navigator} from './navigator'

/**
 * The list pane: the files of what's chosen, each a row (its name, some of its text, its tags, its date, a picture),
 * in groups. Selection, the menu, keys and drags are a file manager's; the operations are the kernel's.
 */
const props = defineProps<{
    nav: Navigator
    /** There's room for one pane only: a button goes back to the navigation. */
    back: boolean
    /** Rows as cards in columns (in a tab). */
    grid: boolean
}>()
const emit = defineEmits<{ back: [] }>()
const {nav} = props
const {state, session, t} = nav
const files = session.files

const chosen = computed(() => nav.chosen.value)
const config = computed(() => nav.config.value)
const activeTab = computed(() => session.tabs.active())
const sort = computed(() => nav.sort.value)

// Header tools.
const searching = ref(false)
function toggleSearch() {
    searching.value = !searching.value
    if (!searching.value) nav.query.value = ''
}
const SORTS: SortBy[] = ['modified', 'created', 'name']
const sortMenu = computed(() => [
    SORTS.map(by => ({label: t(`sort.${by}`), type: 'checkbox' as const, checked: sort.value.by === by, onUpdateChecked: () => state.setSort(nav.key.value, {...sort.value, by})})),
    [true, false].map(descending => ({
        label: t(sort.value.by === 'name' ? (descending ? 'sort.za' : 'sort.az') : descending ? 'sort.newest' : 'sort.oldest'),
        type: 'checkbox' as const, checked: sort.value.descending === descending, onUpdateChecked: () => state.setSort(nav.key.value, {...sort.value, descending}),
    })),
])

// Rows: 100 at a time, more as the end comes into view; a folded group keeps its heading.
// ponytail: every row drawn so far stays in the page; a virtual list if lists of tens of thousands get slow.
const STEP = 100
const limit = ref(STEP)
watch([nav.key, nav.query], () => { limit.value = STEP })
const groupKey = (id: string) => `group:${id}`
const shown = computed(() => {
    let room = limit.value
    const groups: (Group & { count: number, folded: boolean })[] = []
    for (const group of nav.groups.value) {
        if (room <= 0) break
        const folded = nav.folded(groupKey(group.id))
        groups.push({id: group.id, count: group.items.length, folded, items: folded ? [] : group.items.slice(0, room)})
        if (!folded) room -= group.items.length
    }
    return groups
})
const shownIds = computed(() => shown.value.flatMap(group => group.items.map(item => item.uuid)))
/** Rows of open groups still to draw. */
const rest = computed(() => nav.groups.value.reduce((n, group) => n + (nav.folded(groupKey(group.id)) ? 0 : group.items.length), 0) > limit.value)
const more = useTemplateRef<HTMLElement>('more')
const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) limit.value += STEP
})
watch(more, (el, old) => {
    if (old) observer.unobserve(old)
    if (el) observer.observe(el)
})
onBeforeUnmount(() => observer.disconnect())

const locale = computed(() => state.ctx.i18n.locale)
function groupLabel(id: string) {
    if (id.startsWith('m:')) return new Intl.DateTimeFormat(locale.value, {month: 'long'}).format(new Date(Number(id.slice(2, 6)), Number(id.slice(7)) - 1))
    return id.startsWith('y:') ? id.slice(2) : t(`groups.${id}`)
}
const dateOf = (item: Item) => dateLabel(sort.value.by === 'created' ? item.createdTime : item.modifiedTime, new Date(), locale.value)
const CLAMP = ['', 'tw:line-clamp-1', 'tw:line-clamp-2', 'tw:line-clamp-3']
const clamp = computed(() => CLAMP[Math.min(Math.max(Math.round(config.value.previewLines), 0), 3)]!)

// Selection, as in a file manager: a click selects one row and opens it, Cmd or Ctrl toggles a row, Shift selects from
// the anchor over the rows as shown.
const selected = nav.selected
let anchor: string | undefined
function select(id: string, event: MouseEvent | KeyboardEvent) {
    const adding = toggleKey(event)
    if (event.shiftKey) {
        const ids = shownIds.value, from = anchor ? ids.indexOf(anchor) : -1, to = ids.indexOf(id)
        const range = from === -1 ? [id] : ids.slice(Math.min(from, to), Math.max(from, to) + 1)
        selected.value = new Set(adding ? [...selected.value, ...range] : range)
        return false
    }
    anchor = id
    if (adding) {
        const next = new Set(selected.value)
        if (!next.delete(id)) next.add(id)
        selected.value = next
        return false
    }
    selected.value = new Set([id])
    return true
}
// What's gone from the list (deleted, moved away, filtered out) leaves the selection.
watch(() => nav.listed.value, list => {
    if (!selected.value.size) return
    const there = new Set(list.map(item => item.uuid))
    if ([...selected.value].some(id => !there.has(id))) selected.value = new Set([...selected.value].filter(id => there.has(id)))
})
/** What Paste, Duplicate and a drop made: selected, so it's seen. */
function added(uuids: string[]) {
    if (!uuids.length) return
    selected.value = new Set(uuids)
    anchor = uuids[0]
}

const list = useTemplateRef<HTMLElement>('list')
const rowId = (event: Event) => (event.target as Element | null)?.closest<HTMLElement>('[data-id]')?.dataset.id
function onRowClick(item: Item, event: MouseEvent) {
    if (select(item.uuid, event)) void session.tabs.open(item.uuid)
}
function onBlankClick(event: MouseEvent) {
    if (!rowId(event)) selected.value = new Set()
}

// Keys, as Files': the clipboard is the system's file list, undo is Files' history.
let clipboardAt = 0
/** On macOS the Edit menu can turn Cmd+C/V into a `copy`/`paste` event instead of a keydown: whichever comes first acts. */
function clipboardOnce(run: () => unknown) {
    if (Date.now() - clipboardAt < 300) return
    clipboardAt = Date.now()
    void run()
}
const paste = async () => added(await files.paste(nav.folder.value))
function onClipboard(event: ClipboardEvent, run: () => unknown) {
    event.preventDefault()
    clipboardOnce(run)
}
function move(by: number, event: KeyboardEvent) {
    const ids = shownIds.value
    if (!ids.length) return
    const at = anchor ? ids.indexOf(anchor) : -1
    const id = ids[Math.min(Math.max(at + by, 0), ids.length - 1)]!
    // Shift extends from where the selection started; without it the row is the selection.
    if (event.shiftKey) {
        const start = anchor
        select(id, event)
        anchor = start
    } else {
        selected.value = new Set([id])
        anchor = id
    }
    void nextTick(() => list.value?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({block: 'nearest'}))
}
function onKeydown(event: KeyboardEvent) {
    const key = event.key.toLowerCase(), mod = toggleKey(event)
    const act = (run: () => unknown) => {
        event.preventDefault()
        void run()
    }
    if (event.key === 'ArrowDown') act(() => move(1, event))
    else if (event.key === 'ArrowUp') act(() => move(-1, event))
    else if (event.key === 'Enter' && anchor && selected.value.has(anchor)) act(() => session.tabs.open(anchor!))
    else if (event.key === 'Escape' && selected.value.size) selected.value = new Set()
    else if (mod && key === 'a') act(() => { selected.value = new Set(shownIds.value) })
    else if (mod && key === 'c' && selected.value.size) act(() => clipboardOnce(() => files.copy([...selected.value])))
    else if (mod && key === 'v') act(() => clipboardOnce(paste))
    else if (selected.value.size && (event.key === 'Delete' || (event.metaKey && event.key === 'Backspace'))) act(() => files.remove([...selected.value]))
    else if (mod && key === 'z') act(() => (event.shiftKey ? files.redo() : files.undo()))
    else if (event.ctrlKey && !event.metaKey && key === 'y') act(() => files.redo())
}

// One menu for the list: the row under the pointer picks its items before it opens. A row's is the kernel's file menu
// (a selection's when the row is in one); the empty space's is New and Paste, into the chosen folder.
const menuRow = shallowRef<string>()
function onContextMenu(event: MouseEvent) {
    const id = rowId(event)
    if (!id || !selected.value.has(id)) {
        selected.value = new Set(id ? [id] : [])
        anchor = id
    }
    menuRow.value = id
}
const menu = computed<PluginMenuItem[][]>(() => {
    if (menuRow.value) return files.menuFor(selected.value.size > 1 ? [...selected.value] : [menuRow.value], {added})
    return [nav.newItems.value, [{label: t('menu.paste'), icon: 'i-lucide-clipboard-paste', onSelect: paste}]]
})

// Drags: a selected row takes the selection with it, another row goes alone. A drop on the list goes to what's
// chosen: into the folder, or onto the tag.
function onDragStart(event: DragEvent) {
    const id = rowId(event)
    if (!id) return
    if (!selected.value.has(id)) {
        selected.value = new Set([id])
        anchor = id
    }
    nav.dragStart(event, [...selected.value], (event.target as Element).closest('[data-id]')?.querySelector('[data-grab]') ?? null)
}
function onDragLeave(event: DragEvent) {
    if (!(event.currentTarget as Element).contains(event.relatedTarget as Node | null)) nav.dropAt.value = undefined
}
const dropping = computed(() => nav.dropAt.value === nav.key.value)

const lookColor = computed(() => nav.look(nav.key.value).color)
const button = {variant: 'ghost', color: 'neutral', size: 'xs'} as const
</script>

<template>
    <div class="tw:flex tw:h-full tw:min-w-0 tw:flex-col">
        <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-0.5 tw:border-b tw:border-default tw:px-2 tw:py-1.5">
            <UTooltip v-if="back" :text="t('back')">
                <UButton v-bind="button" icon="i-lucide-chevron-left" :aria-label="t('back')" @click="emit('back')"/>
            </UTooltip>
            <UIcon :name="nav.iconOf(chosen)" class="tw:ms-1 tw:size-4 tw:shrink-0" :style="{color: lookColor}"/>
            <span class="tw:min-w-0 tw:flex-1 tw:truncate tw:ps-1 tw:text-sm tw:font-medium" :style="{color: lookColor}">{{ nav.nameOf(chosen) }}</span>
            <UTooltip :text="t('search')">
                <UButton v-bind="button" icon="i-lucide-search" :variant="searching ? 'soft' : 'ghost'" :aria-label="t('search')" :aria-pressed="searching" @click="toggleSearch"/>
            </UTooltip>
            <UTooltip v-if="chosen.kind === 'folder'" :text="t('deep')">
                <UButton
                    v-bind="button" icon="i-lucide-layers" :variant="nav.deep.value ? 'soft' : 'ghost'" :color="nav.deep.value ? 'primary' : 'neutral'"
                    :aria-label="t('deep')" :aria-pressed="nav.deep.value" @click="state.setDeep(nav.key.value, !nav.deep.value)"
                />
            </UTooltip>
            <UDropdownMenu :items="sortMenu" size="sm">
                <UButton v-bind="button" icon="i-lucide-arrow-down-wide-narrow" :aria-label="t('sort.title')"/>
            </UDropdownMenu>
            <UTooltip v-if="chosen.kind !== 'property' && !(chosen.kind === 'tag' && !chosen.tag)" :text="t('menu.look')">
                <UButton v-bind="button" icon="i-lucide-palette" :aria-label="t('menu.look')" @click="state.editLook(nav.key.value, nav.nameOf(chosen))"/>
            </UTooltip>
            <UDropdownMenu v-if="chosen.kind === 'folder'" :items="nav.newItems.value" size="sm">
                <UButton v-bind="button" icon="i-lucide-square-pen" :aria-label="t('new')"/>
            </UDropdownMenu>
        </div>
        <div v-if="searching" class="tw:shrink-0 tw:px-2 tw:pt-2">
            <UInput v-model="nav.query.value" autofocus icon="i-lucide-search" size="sm" class="tw:w-full" :placeholder="t('searchPlaceholder')" @keydown.esc="toggleSearch"/>
        </div>

        <UContextMenu :items="menu" size="sm">
            <div
                ref="list"
                tabindex="0"
                :class="['tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:p-2 tw:outline-none', dropping && 'tw:bg-primary/5 tw:ring-1 tw:ring-primary tw:ring-inset']"
                @click="onBlankClick"
                @keydown="onKeydown"
                @contextmenu.capture="onContextMenu"
                @copy="(e: ClipboardEvent) => onClipboard(e, () => files.copy([...selected]))"
                @paste="(e: ClipboardEvent) => onClipboard(e, paste)"
                @dragstart="onDragStart"
                @dragover="nav.dragOver($event, chosen)"
                @dragleave="onDragLeave"
                @drop="nav.drop($event, chosen)"
            >
                <template v-for="group in shown" :key="group.id">
                    <button
                        v-if="group.id !== 'all'"
                        type="button"
                        class="tw:flex tw:w-full tw:items-center tw:border-b tw:border-default tw:px-1 tw:pt-3 tw:pb-1 tw:text-xs tw:font-medium tw:text-muted tw:hover:text-default"
                        :aria-expanded="!group.folded"
                        @click.stop="nav.toggleFold(groupKey(group.id))"
                    >
                        <span class="tw:flex-1 tw:text-start">{{ groupLabel(group.id) }}</span>
                        <span v-if="group.folded" class="tw:pe-1 tw:text-dimmed tw:tabular-nums">{{ group.count }}</span>
                        <UIcon :name="group.folded ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="tw:size-4"/>
                    </button>
                    <div :class="grid ? 'tw:grid tw:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] tw:gap-2 tw:py-2' : 'tw:flex tw:flex-col tw:py-1'">
                        <div
                            v-for="item in group.items" :key="item.uuid"
                            :data-id="item.uuid"
                            draggable="true"
                            :aria-selected="selected.has(item.uuid)"
                            :class="[
                                'tw:flex tw:min-w-0 tw:cursor-default tw:gap-2 tw:rounded-xl tw:px-3 tw:py-2 tw:select-none',
                                grid ? 'tw:flex-col tw:border tw:border-default' : '',
                                selected.has(item.uuid) ? 'tw:bg-primary/20' : item.uuid === activeTab ? 'tw:bg-elevated' : 'tw:hover:bg-elevated/50',
                            ]"
                            @click.stop="onRowClick(item, $event)"
                        >
                            <img
                                v-if="grid && nav.thumbnail(item)" :src="nav.thumbnail(item)" alt="" loading="lazy" decoding="async" draggable="false"
                                class="tw:aspect-video tw:w-full tw:rounded-lg tw:bg-elevated tw:object-cover"
                            >
                            <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
                                <span data-grab class="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:text-sm tw:font-medium" :style="{color: nav.look(`file:${item.relativePath}`).color}">
                                    <UIcon v-if="!isNote(item) || nav.fileIcon(item) !== 'i-lucide-file-text'" :name="nav.fileIcon(item)" class="tw:size-4 tw:shrink-0"/>
                                    <span :class="['tw:truncate', item.uuid === activeTab && 'tw:text-primary']">{{ isNote(item) ? withoutExt(item.fileName) : item.fileName }}</span>
                                </span>
                                <span v-if="clamp && isNote(item) && state.preview(item)" :class="['tw:text-xs tw:text-muted', clamp]">{{ state.preview(item) }}</span>
                                <span v-if="config.showTags && tagsOf(item).length" class="tw:flex tw:gap-1 tw:overflow-hidden tw:py-0.5">
                                    <UBadge
                                        v-for="tag in tagsOf(item)" :key="tag"
                                        :label="tag" size="sm" variant="subtle" color="primary" class="tw:shrink-0 tw:cursor-pointer tw:rounded-full"
                                        :style="{color: nav.look(`tag:${tag}`).color}"
                                        @click.stop="nav.choose({kind: 'tag', tag})"
                                    />
                                </span>
                                <span v-if="config.showDates" class="tw:text-xs tw:text-dimmed">{{ dateOf(item) }}</span>
                            </div>
                            <img
                                v-if="!grid && nav.thumbnail(item)" :src="nav.thumbnail(item)" alt="" loading="lazy" decoding="async" draggable="false"
                                class="tw:size-12 tw:shrink-0 tw:rounded-lg tw:bg-elevated tw:object-cover"
                            >
                        </div>
                    </div>
                </template>
                <!-- A new element each step: watched afresh, it says so again if it's still in view. -->
                <div v-if="rest" ref="more" :key="limit" class="tw:h-px"/>
                <p v-if="!nav.listed.value.length" class="tw:p-6 tw:text-center tw:text-sm tw:text-dimmed">{{ nav.query.value.trim() ? t('noMatches') : t('empty') }}</p>
            </div>
        </UContextMenu>
    </div>
</template>
