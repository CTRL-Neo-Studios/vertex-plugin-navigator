<script setup lang="ts">
import type {PluginMenuItem, UITreeNode} from '@type32/vertex-plugin'
import {computed, shallowRef} from 'vue'
import {chosenOf, keyOf, toggled, withoutExt, type Chosen, type TagNode} from './model'
import NavRow from './NavRow.vue'
import type {Navigator} from './navigator'

/** The navigation pane: shortcuts, recent files, the folders, the tags, the properties. A click chooses what the list shows. */
const props = defineProps<{ nav: Navigator }>()
const {nav} = props
const {state, session, t} = nav

/** Values shown under a property; one with more (a title, a date) says how many it leaves out. */
const VALUES_SHOWN = 100

const activeTab = computed(() => session.tabs.active())
const isChosen = (key: string) => nav.key.value === key
const folderKey = (path: string) => keyOf({kind: 'folder', path})
const tagKey = (tag: string) => keyOf({kind: 'tag', tag})

// Folders: the index's tree without its files, the open ones the session's (so Files shows the same ones open).
const openFolders = session.files.openFolders
const folderRows = computed(() => {
    const open = new Set(openFolders.value), rows: { node: UITreeNode, level: number, nested: boolean }[] = []
    const walk = (nodes: UITreeNode[], level: number) => {
        for (const node of nodes) {
            if (!node.isFolder) continue
            const nested = node.children.some(child => child.isFolder)
            rows.push({node, level, nested})
            if (nested && open.has(node.uuid)) walk(node.children, level + 1)
        }
    }
    walk(session.index.tree(), 1)
    return rows
})
const toggleFolder = (uuid: string, on?: boolean) => { openFolders.value = toggled(openFolders.value, uuid, on) }

const tagRows = computed(() => {
    const rows: { node: TagNode, level: number }[] = []
    const walk = (nodes: TagNode[], level: number) => {
        for (const node of nodes) {
            rows.push({node, level})
            if (node.children.length && nav.opened(tagKey(node.tag))) walk(node.children, level + 1)
        }
    }
    walk(nav.tags.value.tags, 1)
    return rows
})

type Shortcut = { key: string, label: string, icon: string, color?: string, uuid?: string, chosen?: Chosen }
/** The shortcuts that still name something: a file or folder of the workspace, a tag, a property. */
const shortcuts = computed(() => state.vault.value.shortcuts.flatMap((key): Shortcut[] => {
    const color = nav.look(key).color
    if (key.startsWith('file:')) {
        const file = state.fileOf(key.slice(5))
        return file && !file.isFolder ? [{key, label: withoutExt(file.fileName), icon: nav.fileIcon(file), color, uuid: file.uuid}] : []
    }
    const chosen = chosenOf(key)
    if (!chosen) return []
    const folder = chosen.kind === 'folder' ? state.fileOf(chosen.path) : undefined
    if (chosen.kind === 'folder' && chosen.path && !folder?.isFolder) return []
    return [{key, label: nav.nameOf(chosen), icon: nav.iconOf(chosen), color, uuid: chosen.kind === 'folder' && chosen.path ? folder?.uuid : undefined, chosen}]
}))
const recent = computed(() => state.device.value.recent.map(state.fileOf).filter(file => !!file && !file.isFolder).slice(0, nav.config.value.recentCount))

function openShortcut(shortcut: Shortcut) {
    if (shortcut.chosen) nav.choose(shortcut.chosen)
    else if (shortcut.uuid) void session.tabs.open(shortcut.uuid)
}

// One menu for the pane: the row under the pointer picks its items before it opens. A file or a folder gets the
// kernel's file menu (with the navigator's items in it), a tag or a property the navigator's own, anything else the
// menu of Files' empty space.
const menuRow = shallowRef<{ key?: string, uuid?: string }>({})
const rowOf = (event: Event) => (event.target as Element | null)?.closest<HTMLElement>('[data-key]')
function onContextMenu(event: MouseEvent) {
    const row = rowOf(event)
    menuRow.value = {key: row?.dataset.key, uuid: row?.dataset.uuid}
}
const menu = computed<PluginMenuItem[][]>(() => {
    const {key, uuid} = menuRow.value
    if (uuid) return session.files.menuFor([uuid])
    const chosen = key ? chosenOf(key) : undefined
    if (chosen && chosen.kind !== 'folder') return [state.chosenMenu(chosen, nav.nameOf(chosen))]
    return session.files.menuFor([])
})

