import {expect, test} from 'bun:test'
import {
    chosenOf, dateLabel, DEFAULT_SORT, folderCounts, groupItems, keyOf, listFor, matches, movesBetween, previewOf, propertyTree, pushRecent, renamed,
    sortItems, tagTree, tagsOf, vaultData, type Chosen, type Item,
} from './model'

const NOW = new Date(2026, 10, 18, 12)
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function item(path: string, more: Partial<Item> & { tags?: string[], days?: number } = {}): Item {
    const fileName = path.slice(path.lastIndexOf('/') + 1), dot = fileName.lastIndexOf('.')
    const date = daysAgo(more.days ?? 0)
    return {
        uuid: path, relativePath: path, fullPath: `/vault/${path}`, fileName, fileExt: dot > 0 ? fileName.slice(dot + 1) : '', isFolder: dot <= 0,
        properties: {}, meta: {tags: more.tags ?? [], embeds: []}, createdTime: date, modifiedTime: date, ...more,
    }
}

const VAULT = [
    item('Games'),
    item('Games/101'),
    item('Inbox.md', {days: 0}),
    item('Games/Rules.md', {days: 1, tags: ['#Notes'], properties: {tags: ['lecture', 'games/101'], status: 'draft', week: 3}}),
    item('Games/101/Note 10.md', {days: 5, tags: ['#notes/long'], properties: {status: 'done', authors: ['Ann', 'Bo']}}),
    item('Games/101/Note 2.md', {days: 20, properties: {tags: 'lecture, #Games', status: 'draft'}}),
    item('Games/101/board.png', {days: 400}),
    item('Old.md', {days: 200}),
]
const names = (items: Item[]) => items.map(i => i.fileName)

test('a note\'s tags come from its frontmatter and its text, each once', () => {
    expect(tagsOf(VAULT[3]!)).toEqual(['lecture', 'games/101', 'notes'])
    expect(tagsOf(VAULT[5]!)).toEqual(['lecture', 'games'])
    expect(tagsOf(item('a.md', {tags: ['#a//b/', '#A/b']}))).toEqual(['a/b'])
    // Only notes have tags: a base's YAML has a `tags` key of its own.
    expect(tagsOf(item('x.base', {properties: {tags: ['no']}}))).toEqual([])
})

test('tags nest by slash, and a nested tag counts under its parents', () => {
    const {tags, untagged} = tagTree(VAULT)
    expect(tags.map(t => [t.tag, t.count])).toEqual([['games', 2], ['lecture', 2], ['notes', 2]])
    expect(tags[0]!.children.map(t => [t.tag, t.name, t.count])).toEqual([['games/101', '101', 1]])
    expect(tags[2]!.children.map(t => t.tag)).toEqual(['notes/long'])
    expect(untagged).toBe(2)
})

test('properties list their values, most used first, without tags', () => {
    expect(propertyTree(VAULT)).toEqual([
        {key: 'authors', count: 1, values: [{value: 'Ann', count: 1}, {value: 'Bo', count: 1}]},
        {key: 'status', count: 3, values: [{value: 'draft', count: 2}, {value: 'done', count: 1}]},
        {key: 'week', count: 1, values: [{value: '3', count: 1}]},
    ])
})

