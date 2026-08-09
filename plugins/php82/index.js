const php82 = {
    plugin_name: 'php82',
    // layout: 'none' | 'tabpages'（缺省/空/null 均视为 'none'）
    layout: 'tabpages',

    // layout == 'tabpages' 时生效（否则忽略）
    // 键的插入顺序 = 侧边栏显示顺序，值 = 显示名
    tabs: {
        service: '服务',
        disable: '禁用函数',
        ext: '安装扩展',
        adjust: '配置调整',
        performance: '性能调整',
        session: 'Session配置',
        config: '配置文件',
        fpmconf: 'FPM配置文件',
        load: '负载状态',
        log: '日志',
        slowlog: '慢日志',
    },

    // setup 里的状态与函数，供各页 render 使用
    setup(ctx) {
        const { ref, reactive } = ctx
        const Editor = ctx.Editor
        const toast = ctx.toast

        const running = ref(false)
        const version = ref('')
        const actionLoading = ref('')

        const iniContent = ref('')
        const iniSaving = ref(false)
        const fpmContent = ref('')
        const fpmSaving = ref(false)

        const logContent = ref('')
        const slowlogContent = ref('')

        // —— 服务页 ——
        async function checkStatus() {
            try {
                var r = await ctx.api('status')
                running.value = r.code === 0
            } catch (e) {
                running.value = false
            }
        }

        async function getVersion() {
            try {
                var r = await ctx.api('get_version')
                version.value = (r && r.stdout) ? r.stdout.trim() : ''
            } catch (e) { version.value = '' }
        }

        async function control(action) {
            actionLoading.value = action
            try {
                await ctx.api(action)
                toast(action, 'ok')
                await checkStatus()
            } catch (e) {
                toast(action + ' ' + (e.message || ''), 'err')
            } finally {
                actionLoading.value = ''
            }
        }

        // —— 配置文件页 ——
        async function loadPhpIni() {
            try {
                var r = await ctx.api('get_php_ini')
                var d = JSON.parse(r.stdout)
                iniContent.value = (d.content) ? d.content : ''
            } catch (e) {
                iniContent.value = ''
            }
        }

        async function savePhpIni() {
            iniSaving.value = true
            try {
                var r = await ctx.api('save_php_ini', { body: JSON.stringify({ content: iniContent.value }) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) {
                    toast('已保存', 'ok')
                } else {
                    toast(d.error || '保存失败', 'err')
                }
            } catch (e) {
                toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                iniSaving.value = false
            }
        }

        // —— FPM配置文件页 ——
        async function loadFpmConf() {
            try {
                var r = await ctx.api('get_fpm_conf')
                var d = JSON.parse(r.stdout)
                fpmContent.value = (d.content) ? d.content : ''
            } catch (e) {
                fpmContent.value = ''
            }
        }

        async function saveFpmConf() {
            fpmSaving.value = true
            try {
                var r = await ctx.api('save_fpm_conf', { body: JSON.stringify({ content: fpmContent.value }) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) {
                    toast('已保存并重载', 'ok')
                } else {
                    toast(d.error || '保存失败', 'err')
                }
            } catch (e) {
                toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                fpmSaving.value = false
            }
        }

        // —— 日志页 ——
        async function loadLog() {
            try {
                var r = await ctx.api('/api/files/read?path=/www/wwwlogs/php-fpm82.log', { method: 'GET' })
                logContent.value = (r && r.content) ? r.content : ''
            } catch (e) {
                logContent.value = ''
            }
        }

        // —— 慢日志页 ——
        async function loadSlowlog() {
            try {
                var r = await ctx.api('/api/files/read?path=/www/wwwlogs/php_slow_82.log', { method: 'GET' })
                slowlogContent.value = (r && r.content) ? r.content : ''
            } catch (e) {
                slowlogContent.value = ''
            }
        }

        return {
            Editor, running, version, actionLoading,
            iniContent, iniSaving,
            fpmContent, fpmSaving,
            logContent, slowlogContent,
            checkStatus, getVersion, control,
            loadPhpIni, savePhpIni,
            loadFpmConf, saveFpmConf,
            loadLog, loadSlowlog,
        }
    },

    // layout == 'tabpages' 时生效（否则忽略）
    // 每个页面：onLoad 负责该页切入时加载数据(首次与每次切回都会跑)，render 只画页面内容
    // 侧边栏 tab 切换、页面加载中转圈、ctx.toast 提示均由框架自动处理，插件只需写 onLoad 和 render
    pages: {
        // —— 服务 ——
        service: {
            onLoad(ctx, state) { return Promise.all([state.checkStatus(), state.getVersion()]) },
            render(h, state) {
                var running = state.running.value
                function btn(text, action) {
                    return h('button', {
                        class: 'btn' + (state.actionLoading.value === action ? ' loading' : ''),
                        onClick: function() { state.control(action) },
                    }, state.actionLoading.value === action ? '...' : text)
                }
                return h('div', [
                    h('h4', '版本：' + (state.version.value || '未知')),
                    h('p', [
                        '当前状态：' + (running ? '' : '未') + '运行',
                        h('span', { class: running ? 'on' : 'off' }, running ? ' \u25b6' : ' \u23f8'),
                    ]),
                    h('div', { class: 'row' },
                        running
                            ? [btn('停止', 'stop'), btn('重启', 'restart'), btn('重载配置', 'reload')]
                            : [btn('启动', 'start')]
                    ),
                ])
            },
        },

        // —— 禁用函数 ——
        disable: {
            onLoad() {},
            render() { return '开发中' },
        },

        // —— 安装扩展 ——
        ext: {
            onLoad() {},
            render() { return '开发中' },
        },

        // —— 配置调整 ——
        adjust: {
            onLoad() {},
            render() { return '开发中' },
        },

        // —— 性能调整 ——
        performance: {
            onLoad() {},
            render() { return '开发中' },
        },

        // —— Session配置 ——
        session: {
            onLoad() {},
            render() { return '开发中' },
        },

        // —— 配置文件 ——
        config: {
            onLoad(ctx, state) { return state.loadPhpIni() },
            render(h, state) {
                return h('div', [
                    h('p', { class: 'tip' }, '此处为 php.ini 主配置文件，修改请谨慎'),
                    h(state.Editor, {
                        modelValue: state.iniContent.value,
                        'onUpdate:modelValue': function(v) { state.iniContent.value = v },
                        language: 'ini',
                    }),
                    h('div', { class: 'row' }, [
                        h('button', { class: 'btn', onClick: state.savePhpIni },
                            state.iniSaving.value ? '保存中...' : '保存'),
                    ]),
                ])
            },
        },

        // —— FPM配置文件 ——
        fpmconf: {
            onLoad(ctx, state) { return state.loadFpmConf() },
            render(h, state) {
                return h('div', [
                    h('p', { class: 'tip' }, '此处为 php-fpm 的 www.conf 配置文件，修改请谨慎'),
                    h(state.Editor, {
                        modelValue: state.fpmContent.value,
                        'onUpdate:modelValue': function(v) { state.fpmContent.value = v },
                        language: 'ini',
                    }),
                    h('div', { class: 'row' }, [
                        h('button', { class: 'btn', onClick: state.saveFpmConf },
                            state.fpmSaving.value ? '保存中...' : '保存'),
                    ]),
                ])
            },
        },

        // —— 负载状态 ——
        load: {
            onLoad() {},
            render() { return '开发中' },
        },

        // —— 日志 ——
        log: {
            onLoad(ctx, state) { return state.loadLog() },
            render(h, state) {
                return h('div', [
                    h(state.Editor, { modelValue: state.logContent.value, readonly: true }),
                ])
            },
        },

        // —— 慢日志 ——
        slowlog: {
            onLoad(ctx, state) { return state.loadSlowlog() },
            render(h, state) {
                return h('div', [
                    h(state.Editor, { modelValue: state.slowlogContent.value, readonly: true }),
                ])
            },
        },
    },
}

Plugin(php82).show()