// Drags: a folder's row and a file's (a shortcut, a recent file) drag as Files' rows do. A closed folder held under a
// drag opens after a moment, so a drop can reach inside it.
function onDragStart(event: DragEvent) {
    const row = rowOf(event), uuid = row?.dataset.uuid
    if (uuid) nav.dragStart(event, [uuid], row!.querySelector('[data-grab]'))
}
const targetOf = (event: Event) => {
    const key = rowOf(event)?.dataset.key
    return key ? chosenOf(key) : undefined
}
let opening: { uuid: string, timer: ReturnType<typeof setTimeout> } | undefined
function openLater(uuid: string | undefined) {
    if (opening?.uuid === uuid) return
    clearTimeout(opening?.timer)
    opening = uuid && !openFolders.value.includes(uuid) ? {uuid, timer: setTimeout(() => toggleFolder(uuid, true), 600)} : undefined
}
function onDragOver(event: DragEvent) {
    const target = targetOf(event)
    openLater(target?.kind === 'folder' ? rowOf(event)?.dataset.uuid : undefined)
    nav.dragOver(event, target)
}
function onDragLeave(event: DragEvent) {
    if ((event.currentTarget as Element).contains(event.relatedTarget as Node | null)) return
    openLater(undefined)
    nav.dropAt.value = undefined
}
function onDrop(event: DragEvent) {
    openLater(undefined)
    void nav.drop(event, targetOf(event))
}
</script>

