<script setup lang="ts">
/** A row of the navigation pane: a section's heading, a folder, a tag, a property, a shortcut. */
withDefaults(defineProps<{
    label: string
    icon: string
    /** How deep it's nested: 0 for a section's heading. */
    level?: number
    count?: number
    /** Whether what's under it shows; absent for a row with nothing under it. */
    open?: boolean
    /** It's what the list shows, or the shown tab's file. */
    active?: boolean
    /** A drag would drop on it. */
    drop?: boolean
    /** A CSS colour for its icon and name. */
    color?: string
    // Vue makes an absent boolean `false`; "nothing under it" must stay apart from "shut".
}>(), {open: undefined})
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
    <div
        role="treeitem"
        tabindex="0"
        :aria-expanded="open"
        :aria-selected="!!active"
        :class="[
            'tw:flex tw:shrink-0 tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-lg tw:py-1 tw:pe-2.5 tw:text-sm tw:select-none tw:outline-none tw:focus-visible:ring-1 tw:focus-visible:ring-primary',
            drop ? 'tw:bg-primary/10 tw:ring-1 tw:ring-primary tw:ring-inset' : active ? 'tw:bg-elevated tw:text-highlighted' : 'tw:hover:bg-elevated/50',
        ]"
        :style="{paddingInlineStart: `${(level ?? 0) * 16 + 6}px`}"
        @keydown.enter.self="($event.currentTarget as HTMLElement).click()"
    >
        <UIcon
            v-if="open !== undefined"
            :name="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="tw:size-4 tw:shrink-0 tw:text-dimmed tw:hover:text-default"
            @click.stop="emit('toggle')"
        />
        <span v-else class="tw:w-4 tw:shrink-0"/>
        <!-- What a drag of the row shows under the pointer. -->
        <span data-grab class="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5" :style="{color}">
            <UIcon :name="icon" class="tw:size-4 tw:shrink-0"/>
            <span class="tw:truncate">{{ label }}</span>
        </span>
        <span class="tw:grow"/>
        <span v-if="count !== undefined" class="tw:text-xs tw:text-dimmed tw:tabular-nums">{{ count }}</span>
    </div>
</template>
