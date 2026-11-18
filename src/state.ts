import {useOverlay, useToast} from '@nuxt/ui/composables'
import {frontmatterRange} from '@type32/codemirror-rich-obsidian-editor'
import type {ActiveWorkspaceFileIndex, PluginContext, PluginMenuItem, SessionContext} from '@type32/vertex-plugin'
import {obsidianYaml, retag, setFrontmatterProperty} from '@type32/vertex-plugin/vault'
import {computed, reactive, shallowRef, watch} from 'vue'
import LookModal from './LookModal.vue'
import {
    deviceOf, isNote, keyOf, movedKey, movedPath, movesBetween, previewOf, pushRecent, renamed, tagsOf, toggled, vaultData, withoutExt,
    type Chosen, type Device, type Item, type Look, type Sort, type VaultData,
} from './model'

/** The manifest's settings (`config.schema`). */
export interface Config {
    notesOnly: boolean
    previewLines: number
    showTags: boolean
    showDates: boolean
    showThumbnails: boolean
    groupByDate: boolean
    recentCount: number
    dualPaneWidth: number
}

/** More recent files than any setting shows, so raising it has them. */
const RECENT_KEPT = 30

export type State = ReturnType<typeof createState>
/** The window's state once its data is read: what every navigator in the window (a pane's, a tab's) draws from. */
export const current = shallowRef<State>()

