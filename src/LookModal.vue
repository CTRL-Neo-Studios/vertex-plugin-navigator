<script setup lang="ts">
import {ref} from 'vue'
import type {Look} from './model'

/** The colour and icon of a folder, a tag or a file. Each change is kept as it's made (`onChange`); Reset clears both. */
const props = defineProps<{
    name: string
    look: Look
    t(key: string, params?: Record<string, unknown>): string
    onChange(look: Look): void
}>()
const emit = defineEmits<{ close: [] }>()

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']
const ICONS = [
    'i-lucide-folder', 'i-lucide-star', 'i-lucide-book-marked', 'i-lucide-briefcase', 'i-lucide-graduation-cap', 'i-lucide-gamepad-2',
    'i-lucide-heart', 'i-lucide-archive', 'i-lucide-lightbulb', 'i-lucide-calendar', 'i-lucide-code', 'i-lucide-music',
]

const look = ref<Look>({...props.look})
function set(change: Look) {
    look.value = {...look.value, ...change}
    props.onChange(look.value)
}
</script>

<template>
    <UModal :title="t('look.title', {name})" :description="t('look.description')" :close="{onClick: () => emit('close')}">
        <template #body>
            <div class="tw:flex tw:flex-col tw:gap-4">
                <div class="tw:flex tw:flex-col tw:gap-2">
                    <span class="tw:text-sm tw:font-medium">{{ t('look.color') }}</span>
                    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                        <button
                            v-for="color in COLORS" :key="color" type="button"
                            :aria-label="color" :aria-pressed="look.color === color"
                            :class="['tw:size-6 tw:rounded-full tw:ring-offset-2 tw:ring-offset-default', look.color === color && 'tw:ring-2 tw:ring-inverted']"
                            :style="{backgroundColor: color}"
                            @click="set({color})"
                        />
                        <!-- Any other colour: the system's picker. -->
                        <input
                            type="color" :value="look.color ?? '#888888'" :aria-label="t('look.custom')" :title="t('look.custom')"
                            class="tw:size-7 tw:cursor-pointer tw:rounded tw:border-0 tw:bg-transparent tw:p-0"
                            @input="set({color: ($event.target as HTMLInputElement).value})"
                        >
                    </div>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-2">
                    <span class="tw:text-sm tw:font-medium">{{ t('look.icon') }}</span>
                    <div class="tw:flex tw:flex-wrap tw:gap-1">
                        <UButton
                            v-for="icon in ICONS" :key="icon"
                            :icon="icon" :aria-label="icon" :variant="look.icon === icon ? 'soft' : 'ghost'" :color="look.icon === icon ? 'primary' : 'neutral'" size="sm"
                            @click="set({icon})"
                        />
                    </div>
                    <UInput
                        :model-value="look.icon ?? ''" :icon="look.icon || 'i-lucide-search'" placeholder="i-lucide-star" class="tw:w-full"
                        :aria-label="t('look.icon')" @update:model-value="(value: string) => set({icon: value.trim() || undefined})"
                    />
                    <span class="tw:text-xs tw:text-muted">{{ t('look.iconHelp') }}</span>
                </div>
            </div>
        </template>
        <template #footer>
            <UButton :label="t('look.reset')" variant="ghost" color="neutral" :disabled="!look.color && !look.icon" @click="set({color: undefined, icon: undefined})"/>
            <span class="tw:grow"/>
            <UButton :label="t('look.done')" @click="emit('close')"/>
        </template>
    </UModal>
</template>