test('a choice lists its files', () => {
    const of = (chosen: Chosen, deep = false, notesOnly = false) => names(listFor(VAULT, chosen, {deep, notesOnly})).sort()
    expect(of({kind: 'folder', path: ''})).toEqual(['Inbox.md', 'Old.md'])
    expect(of({kind: 'folder', path: 'Games'})).toEqual(['Rules.md'])
    expect(of({kind: 'folder', path: 'Games'}, true)).toEqual(['Note 10.md', 'Note 2.md', 'Rules.md', 'board.png'])
    expect(of({kind: 'folder', path: 'Games'}, true, true)).toEqual(['Note 10.md', 'Note 2.md', 'Rules.md'])
    expect(of({kind: 'folder', path: ''}, true)).toHaveLength(6)
    expect(of({kind: 'tag', tag: 'games'})).toEqual(['Note 2.md', 'Rules.md'])
    expect(of({kind: 'tag', tag: 'games/101'})).toEqual(['Rules.md'])
    expect(of({kind: 'tag', tag: ''})).toEqual(['Inbox.md', 'Old.md'])
    expect(of({kind: 'property', key: 'status'})).toEqual(['Note 10.md', 'Note 2.md', 'Rules.md'])
    expect(of({kind: 'property', key: 'status', value: 'draft'})).toEqual(['Note 2.md', 'Rules.md'])
    expect(of({kind: 'property', key: 'authors', value: 'Bo'})).toEqual(['Note 10.md'])

    const {direct, deep} = folderCounts(VAULT, false)
    expect([direct.get(''), direct.get('Games'), direct.get('Games/101')]).toEqual([2, 1, 3])
    expect([deep.get(''), deep.get('Games'), deep.get('Games/101')]).toEqual([6, 4, 3])
    expect(folderCounts(VAULT, true).deep.get('Games/101')).toBe(2)
})

test('a choice survives being a key', () => {
    const all: Chosen[] = [
        {kind: 'folder', path: ''}, {kind: 'folder', path: 'a/b'}, {kind: 'tag', tag: ''}, {kind: 'tag', tag: 'a/b'},
        {kind: 'property', key: 'a=b'}, {kind: 'property', key: 'a', value: 'x"y'},
    ]
    for (const chosen of all) expect(chosenOf(keyOf(chosen))).toEqual(chosen)
    expect(chosenOf('file:a.md')).toBeUndefined()
    expect(chosenOf('property:nonsense')).toBeUndefined()
})

test('search matches names and tags', () => {
    const rules = VAULT[3]!
    expect(matches(rules, 'rul')).toBe(true)
    expect(matches(rules, 'rul lecture')).toBe(true)
    expect(matches(rules, '#rul')).toBe(false)
    expect(matches(rules, '#lect')).toBe(true)
    expect(matches(rules, 'rul nope')).toBe(false)
})

test('names sort as people read them; dates newest first by default', () => {
    const files = listFor(VAULT, {kind: 'folder', path: ''}, {deep: true, notesOnly: false})
    expect(names(sortItems(files, {by: 'name', descending: false})).slice(0, 5)).toEqual(['board.png', 'Inbox.md', 'Note 2.md', 'Note 10.md', 'Old.md'])
    expect(names(sortItems(files, DEFAULT_SORT))).toEqual(['Inbox.md', 'Rules.md', 'Note 10.md', 'Note 2.md', 'Old.md', 'board.png'])
})

test('a list groups by date, the pinned first', () => {
    const files = sortItems(listFor(VAULT, {kind: 'folder', path: ''}, {deep: true, notesOnly: false}), DEFAULT_SORT)
    const groups = (byDate = true, sort = DEFAULT_SORT) => groupItems(sortItems(files, sort), sort, new Set(['Old.md']), NOW, byDate).map(g => [g.id, names(g.items)])
    expect(groups()).toEqual([
        ['pinned', ['Old.md']], ['today', ['Inbox.md']], ['yesterday', ['Rules.md']], ['week', ['Note 10.md']], ['month', ['Note 2.md']], ['y:2025', ['board.png']],
    ])
    expect(groups(false).map(g => g[0])).toEqual(['pinned', 'all'])
    expect(groups(true, {by: 'name', descending: false}).map(g => g[0])).toEqual(['pinned', 'all'])
    // Earlier this year: its month.
    expect(groupItems([item('a.md', {days: 60})], DEFAULT_SORT, new Set(), NOW, true)[0]!.id).toBe('m:2026-09')
})

