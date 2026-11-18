import {definePlugin, type PanelViewProps} from '@type32/vertex-plugin'
import {h} from 'vue'
import Navigator from './Navigator.vue'
import {parentOf} from './model'
import {createState, current, type Config} from './state'
import './style.css'

export default definePlugin<Config>({
    setup(ctx) {
        // In the left sidebar, where Files is, and in a tab, where its list is cards. It draws once the window's
        // state is read (`current`).
        ctx.views.panel({
            id: 'navigator',
            label: 'plugins.navigator.name',
            icon: 'i-lucide-notebook-tabs',
            defaultArea: 'left',
            tab: true,
            when: ({isWorkspace}) => isWorkspace,
            component: async () => (props: PanelViewProps) => (current.value ? h(Navigator, {...props, state: current.value}) : null),
        })

        ctx.onSession(session => {
            if (!session.session.workspaceSession) return
            const state = createState(ctx, session)
            // Pin, Add to shortcuts, Colour and icon: in the kernel's file menu, so the navigator's rows and Files' have them.
            ctx.files.menuItem({id: 'navigator', items: ({files}) => state.fileMenu(files)})
            ctx.commands.register({
                id: 'show',
                label: 'plugins.navigator.commands.show',
                icon: 'i-lucide-notebook-tabs',
                menu: {section: 'view'},
                palette: true,
                run: () => session.views.show('navigator') || session.views.openInTab('navigator'),
            })
            ctx.commands.register({
                id: 'reveal',
                label: 'plugins.navigator.commands.reveal',
                icon: 'i-lucide-locate-fixed',
                palette: true,
                enabled: () => !!session.index.byUuid(session.tabs.active() ?? ''),
                run: () => {
                    const file = session.index.byUuid(session.tabs.active() ?? '')
                    if (!file) return
                    if (!session.views.show('navigator')) session.views.openInTab('navigator')
                    state.request.value = {chosen: {kind: 'folder', path: parentOf(file.relativePath)}}
                },
            })
        })
    },
})