<template>
    <UContextMenu :items="menu" size="sm">
        <div
            role="tree"
            class="tw:no-scrollbar tw:flex tw:h-full tw:flex-col tw:gap-0.5 tw:overflow-y-auto tw:p-2"
            @contextmenu.capture="onContextMenu"
            @dragstart="onDragStart"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
        >
            <NavRow
                :label="t('shortcuts')" icon="i-lucide-star" :open="shortcuts.length ? !nav.folded('shortcuts') : undefined"
                @click="nav.toggleFold('shortcuts')" @toggle="nav.toggleFold('shortcuts')"
            />
            <template v-if="!nav.folded('shortcuts')">
                <NavRow
                    v-for="shortcut in shortcuts" :key="shortcut.key"
                    :data-key="shortcut.key" :data-uuid="shortcut.uuid" :draggable="!!shortcut.uuid"
                    :label="shortcut.label" :icon="shortcut.icon" :color="shortcut.color" :level="1"
                    :active="shortcut.chosen ? isChosen(shortcut.key) : shortcut.uuid === activeTab"
                    :drop="nav.dropAt.value === shortcut.key"
                    @click="openShortcut(shortcut)"
                />
            </template>

            <NavRow
                class="tw:mt-2" :label="t('recent')" icon="i-lucide-history" :open="recent.length ? !nav.folded('recent') : undefined"
                @click="nav.toggleFold('recent')" @toggle="nav.toggleFold('recent')"
            />
            <template v-if="!nav.folded('recent')">
                <NavRow
                    v-for="file in recent" :key="file!.uuid"
                    :data-key="`file:${file!.relativePath}`" :data-uuid="file!.uuid" draggable="true"
                    :label="withoutExt(file!.fileName)" :icon="nav.fileIcon(file!)" :color="nav.look(`file:${file!.relativePath}`).color" :level="1"
                    :active="file!.uuid === activeTab"
                    @click="session.tabs.open(file!.uuid)"
                />
            </template>

            <!-- The workspace: its own files, and its folders under it. -->
            <NavRow
                class="tw:mt-2" :data-key="folderKey('')"
                :label="nav.workspaceName.value" :icon="nav.iconOf({kind: 'folder', path: ''})" :color="nav.look(folderKey('')).color"
                :count="nav.folderCount('')" :open="folderRows.length ? !nav.folded('folders') : undefined"
                :active="isChosen(folderKey(''))" :drop="nav.dropAt.value === folderKey('')"
                @click="nav.choose({kind: 'folder', path: ''})" @toggle="nav.toggleFold('folders')"
            />
            <template v-if="!nav.folded('folders')">
                <NavRow
                    v-for="{node, level, nested} in folderRows" :key="node.uuid"
                    :data-key="folderKey(node.relativePath)" :data-uuid="node.uuid" draggable="true"
                    :label="node.fileName" :icon="nav.look(folderKey(node.relativePath)).icon ?? node.icon ?? 'i-lucide-folder'"
                    :color="nav.look(folderKey(node.relativePath)).color" :level="level" :count="nav.folderCount(node.relativePath)"
                    :open="nested ? openFolders.includes(node.uuid) : undefined"
                    :active="isChosen(folderKey(node.relativePath))" :drop="nav.dropAt.value === folderKey(node.relativePath)"
                    @click="nav.choose({kind: 'folder', path: node.relativePath})" @toggle="toggleFolder(node.uuid)"
                />
            </template>

            <NavRow
                class="tw:mt-2" :label="t('tags')" icon="i-lucide-tags" :open="!nav.folded('tags')"
                @click="nav.toggleFold('tags')" @toggle="nav.toggleFold('tags')"
            />
            <template v-if="!nav.folded('tags')">
                <NavRow
                    v-for="{node, level} in tagRows" :key="node.tag"
                    :data-key="tagKey(node.tag)"
                    :label="node.name" :icon="nav.iconOf({kind: 'tag', tag: node.tag})" :color="nav.look(tagKey(node.tag)).color"
                    :level="level" :count="node.count" :open="node.children.length ? nav.opened(tagKey(node.tag)) : undefined"
                    :active="isChosen(tagKey(node.tag))" :drop="nav.dropAt.value === tagKey(node.tag)"
                    @click="nav.choose({kind: 'tag', tag: node.tag})" @toggle="nav.toggleOpen(tagKey(node.tag))"
                />
                <NavRow
                    v-if="nav.tags.value.untagged" :data-key="tagKey('')"
                    :label="t('untagged')" icon="i-lucide-tag" :level="1" :count="nav.tags.value.untagged" :active="isChosen(tagKey(''))"
                    @click="nav.choose({kind: 'tag', tag: ''})"
                />
            </template>

            <NavRow
                class="tw:mt-2" :label="t('properties')" icon="i-lucide-braces" :open="nav.properties.value.length ? !nav.folded('properties') : undefined"
                @click="nav.toggleFold('properties')" @toggle="nav.toggleFold('properties')"
            />
            <template v-if="!nav.folded('properties')">
                <template v-for="property in nav.properties.value" :key="property.key">
                    <NavRow
                        :data-key="keyOf({kind: 'property', key: property.key})"
                        :label="property.key" icon="i-lucide-braces" :level="1" :count="property.count"
                        :open="property.values.length ? nav.opened(keyOf({kind: 'property', key: property.key})) : undefined"
                        :active="isChosen(keyOf({kind: 'property', key: property.key}))"
                        @click="nav.choose({kind: 'property', key: property.key})" @toggle="nav.toggleOpen(keyOf({kind: 'property', key: property.key}))"
                    />
                    <template v-if="property.values.length && nav.opened(keyOf({kind: 'property', key: property.key}))">
                        <NavRow
                            v-for="{value, count} in property.values.slice(0, VALUES_SHOWN)" :key="value"
                            :data-key="keyOf({kind: 'property', key: property.key, value})"
                            :label="value" icon="i-lucide-equal" :level="2" :count="count"
                            :active="isChosen(keyOf({kind: 'property', key: property.key, value}))"
                            @click="nav.choose({kind: 'property', key: property.key, value})"
                        />
                        <p v-if="property.values.length > VALUES_SHOWN" class="tw:py-1 tw:ps-14 tw:text-xs tw:text-dimmed">
                            {{ t('moreValues', {count: property.values.length - VALUES_SHOWN}) }}
                        </p>
                    </template>
                </template>
            </template>
        </div>
    </UContextMenu>
</template>