test('a row\'s date: the time today, the weekday this week, the date before', () => {
    expect(dateLabel(new Date(2026, 10, 18, 9, 5), NOW, 'en')).toBe('9:05 AM')
    expect(dateLabel(daysAgo(2), NOW, 'en')).toBe('Monday')
    expect(dateLabel(daysAgo(9), NOW, 'en')).toBe('Nov 9, 2026')
})

test('a preview is the note\'s words', () => {
    const note = [
        '---', 'tags: [a]', '---', '# Games as *Verbs*', '', '> [!note] Karina', '> Some **people** consider [[Dolls|physical dolls]] and [links](https://x.y).',
        '', '```js', 'const hidden = 1', '```', '- [ ] a task ![[board.png]]', '1. first %% not this %%', '', '| a | b |', '| --- | --- |', '<!-- nor this -->', '---', 'End ==here==.',
    ].join('\n')
    expect(previewOf(note)).toBe('Games as Verbs Karina Some people consider physical dolls and links. a task first a b End here .')
    expect(previewOf('---\nonly: frontmatter\n---\n')).toBe('')
    expect(previewOf('word '.repeat(100), 20)).toHaveLength(20)
})

test('the vault\'s data keeps only what fits', () => {
    expect(vaultData(undefined)).toEqual({shortcuts: [], pinned: [], looks: {}, sort: {}, deep: []})
    expect(vaultData({
        shortcuts: ['tag:a', 3], pinned: 'no', looks: {'folder:a': {color: '#f00', icon: 5}, 'tag:b': {}, 'tag:c': 'red'},
        sort: {'folder:a': {by: 'name'}, 'folder:b': {by: 'size'}}, deep: ['folder:a'], more: true,
    })).toEqual({
        shortcuts: ['tag:a'], pinned: [], looks: {'folder:a': {color: '#f00', icon: undefined}},
        sort: {'folder:a': {by: 'name', descending: false}}, deep: ['folder:a'],
    })
})

test('the data follows a rename', () => {
    const data = vaultData({
        shortcuts: ['file:Games/Rules.md', 'folder:Games', 'tag:games', 'folder:Gamesmanship'], pinned: ['Games/101/Note 2.md', 'Old.md'],
        looks: {'folder:Games/101': {color: 'red'}, 'tag:games': {color: 'blue'}}, sort: {'folder:Games': {by: 'name', descending: true}}, deep: ['folder:Games'],
    })
    expect(renamed(data, 'Games', 'Play/Games')).toEqual({
        shortcuts: ['file:Play/Games/Rules.md', 'folder:Play/Games', 'tag:games', 'folder:Gamesmanship'], pinned: ['Play/Games/101/Note 2.md', 'Old.md'],
        looks: {'folder:Play/Games/101': {color: 'red', icon: undefined}, 'tag:games': {color: 'blue', icon: undefined}},
        sort: {'folder:Play/Games': {by: 'name', descending: true}}, deep: ['folder:Play/Games'],
    })
    expect(renamed(data, 'Old.md', 'New.md')!.pinned).toEqual(['Games/101/Note 2.md', 'New.md'])
    expect(renamed(data, 'Elsewhere', 'There')).toBeUndefined()
})

test('a uuid whose path changed has moved; a folder takes what\'s in it', () => {
    const before = new Map([['f', 'Games'], ['a', 'Games/a.md'], ['b', 'Games/101/b.md'], ['c', 'c.md'], ['gone', 'x.md']])
    const now = new Map([['f', 'Play'], ['a', 'Play/a.md'], ['b', 'Play/101/b.md'], ['c', 'Play/c.md'], ['new', 'y.md']])
    expect(movesBetween(before, now)).toEqual([{from: 'c.md', to: 'Play/c.md'}, {from: 'Games', to: 'Play'}])
    expect(movesBetween(now, now)).toEqual([])
})

test('recent files: the newest first, each once', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b', 3)).toEqual(['b', 'a', 'c'])
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
})
