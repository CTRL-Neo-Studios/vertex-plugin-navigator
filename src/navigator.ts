import {isImage} from '@type32/vertex-plugin/files'
import {computed, onScopeDispose, ref, shallowRef, watch} from 'vue'
import {
    chosenOf, DEFAULT_SORT, folderCounts, groupItems, isNote, keyOf, listFor, matches, movedKey, parentOf, propertyTree, sortItems, tagTree,
    tagsOf, toggled, type Chosen, type Item, type Look,
} from './model'
import type {State} from './state'

export type Navigator = ReturnType<typeof useNavigator>

const ROOT: Chosen = {kind: 'folder', path: ''}
const mac = /Mac|iPhone|iPad/.test(navigator.platform)
/** Cmd on a Mac, Ctrl elsewhere: what toggles a row in a selection. */
export const toggleKey = (event: MouseEvent | KeyboardEvent) => (mac ? event.metaKey : event.ctrlKey)

// The rows this window's navigator is dragging, by uuid. One for the window: a row dragged from the pane's navigator
// may drop on the tab's.
let dragged: string[] = []

/** One navigator's own state (a pane's, or a tab's): what it has chosen, what that lists, its selection and drops. */
export function useNavigator(state: State) {
    const {session, ctx, t} = state
    const config = computed(() => ctx.config.value)
    const items = computed<Item[]>(() => session.index.files())

    const saved = chosenOf(state.device.value.chosen ?? '')
    const chosen = shallowRef<Chosen>(saved ?? ROOT)
    /** Which pane shows while there's room for one. */
    const pane = ref<'nav' | 'list'>(saved ? 'list' : 'nav')
    const key = computed(() => keyOf(chosen.value))
    const query = ref('')
    function choose(next: Chosen) {
        chosen.value = next
        pane.value = 'list'
        query.value = ''
        selected.value = new Set()
        void state.updateDevice(() => ({chosen: keyOf(next)}))
    }
    onScopeDispose(state.onMoved((from, to) => {
        const moved = movedKey(key.value, from, to)
        if (moved !== key.value) chosen.value = chosenOf(moved) ?? ROOT
    }))
    watch(state.request, asked => asked && choose(asked.chosen))
    // A chosen folder that's gone (deleted, or the vault changed under it) gives way to the workspace.
    watch(() => chosen.value.kind === 'folder' && chosen.value.path !== '' && !state.fileOf(chosen.value.path)?.isFolder, gone => {
        if (gone) chosen.value = ROOT
    })

    const counts = computed(() => folderCounts(items.value, config.value.notesOnly))
    const tags = computed(() => tagTree(items.value))
    const properties = computed(() => propertyTree(items.value))
    const isDeep = (folderKey: string) => state.vault.value.deep.includes(folderKey)
    /** How many files a folder's row says it has: what its list would show. */
    const folderCount = (path: string) => (isDeep(keyOf({kind: 'folder', path})) ? counts.value.deep : counts.value.direct).get(path) ?? 0

    const deep = computed(() => chosen.value.kind === 'folder' && isDeep(key.value))
    const sort = computed(() => state.vault.value.sort[key.value] ?? DEFAULT_SORT)
    const listed = computed(() => {
        const all = listFor(items.value, chosen.value, {deep: deep.value, notesOnly: config.value.notesOnly})
        const words = query.value.trim()
        return sortItems(words ? all.filter(item => matches(item, words)) : all, sort.value)
    })
    // ponytail: "today" is when the list was last worked out; a list left open over midnight regroups on its next change.
    const groups = computed(() => groupItems(listed.value, sort.value, new Set(state.vault.value.pinned), new Date(), config.value.groupByDate))

    const workspaceName = computed(() => state.root.slice(state.root.lastIndexOf('/') + 1))
    const look = (lookKey: string): Look => state.vault.value.looks[lookKey] ?? {}
    function nameOf(c: Chosen): string {
        if (c.kind === 'folder') return c.path ? c.path.slice(c.path.lastIndexOf('/') + 1) : workspaceName.value
        if (c.kind === 'tag') return c.tag ? c.tag.slice(c.tag.lastIndexOf('/') + 1) : t('untagged')
        return c.value === undefined ? c.key : `${c.key}: ${c.value}`
    }
    const iconOf = (c: Chosen): string => look(keyOf(c)).icon
        ?? (c.kind === 'folder' ? (c.path ? 'i-lucide-folder' : 'i-lucide-library-big') : c.kind === 'tag' ? 'i-lucide-tag' : c.value === undefined ? 'i-lucide-braces' : 'i-lucide-equal')
    /** A file's icon: the navigator's, its own `icon` property, its file type's, or a note's or file's plain one. */
    function fileIcon(item: Item): string {
        const own = item.properties.icon
        return look(`file:${item.relativePath}`).icon ?? (typeof own === 'string' && own ? own : undefined)
            ?? session.files.iconFor(item.fileName) ?? (isNote(item) ? 'i-lucide-file-text' : isImage(item.fileExt.toLowerCase()) ? 'i-lucide-image' : 'i-lucide-file')
    }
    /**
     * What a row shows as its picture: an image file itself, or the first image of the workspace a note embeds.
     * ponytail: the webview scales the whole image down; thumbnails made and kept by the kernel if big photos stutter.
     */
    function thumbnail(item: Item): string | undefined {
        if (!config.value.showThumbnails) return undefined
        if (isImage(item.fileExt.toLowerCase())) return session.files.assetUrl(item.fullPath)
        for (const embed of item.meta.embeds) {
            const target = embed.link.split('#')[0]!
            if (!isImage(target.slice(target.lastIndexOf('.') + 1).toLowerCase())) continue
            const file = session.index.resolveLink(target)
            if (file) return session.files.assetUrl(file.fullPath)
        }
        return undefined
    }

    const folded = (id: string) => state.device.value.folded.includes(id)
    const toggleFold = (id: string) => void state.updateDevice(data => ({folded: toggled(data.folded, id)}))
    const opened = (id: string) => state.device.value.open.includes(id)
    const toggleOpen = (id: string, on?: boolean) => void state.updateDevice(data => ({open: toggled(data.open, id, on)}))

    /** The list's selected rows (uuids). */
    const selected = shallowRef(new Set<string>())
    /** Where New and Paste go: the chosen folder, or the top level under a tag or a property. */
    const folder = computed(() => (chosen.value.kind === 'folder' ? chosen.value.path : ''))
    const newItems = computed(() => session.files.newItems(folder.value))

    // Drops, as in Files: on a folder, into it (rows move; the system's files are copied in); on a tag, the notes get it.
    /** The key of the target a drag is over. */
    const dropAt = shallowRef<string>()
    const filesOf = (uuids: string[]) => uuids.map(uuid => session.index.byUuid(uuid)).filter(file => !!file)
    function dragStart(event: DragEvent, uuids: string[], grab: Element | null) {
        dragged = uuids
        session.files.drag.start(event, uuids, grab, () => {
            dragged = []
            dropAt.value = undefined
        })
    }
    function accepts(event: DragEvent, target: Chosen): boolean {
        if (target.kind === 'property' || (target.kind === 'tag' && !target.tag)) return false
        const files = filesOf(dragged)
        // Not this navigator's rows: Files' rows or the system's files, known only at the drop.
        if (!files.length) return session.files.drag.carries(event.dataTransfer)
        if (target.kind === 'tag') return files.some(file => isNote(file) && !tagsOf(file).includes(target.tag))
        // No folder into itself or below it, and something that isn't there already.
        if (files.some(file => file.isFolder && (target.path === file.relativePath || target.path.startsWith(`${file.relativePath}/`)))) return false
        return files.some(file => parentOf(file.relativePath) !== target.path)
    }
    function dragOver(event: DragEvent, target: Chosen | undefined) {
        const ok = !!target && accepts(event, target)
        dropAt.value = ok ? keyOf(target) : undefined
        if (!ok) return
        event.preventDefault()
        // The app's drag of rows is a native one, which only offers a copy: a move under it says copy, or it's refused.
        if (event.dataTransfer) event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files') ? 'copy' : 'move'
    }
    async function drop(event: DragEvent, target: Chosen | undefined) {
        const own = dragged, ok = !!target && accepts(event, target)
        dropAt.value = undefined
        if (!ok) return
        event.preventDefault()
        try {
            if (target.kind === 'tag') {
                const rows = own.length ? own : (session.files.drag.rows(event.dataTransfer) ?? []).map(path => state.fileOf(path.replace(/\/$/, ''))?.uuid).filter(uuid => !!uuid)
                await state.addTag(rows as string[], target.tag)
            } else if (target.kind === 'folder') {
                if (own.length) await session.files.move(own, target.path)
                // Taken while the event lasts. Option/Alt copies the workspace's own files instead of moving them.
                else selected.value = new Set(await session.files.importDrop(event.dataTransfer!, target.path, {copy: event.altKey}))
            }
        } catch (error) {
            state.report(error)
        }
    }

    return {
        state, session, t, config, items, chosen, key, pane, query, choose, counts, tags, properties, folderCount, deep, sort, listed, groups,
        workspaceName, look, nameOf, iconOf, fileIcon, thumbnail, folded, toggleFold, opened, toggleOpen, selected, folder, newItems,
        dropAt, dragStart, dragOver, drop,
    }
}
