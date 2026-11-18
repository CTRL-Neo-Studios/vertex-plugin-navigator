/**
 * What the navigator shows, worked out from the index's entries: tags, properties, what a choice lists, its order and
 * groups, a note's preview. Nothing here touches Vertex, so `bun test` runs it.
 */

/** What the navigator reads of an index entry (`ActiveWorkspaceFileIndex` has all of it). */
export interface Item {
    uuid: string
    /** Workspace-relative, `/` separated. */
    relativePath: string
    /** Absolute. */
    fullPath: string
    /** With its extension. */
    fileName: string
    /** Without the dot. */
    fileExt: string
    isFolder: boolean
    properties: Record<string, unknown>
    meta: { tags: string[], embeds: { link: string }[] }
    createdTime: Date
    modifiedTime: Date
}

/** What the list shows: a folder (`''` is the workspace), a tag (`''` is Untagged), or a property (any value, or one). */
export type Chosen =
    | { kind: 'folder', path: string }
    | { kind: 'tag', tag: string }
    | { kind: 'property', key: string, value?: string }

/** A choice as a string: what the data is kept by, and what a shortcut holds (a file's is `file:<path>`). */
export const keyOf = (chosen: Chosen) =>
    chosen.kind === 'folder' ? `folder:${chosen.path}`
        : chosen.kind === 'tag' ? `tag:${chosen.tag}`
            : `property:${JSON.stringify(chosen.value === undefined ? [chosen.key] : [chosen.key, chosen.value])}`

export function chosenOf(key: string): Chosen | undefined {
    if (key.startsWith('folder:')) return {kind: 'folder', path: key.slice(7)}
    if (key.startsWith('tag:')) return {kind: 'tag', tag: key.slice(4)}
    if (!key.startsWith('property:')) return undefined
    try {
        const [name, value] = JSON.parse(key.slice(9)) as unknown[]
        if (typeof name !== 'string') return undefined
        return typeof value === 'string' ? {kind: 'property', key: name, value} : {kind: 'property', key: name}
    } catch {
        return undefined
    }
}

export const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0))
export const withoutExt = (name: string) => (name.lastIndexOf('.') > 0 ? name.slice(0, name.lastIndexOf('.')) : name)
export const isNote = (item: Item) => !item.isFolder && item.fileExt.toLowerCase() === 'md'
const under = (path: string, folder: string) => folder === '' || path.startsWith(`${folder}/`)

// Tags

const strings = (raw: unknown): string[] =>
    (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : []).filter((t): t is string => typeof t === 'string')

