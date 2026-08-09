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

        // —— 配置调整页 ——
        const adjust = reactive({
            short_open_tag: '关闭',
            max_execution_time: '300',
            max_input_time: '60',
            memory_limit: '128M',
            post_max_size: '50M',
            file_uploads: '开启',
            upload_max_filesize: '50M',
            max_file_uploads: '20',
            default_socket_timeout: '60',
            error_reporting: 'E_ALL & ~E_NOTICE',
            display_errors: '关闭',
            'cgi.fix_pathinfo': '开启',
            'date.timezone': 'PRC',
        })
        const adjustSaving = ref(false)

        async function loadAdjust() {
            try {
                var r = await ctx.api('get_php_value')
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    adjust.short_open_tag = d.short_open_tag === 'On' ? '开启' : '关闭'
                    adjust.max_execution_time = d.max_execution_time || '300'
                    adjust.max_input_time = d.max_input_time || '60'
                    adjust.memory_limit = d.memory_limit || '128M'
                    adjust.post_max_size = d.post_max_size || '50M'
                    adjust.file_uploads = d.file_uploads === 'On' ? '开启' : '关闭'
                    adjust.upload_max_filesize = d.upload_max_filesize || '50M'
                    adjust.max_file_uploads = d.max_file_uploads || '20'
                    adjust.default_socket_timeout = d.default_socket_timeout || '60'
                    adjust.error_reporting = d.error_reporting || 'E_ALL & ~E_NOTICE'
                    adjust.display_errors = d.display_errors === 'On' ? '开启' : '关闭'
                    adjust['cgi.fix_pathinfo'] = d['cgi.fix_pathinfo'] === 'On' ? '开启' : '关闭'
                    adjust['date.timezone'] = d['date.timezone'] || 'PRC'
                }
            } catch (e) {}
        }

        async function saveAdjust() {
            adjustSaving.value = true
            try {
                var data = {
                    short_open_tag: adjust.short_open_tag === '开启' ? 'On' : 'Off',
                    max_execution_time: adjust.max_execution_time,
                    max_input_time: adjust.max_input_time,
                    memory_limit: adjust.memory_limit,
                    post_max_size: adjust.post_max_size,
                    file_uploads: adjust.file_uploads === '开启' ? 'On' : 'Off',
                    upload_max_filesize: adjust.upload_max_filesize,
                    max_file_uploads: adjust.max_file_uploads,
                    default_socket_timeout: adjust.default_socket_timeout,
                    error_reporting: adjust.error_reporting,
                    display_errors: adjust.display_errors === '开启' ? 'On' : 'Off',
                    'cgi.fix_pathinfo': adjust['cgi.fix_pathinfo'] === '开启' ? 'On' : 'Off',
                    'date.timezone': adjust['date.timezone'],
                }
                var r = await ctx.api('set_php_value', { body: JSON.stringify(data) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) {
                    toast('已保存', 'ok')
                } else {
                    toast(d.error || '保存失败', 'err')
                }
            } catch (e) {
                toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                adjustSaving.value = false
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
            adjust, adjustSaving,
            iniContent, iniSaving,
            fpmContent, fpmSaving,
            logContent, slowlogContent,
            checkStatus, getVersion, control,
            loadAdjust, saveAdjust,
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
            render(h, state) {
                return h('div', [
                    h('p', { class: 'tip' }, '功能开发中'),
                ])
            },
        },

        // —— 安装扩展 ——
        ext: {
            onLoad() {},
            render(h, state) {
                return h('div', [
                    h('p', { class: 'tip' }, '功能开发中'),
                ])
            },
        },

        // —— 配置调整 ——
        adjust: {
            onLoad(ctx, state) { return state.loadAdjust() },
            render(h, state) {
                var a = state.adjust
                const toggle = function(key) {
                    return h('select', { class: 'slt', value: a[key],
                        onChange: function(e) { a[key] = e.target.value } },
                        [h('option', { value: '开启' }, '开启'), h('option', { value: '关闭' }, '关闭')])
                }
                const field = function(label, tip, key) {
                    return [
                        h('label', label),
                        h('input', {
                            value: a[key] || '',
                            onInput: function(e) { a[key] = e.target.value },
                        }),
                        h('span', { class: 'tip' }, tip),
                    ]
                }
                return h('div', [
                    h('div', { class: 'form-grid' }, [
                        h('label', 'short_open_tag'), toggle('short_open_tag'), h('span', { class: 'tip' }, '短标签支持'),
                        ...field('max_execution_time', '最大脚本运行时间(秒)', 'max_execution_time'),
                        ...field('max_input_time', '最大输入时间(秒)', 'max_input_time'),
                        ...field('memory_limit', '脚本内存限制', 'memory_limit'),
                        ...field('post_max_size', 'POST数据最大尺寸', 'post_max_size'),
                        h('label', 'file_uploads'), toggle('file_uploads'), h('span', { class: 'tip' }, '是否允许上传文件'),
                        ...field('upload_max_filesize', '允许上传文件的最大尺寸', 'upload_max_filesize'),
                        ...field('max_file_uploads', '允许同时上传文件的最大数量', 'max_file_uploads'),
                        ...field('default_socket_timeout', 'Socket超时时间(秒)', 'default_socket_timeout'),
                        ...field('error_reporting', '错误级别', 'error_reporting'),
                        h('label', 'display_errors'), toggle('display_errors'), h('span', { class: 'tip' }, '是否输出详细错误信息'),
                        h('label', 'cgi.fix_pathinfo'), toggle('cgi.fix_pathinfo'), h('span', { class: 'tip' }, '是否开启pathinfo'),
                        ...field('date.timezone', '时区', 'date.timezone'),
                    ]),
                    h('div', { class: 'row' }, [
                        h('button', { class: 'btn', onClick: state.saveAdjust },
                            state.adjustSaving.value ? '保存中...' : '保存'),
                        h('button', { class: 'btn', onClick: function() { state.control('reload') } }, '刷新'),
                    ]),
                ])
            },
        },

        // —— 性能调整 ——
        performance: {
            onLoad() {},
            render(h, state) {
                return h('div', [
                    h('p', { class: 'tip' }, '功能开发中'),
                ])
            },
        },

        // —— Session配置 ——
        session: {
            onLoad() {},
            render(h, state) {
                return h('div', [
                    h('p', { class: 'tip' }, '功能开发中'),
                ])
            },
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

    // layout !== 'none' 时将被忽略（仅 layout == 'none' 使用 setup + render）
    // render(h, state) {
    //     return h('div', '自由渲染模式：整个插件界面由本函数产出')
    // },
}

Plugin(php82).show()