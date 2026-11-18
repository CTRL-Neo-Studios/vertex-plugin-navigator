<script setup lang="ts">
import type {PanelViewProps} from '@type32/vertex-plugin'
import {computed, onBeforeUnmount, ref, useTemplateRef, watch, watchEffect} from 'vue'
import ListPane from './ListPane.vue'
import NavPane from './NavPane.vue'
import {useNavigator} from './navigator'
import type {State} from './state'

/**
 * A navigator: the navigation pane and the list pane, side by side when there's room, else one at a time. In a tab
 * the list is cards in columns.
 */
const props = defineProps<PanelViewProps & { state: State }>()
const nav = useNavigator(props.state)
const {session, t} = nav

const root = useTemplateRef<HTMLElement>('root')
const width = ref(0)
const resize = new ResizeObserver(([entry]) => { width.value = entry!.contentRect.width })
watch(root, el => el && resize.observe(el))
onBeforeUnmount(() => resize.disconnect())
const dual = computed(() => width.value >= nav.config.value.dualPaneWidth)

// The panel's header: New note and New folder where the list is, and Collapse all.
watchEffect(() => {
    const [note, folder] = nav.newItems.value
    props.actions([
        ...[note, folder].filter(item => !!item).map((item, i) => ({id: i ? 'newFolder' : 'newNote', label: item.label, icon: item.icon!, onSelect: item.onSelect!})),
        {
            id: 'collapse', label: t('collapse'), icon: 'i-lucide-chevrons-down-up',
            onSelect: () => {
                session.files.openFolders.value = []
                void props.state.updateDevice(() => ({open: []}))
            },
        },
    ])
})
</script>

<template>
    <div ref="root" class="tw:flex tw:h-full tw:min-h-0 tw:w-full tw:min-w-0">
        <!-- Kept while the list shows alone, so its scroll stays. An element of its own: the pane's root is a menu, which has none. -->
        <div v-show="dual || nav.pane.value === 'nav'" :class="['tw:min-h-0', dual ? 'tw:w-64 tw:shrink-0 tw:border-e tw:border-default' : 'tw:w-full']">
            <NavPane :nav="nav"/>
        </div>
        <ListPane
            v-if="dual || nav.pane.value === 'list'"
            :nav="nav" :back="!dual" :grid="placement === 'tab'"
            class="tw:min-w-0 tw:flex-1"
            @back="nav.pane.value = 'nav'"
        />
    </div>
</template>