/** A note's tags, frontmatter's then the text's: lowercase, without `#`, each once. */
export function tagsOf(item: Item): string[] {
    if (!isNote(item)) return []
    const all = [...strings(item.properties.tags ?? item.properties.tag), ...item.meta.tags]
    // `#a//b/` is `a/b`.
    return [...new Set(all.map(t => t.trim().replace(/^#/, '').toLowerCase().split('/').filter(Boolean).join('/')).filter(Boolean))]
}

export interface TagNode {
    /** The whole tag (`project/alpha`). */
    tag: string
    /** Its last part (`alpha`). */
    name: string
    /** Notes with it or with one nested under it. */
    count: number
    children: TagNode[]
}

const byName = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'})

/** Tags nested by `/`, each with its count, and how many notes have none. */
export function tagTree(items: Item[]): { tags: TagNode[], untagged: number } {
    const notes = new Map<string, Set<string>>()
    let untagged = 0
    for (const item of items) {
        if (!isNote(item)) continue
        const tags = tagsOf(item)
        if (!tags.length) untagged++
        for (const tag of tags) {
            // A note tagged `a/b` counts under `a` too.
            for (let end = tag.indexOf('/'); ; end = tag.indexOf('/', end + 1)) {
                const part = end === -1 ? tag : tag.slice(0, end)
                if (part) (notes.get(part) ?? notes.set(part, new Set()).get(part)!).add(item.uuid)
                if (end === -1) break
            }
        }
    }
    const nodes = new Map<string, TagNode>(), tags: TagNode[] = []
    // Parents before their children, then by name.
    const depth = (tag: string) => tag.split('/').length
    for (const tag of [...notes.keys()].sort((a, b) => depth(a) - depth(b) || byName.compare(a, b))) {
        const node: TagNode = {tag, name: tag.slice(tag.lastIndexOf('/') + 1), count: notes.get(tag)!.size, children: []}
        nodes.set(tag, node)
        ;(nodes.get(parentOf(tag))?.children ?? tags).push(node)
    }
    return {tags, untagged}
}

// Properties

/** A property's values as the navigator lists them: each of a list's, a scalar as text; nothing for an empty one. */
export function valuesOf(value: unknown): string[] {
    const list = Array.isArray(value) ? value : [value]
    return [...new Set(list.filter(v => ['string', 'number', 'boolean'].includes(typeof v) && v !== '').map(String))]
}

export interface PropertyNode {
    key: string
    /** Notes that have it. */
    count: number
    /** Most used first. */
    values: { value: string, count: number }[]
}

/** The properties notes have (Tags lists `tags`), each with its values. */
export function propertyTree(items: Item[]): PropertyNode[] {
    const keys = new Map<string, { count: number, values: Map<string, number> }>()
    for (const item of items) {
        if (!isNote(item)) continue
        for (const [key, value] of Object.entries(item.properties)) {
            if (key === 'tags' || key === 'tag') continue
            const node = keys.get(key) ?? keys.set(key, {count: 0, values: new Map()}).get(key)!
            node.count++
            for (const v of valuesOf(value)) node.values.set(v, (node.values.get(v) ?? 0) + 1)
        }
    }
    return [...keys].sort(([a], [b]) => byName.compare(a, b)).map(([key, {count, values}]) => ({
        key, count,
        values: [...values].map(([value, n]) => ({value, count: n})).sort((a, b) => b.count - a.count || byName.compare(a.value, b.value)),
    }))
}

// Lists

/** Files in each folder (`''`: the top level): `direct` its own, `deep` with its subfolders'. */
export function folderCounts(items: Item[], notesOnly: boolean) {
    const direct = new Map<string, number>(), deep = new Map<string, number>()
    const add = (map: Map<string, number>, path: string) => map.set(path, (map.get(path) ?? 0) + 1)
    for (const item of items) {
        if (item.isFolder || (notesOnly && !isNote(item))) continue
        let folder = parentOf(item.relativePath)
        add(direct, folder)
        for (; ; folder = parentOf(folder)) {
            add(deep, folder)
            if (!folder) break
        }
    }
    return {direct, deep}
}

/** The files a choice lists: never folders; `deep` takes a folder's subfolders in. */
export function listFor(items: Item[], chosen: Chosen, options: { deep: boolean, notesOnly: boolean }): Item[] {
    const files = items.filter(item => !item.isFolder && (!options.notesOnly || isNote(item)))
    if (chosen.kind === 'folder') {
        return files.filter(item => options.deep ? under(item.relativePath, chosen.path) : parentOf(item.relativePath) === chosen.path)
    }
    const notes = files.filter(isNote)
    if (chosen.kind === 'tag') {
        if (!chosen.tag) return notes.filter(item => !tagsOf(item).length)
        return notes.filter(item => tagsOf(item).some(tag => tag === chosen.tag || tag.startsWith(`${chosen.tag}/`)))
    }
    return notes.filter(item => chosen.key in item.properties && (chosen.value === undefined || valuesOf(item.properties[chosen.key]).includes(chosen.value)))
}

/** Every word of `query` is in the name or a tag; a `#word` only in a tag. */
export function matches(item: Item, query: string): boolean {
    const name = item.fileName.toLowerCase(), tags = tagsOf(item)
    return query.toLowerCase().split(/\s+/).filter(Boolean).every(word =>
        word.startsWith('#') ? tags.some(tag => tag.includes(word.slice(1))) : name.includes(word) || tags.some(tag => tag.includes(word)))
}

export type SortBy = 'modified' | 'created' | 'name'
export interface Sort {
    by: SortBy
    descending: boolean
}
export const DEFAULT_SORT: Sort = {by: 'modified', descending: true}

const dateOf = (item: Item, sort: Sort) => (sort.by === 'created' ? item.createdTime : item.modifiedTime)

/** A new list in `sort`'s order; names compare as people read them (`Note 2` before `Note 10`). */
export function sortItems(items: Item[], sort: Sort): Item[] {
    const order = sort.by === 'name'
        ? (a: Item, b: Item) => byName.compare(a.fileName, b.fileName)
        : (a: Item, b: Item) => dateOf(a, sort).getTime() - dateOf(b, sort).getTime() || byName.compare(a.fileName, b.fileName)
    return [...items].sort(sort.descending ? (a, b) => order(b, a) : order)
}

export interface Group {
    /** `pinned`, `all`, `today`, `yesterday`, `week`, `month` (the previous 30 days), `m:2026-10` (a month), `y:2025` (a year). */
    id: string
    items: Item[]
}

const DAY = 86_400_000

/**
 * A sorted list as groups: the pinned ones first, the rest by the date it's sorted by (or all together, sorted by
 * name or with `byDate` off). Groups come in the list's order.
 */
export function groupItems(sorted: Item[], sort: Sort, pinned: ReadonlySet<string>, now: Date, byDate: boolean): Group[] {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const idOf = (item: Item) => {
        if (pinned.has(item.relativePath)) return 'pinned'
        if (!byDate || sort.by === 'name') return 'all'
        const date = dateOf(item, sort), at = date.getTime()
        // A date ahead of the clock (another device's) is today's.
        if (at >= today) return 'today'
        if (at >= today - DAY) return 'yesterday'
        if (at >= today - 7 * DAY) return 'week'
        if (at >= today - 30 * DAY) return 'month'
        if (date.getFullYear() === now.getFullYear()) return `m:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        return `y:${date.getFullYear()}`
    }
    const groups = new Map<string, Item[]>([['pinned', []]])
    for (const item of sorted) {
        const id = idOf(item)
        ;(groups.get(id) ?? groups.set(id, []).get(id)!).push(item)
    }
    return [...groups].filter(([, items]) => items.length).map(([id, items]) => ({id, items}))
}

/** A row's date: the time today, the weekday within a week, the date before that. */
export function dateLabel(date: Date, now: Date, locale: string): string {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), at = date.getTime()
    if (at >= today) return new Intl.DateTimeFormat(locale, {hour: 'numeric', minute: '2-digit'}).format(date)
    if (at >= today - 6 * DAY) return new Intl.DateTimeFormat(locale, {weekday: 'long'}).format(date)
    return new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}).format(date)
}

// Previews

const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$)/
const NOT_TEXT = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n[\s\S]*?\n {0,3}\1[^\n]*|[\s\S]*)|<!--[\s\S]*?-->|%%[\s\S]*?%%|\$\$[\s\S]*?\$\$/gm

/**
 * A note's text as a few plain words: no frontmatter, code, comments or Markdown marks, at most `max` characters.
 * ponytail: patterns over the text, not the editor's parser; marks inside words (`snake_case`, `2*3`) can go too.
 * Parse with `@lezer/markdown` if previews read wrong.
 */
export function previewOf(markdown: string, max = 240): string {
    return markdown
        .replace(FRONTMATTER, '')
        .replace(NOT_TEXT, ' ')
        .replace(/!\[\[[^\]\n]*\]\]|!\[[^\]\n]*\]\([^)\n]*\)/g, ' ')
        .replace(/\[\[(?:[^\]|\n]*\|)?([^\]\n]*)\]\]/g, '$1')
        .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
        .replace(/<[^>\n]+>/g, ' ')
        .replace(/^\s*(?:>\s*)*(?:\[![^\]\n]*\][+-]?\s*)?(?:#{1,6}\s+|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)?/gm, '')
        .replace(/^\s*(?:[-*_]\s*){3,}$|^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
        .replace(/[*_~`=|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
}

// What the vault remembers

export interface Look {
    /** A CSS colour. */
    color?: string
    /** An Iconify name (`i-lucide-star`). */
    icon?: string
}

/** The navigator's data in a workspace (`ctx.data.workspace`), by workspace-relative paths and choices' keys. */
export interface VaultData {
    /** Choices' keys, and `file:<path>` for a file. */
    shortcuts: string[]
    /** Files' paths. */
    pinned: string[]
    /** By choice key. */
    looks: Record<string, Look>
    sort: Record<string, Sort>
    /** Folders (their keys) listed with their subfolders. */
    deep: string[]
}

const list = (raw: unknown) => (Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [])
const record = (raw: unknown) => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : {})
const text = (raw: unknown) => (typeof raw === 'string' && raw ? raw : undefined)

/** The data as read from a vault's file, which anyone may have written: only what fits is kept. */
export function vaultData(raw: unknown): VaultData {
    const data = record(raw)
    const looks: VaultData['looks'] = {}, sort: VaultData['sort'] = {}
    for (const [key, value] of Object.entries(record(data.looks))) {
        const look = {color: text(record(value).color), icon: text(record(value).icon)}
        if (look.color || look.icon) looks[key] = look
    }
    for (const [key, value] of Object.entries(record(data.sort))) {
        const by = record(value).by
        if (by === 'modified' || by === 'created' || by === 'name') sort[key] = {by, descending: record(value).descending === true}
    }
    return {shortcuts: list(data.shortcuts), pinned: list(data.pinned), looks, sort, deep: list(data.deep)}
}

/** `path` after `from` (a file, or a folder with what's in it) became `to`. */
export const movedPath = (path: string, from: string, to: string) => (path === from || path.startsWith(`${from}/`) ? to + path.slice(from.length) : path)
/** A file's or folder's key after that; any other key as it is. */
export const movedKey = (key: string, from: string, to: string) =>
    (key.startsWith('file:') ? `file:${movedPath(key.slice(5), from, to)}` : key.startsWith('folder:') ? `folder:${movedPath(key.slice(7), from, to)}` : key)

/**
 * The renames and moves between two readings of the index (uuid → path): a file keeps its uuid through one. What's
 * inside a moved folder goes with it and isn't listed.
 */
export function movesBetween(before: ReadonlyMap<string, string>, now: ReadonlyMap<string, string>): { from: string, to: string }[] {
    const moves: { from: string, to: string }[] = []
    for (const [uuid, to] of now) {
        const from = before.get(uuid)
        if (from !== undefined && from !== to) moves.push({from, to})
    }
    // Folders before what's in them.
    moves.sort((a, b) => a.from.length - b.from.length)
    const kept: typeof moves = []
    for (const move of moves) {
        if (!kept.some(outer => move.from.startsWith(`${outer.from}/`) && movedPath(move.from, outer.from, outer.to) === move.to)) kept.push(move)
    }
    return kept
}

/** The data after `from` was renamed or moved to `to`; `undefined` when it names nothing there. */
export function renamed(data: VaultData, from: string, to: string): VaultData | undefined {
    const key = (k: string) => movedKey(k, from, to)
    const keys = <T>(map: Record<string, T>) => Object.fromEntries(Object.entries(map).map(([k, v]) => [key(k), v]))
    const next: VaultData = {
        shortcuts: data.shortcuts.map(key), pinned: data.pinned.map(p => movedPath(p, from, to)), looks: keys(data.looks), sort: keys(data.sort), deep: data.deep.map(key),
    }
    return JSON.stringify(next) === JSON.stringify(data) ? undefined : next
}

/** The navigator's state on this device for one workspace (`ctx.data.global`, by the workspace's root). */
export interface Device {
    /** Files' paths, the last shown first. */
    recent: string[]
    /** The choice's key. */
    chosen?: string
    /** Sections and groups folded shut (they start open). */
    folded: string[]
    /** Tags and properties opened (their keys; they start shut). */
    open: string[]
}

export function deviceOf(raw: unknown): Device {
    const data = record(raw)
    return {recent: list(data.recent), chosen: text(data.chosen), folded: list(data.folded), open: list(data.open)}
}

/** `list` with `value` in or out. */
export const toggled = (list: string[], value: string, on = !list.includes(value)) =>
    (on ? (list.includes(value) ? list : [...list, value]) : list.filter(v => v !== value))

/** Recent files with `path` first, each once, at most `max`. */
export const pushRecent = (recent: string[], path: string, max: number) => [path, ...recent.filter(p => p !== path)].slice(0, Math.max(max, 0))