/** The navigator's state in a session: its data in the vault and on this device, and what changes them. */
export function createState(ctx: PluginContext<Config>, session: SessionContext) {
    const root = session.session.rootPath ?? ''
    const t = (key: string, params?: Record<string, unknown>) => ctx.i18n.t(`plugins.navigator.${key}`, params)
    const report = (error: unknown) => void useToast().add({title: t('failed'), description: String(error), color: 'error', icon: 'i-lucide-circle-x'})
    const fileOf = (path: string) => session.index.byPath(path ? `${root}/${path}` : root)

    // The vault's: `.vertex/plugins-data/navigator.json`. A change waits for the first read, so it never writes over
    // what's there.
    const vault = shallowRef(vaultData(undefined))
    const store = ctx.data.workspace
    const vaultRead = Promise.resolve(store?.get()).then(raw => { vault.value = vaultData(raw) }, report)
    store?.onChange(raw => { vault.value = vaultData(raw) })
    const updateVault = (change: (data: VaultData) => VaultData | undefined) => vaultRead.then(() => {
        const next = change(vault.value)
        if (!next) return
        vault.value = next
        return store?.set(next)
    }).catch(report)

    // This device's: one document for every workspace, by root.
    // ponytail: read and written whole, so two windows writing at once keep the later one's; a document per workspace
    // if that ever loses something that matters.
    const devices = shallowRef<Record<string, unknown>>({})
    const all = (raw: unknown) => (typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {})
    const deviceRead = ctx.data.global.get().then(raw => { devices.value = all(raw) }, report)
    ctx.data.global.onChange(raw => { devices.value = all(raw) })
    const device = computed(() => deviceOf(devices.value[root]))
    const updateDevice = (change: (data: Device) => Partial<Device>) => deviceRead.then(() => {
        const next = {...device.value, ...change(device.value)}
        // Nothing changed (a rename of something it doesn't name): nothing written.
        if (JSON.stringify(next) === JSON.stringify(device.value)) return
        devices.value = {...devices.value, [root]: next}
        return ctx.data.global.set(devices.value)
    }).catch(report)

    // Recent files: the shown tab's file, as tabs change.
    watch(() => session.tabs.active(), id => {
        const file = id ? session.index.byUuid(id) : undefined
        if (!file || file.isFolder) return
        void updateDevice(data => (data.recent[0] === file.relativePath ? {} : {recent: pushRecent(data.recent, file.relativePath, RECENT_KEPT)}))
    }, {immediate: true})

    // What's kept by path follows a rename or a move. Vertex's own aren't index events (`session.index.on` hears what
    // other programs do), but a file keeps its uuid through one: a uuid whose path changed has moved.
    const moved = new Set<(from: string, to: string) => void>()
    /** Runs `fn` for each rename or move (workspace-relative paths); returns what stops it. */
    const onMoved = (fn: (from: string, to: string) => void) => {
        moved.add(fn)
        return () => void moved.delete(fn)
    }
    watch(() => new Map(session.index.files().map(file => [file.uuid, file.relativePath])), (now, before) => {
        for (const {from, to} of movesBetween(before, now)) for (const fn of moved) fn(from, to)
    })
    onMoved((from, to) => {
        void updateVault(data => renamed(data, from, to))
        void updateDevice(data => ({recent: data.recent.map(path => movedPath(path, from, to)), chosen: data.chosen && movedKey(data.chosen, from, to)}))
    })

    // Previews, read for the rows drawn and kept until the note changes.
    const previews = reactive(new Map<string, { at: number, text: string }>())
    const reading = new Set<string>()
    function preview(item: Item): string {
        const path = item.relativePath, at = item.modifiedTime.getTime(), had = previews.get(path)
        if (had?.at !== at && !reading.has(path)) {
            reading.add(path)
            void session.files.vault().read(path)
                .then(text => previews.set(path, {at, text: previewOf(text)}), () => previews.set(path, {at, text: ''}))
                .finally(() => reading.delete(path))
        }
        return had?.text ?? ''
    }

    const pin = (paths: string[], on: boolean) => updateVault(data => ({...data, pinned: on ? [...new Set([...data.pinned, ...paths])] : data.pinned.filter(p => !paths.includes(p))}))
    const shortcut = (key: string) => updateVault(data => ({...data, shortcuts: toggled(data.shortcuts, key)}))
    const setSort = (key: string, sort: Sort) => updateVault(data => ({...data, sort: {...data.sort, [key]: sort}}))
    const setDeep = (key: string, on: boolean) => updateVault(data => ({...data, deep: toggled(data.deep, key, on)}))
    const setLook = (key: string, look: Look) => updateVault(data => {
        const looks = {...data.looks}
        if (look.color || look.icon) looks[key] = look
        else delete looks[key]
        return {...data, looks}
    })

    const overlay = useOverlay()
    /** The colour and icon of a folder, a tag or a file, in a dialog; each change is kept as it's made. */
    function editLook(key: string, name: string) {
        void overlay.create(LookModal, {destroyOnClose: true}).open({name, look: vault.value.looks[key] ?? {}, t, onChange: (look: Look) => void setLook(key, look)})
    }

    const yaml = obsidianYaml(frontmatterRange)
    /** Adds `tag` to the notes' frontmatter, as one step of Files' undo. */
    async function addTag(uuids: string[], tag: string) {
        const edits: { uuid: string, text: string }[] = []
        for (const uuid of uuids) {
            const file = session.index.byUuid(uuid)
            if (!file || !isNote(file) || tagsOf(file).includes(tag)) continue
            const change = retag(file.properties, tag, true)
            if (!change) continue
            // An open note's text as it is now, saved or not.
            const text = session.editor.content(uuid) ?? await session.files.vault().read(file.relativePath)
            edits.push({uuid, text: setFrontmatterProperty(text, change.key, change.tags, yaml)})
        }
        if (edits.length) await session.files.edit(edits, t('tagged', {tag, count: edits.length}))
    }

    const shortcutItem = (key: string): PluginMenuItem => vault.value.shortcuts.includes(key)
        ? {label: t('menu.removeShortcut'), icon: 'i-lucide-star-off', onSelect: () => shortcut(key)}
        : {label: t('menu.addShortcut'), icon: 'i-lucide-star', onSelect: () => shortcut(key)}
    const lookItem = (key: string, name: string): PluginMenuItem => ({label: t('menu.look'), icon: 'i-lucide-palette', onSelect: () => editLook(key, name)})

    /** The navigator's items in the kernel's file menu (so Files' menu has them too): pins, shortcuts, the look. */
    function fileMenu(files: ActiveWorkspaceFileIndex[]): PluginMenuItem[] {
        const items: PluginMenuItem[] = []
        const paths = files.filter(f => !f.isFolder).map(f => f.relativePath)
        if (paths.length && paths.length === files.length) {
            const pinned = paths.every(path => vault.value.pinned.includes(path))
            items.push({label: t(pinned ? 'menu.unpin' : 'menu.pin'), icon: pinned ? 'i-lucide-pin-off' : 'i-lucide-pin', onSelect: () => pin(paths, !pinned)})
        }
        const [only] = files
        if (only && files.length === 1) {
            const key = only.isFolder ? keyOf({kind: 'folder', path: only.relativePath}) : `file:${only.relativePath}`
            items.push(shortcutItem(key), lookItem(key, only.isFolder ? only.fileName : withoutExt(only.fileName)))
        }
        return items
    }

    /** The menu of a tag or a property, which the kernel's file menu knows nothing of. */
    const chosenMenu = (chosen: Chosen, name: string): PluginMenuItem[] =>
        [shortcutItem(keyOf(chosen)), ...(chosen.kind === 'tag' && chosen.tag ? [lookItem(keyOf(chosen), name)] : [])]

    /** A choice to show, asked for from outside the views (a command). */
    const request = shallowRef<{ chosen: Chosen }>()

    const state = {
        ctx, session, root, t, report, fileOf, vault, device, updateDevice, onMoved, preview, pin, shortcut, setSort, setDeep, setLook, editLook,
        addTag, fileMenu, chosenMenu, request,
    }
    void Promise.all([vaultRead, deviceRead]).then(() => { current.value = state })
    return state
}
