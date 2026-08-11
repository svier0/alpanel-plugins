const redis = {
    plugin_name: 'redis',
    title: 'Redis',
    // layout: 'none' | 'tabpages'（缺省/空/null 均视为 'none'）
    layout: 'tabpages',

    // layout == 'tabpages' 时生效（否则忽略）
    // 键的插入顺序 = 侧边栏显示顺序，值 = 显示名
    tabs: {
        service: '服务',
        config: '配置文件',
        performance: '性能调整',
        load: '负载状态',
        log: '日志',
    },

    // setup 里的状态与函数，供各页 render 使用
    setup(ctx) {
        const { ref, reactive } = ctx
        const Editor = ctx.Editor

        const running = ref(false)
        const version = ref('')
        const actionLoading = ref('')

        const configContent = ref('')
        const configSaving = ref(false)

        const perf = reactive({
            bind: '', port: '', timeout: '', maxclients: '',
            databases: '', requirepass: '', maxmemory: '',
        })
        const perfSaving = ref(false)

        const statusInfo = reactive({
            uptime_in_days: '', tcp_port: '', connected_clients: '',
            used_memory_rss: '', used_memory: '', mem_fragmentation_ratio: '',
            total_connections_received: '', total_commands_processed: '',
            instantaneous_ops_per_sec: '', keyspace_hits: '',
            keyspace_misses: '', hit: '', latest_fork_usec: '',
        })

        const logContent = ref('')

        // —— 服务控制 ——
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
                ctx.toast(action, 'ok')
                await checkStatus()
            } catch (e) {
                ctx.toast(action + ' ' + (e.message || ''), 'err')
            } finally {
                actionLoading.value = ''
            }
        }

        // —— 配置页 ——
        async function loadConfig() {
            var r = await ctx.api('get_redis_config')
            var d = JSON.parse(r.stdout)
            configContent.value = (d.content) ? d.content : ''
        }

        async function saveConfig() {
            configSaving.value = true
            try {
                var r = await ctx.api('save_redis_config', { body: JSON.stringify({ content: configContent.value }) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) ctx.toast('已保存并重载', 'ok')
                else ctx.toast(d.error || '保存失败', 'err')
            } catch (e) {
                ctx.toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                configSaving.value = false
            }
        }

        // —— 性能页 ——
        async function loadPerf() {
            var r = await ctx.api('get_redis_value')
            if (r && r.stdout) {
                var d = JSON.parse(r.stdout)
                perf.bind = d.bind || '127.0.0.1'
                perf.port = d.port || '6379'
                perf.timeout = d.timeout || '0'
                perf.maxclients = d.maxclients || '10000'
                perf.databases = d.databases || '4'
                perf.requirepass = d.requirepass || ''
                perf.maxmemory = d.maxmemory || '0'
            }
        }

        async function savePerformance() {
            perfSaving.value = true
            try {
                var data = {
                    bind: perf.bind, port: perf.port, timeout: perf.timeout,
                    maxclients: perf.maxclients, databases: perf.databases,
                    requirepass: perf.requirepass, maxmemory: perf.maxmemory,
                }
                var r = await ctx.api('set_redis_value', { body: JSON.stringify(data) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) ctx.toast('已保存，Redis已重启', 'ok')
                else ctx.toast(d.error || '保存失败', 'err')
            } catch (e) {
                ctx.toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                perfSaving.value = false
            }
        }

        // —— 负载页 ——
        async function loadStatus() {
            var r = await ctx.api('get_redis_status')
            if (r && r.stdout) {
                var d = JSON.parse(r.stdout)
                statusInfo.uptime_in_days = d.uptime_in_days || '-'
                statusInfo.tcp_port = d.tcp_port || '-'
                statusInfo.connected_clients = d.connected_clients || '-'
                statusInfo.used_memory_rss = d.used_memory_rss || '-'
                statusInfo.used_memory = d.used_memory || '-'
                statusInfo.mem_fragmentation_ratio = d.mem_fragmentation_ratio || '-'
                statusInfo.total_connections_received = d.total_connections_received || '-'
                statusInfo.total_commands_processed = d.total_commands_processed || '-'
                statusInfo.instantaneous_ops_per_sec = d.instantaneous_ops_per_sec || '-'
                statusInfo.keyspace_hits = d.keyspace_hits || '-'
                statusInfo.keyspace_misses = d.keyspace_misses || '-'
                statusInfo.hit = d.hit || '-'
                statusInfo.latest_fork_usec = d.latest_fork_usec || '-'
            }
        }

        // —— 日志页 ——
        async function loadLog() {
            var r = await ctx.api('/api/files/read?path=/www/wwwlogs/redis.log', { method: 'GET' })
            logContent.value = (r && r.content) ? r.content : ''
        }

        return {
            running, version, actionLoading,
            configContent, configSaving,
            perf, perfSaving,
            statusInfo,
            logContent,
            checkStatus, getVersion, control,
            loadConfig, saveConfig, loadPerf, savePerformance,
            loadStatus, loadLog,
            Editor,
        }
    },

    // layout == 'tabpages' 时生效（否则忽略）
    // 每个页面：onLoad 负责该页切入时加载数据(首次与每次切回都会跑)，render 只画页面内容
    // 侧边栏 tab 切换、页面加载中转圈、ctx.toast 提示均由框架自动处理，插件只需写 onLoad 和 render
    pages: {
        service: {
            onLoad(ctx, state) { return Promise.all([state.checkStatus(), state.getVersion()]) },
            render(h, state) {
                var running = state.running
                function btn(text, action) {
                    return h('button', {
                        class: 'btn' + (state.actionLoading.value === action ? ' loading' : ''),
                        onClick: function() { state.control(action) },
                    }, state.actionLoading.value === action ? '...' : text)
                }
                return h('div', [
                    h('p', [
                        '当前状态：' + (running.value ? '' : '未') + '运行',
                        h('span', { class: running.value ? 'on' : 'off' }, running.value ? ' ▶' : ' ⏸'),
                    ]),
                    h('div', { class: 'row' },
                        running.value
                            ? [btn('停止', 'stop'), btn('重启', 'restart'), btn('重载配置', 'reload')]
                            : [btn('启动', 'start')]
                    ),
                ])
            },
        },

        config: {
            onLoad(ctx, state) { return state.loadConfig() },
            render(h, state) {
                return h('div', [
                    h('p', { class: 'tip' }, '此处为Redis主配置文件，修改请谨慎'),
                    h(state.Editor, {
                        modelValue: state.configContent.value,
                        'onUpdate:modelValue': function(v) { state.configContent.value = v },
                        language: 'ini',
                    }),
                    h('div', { class: 'row' }, [
                        h('button', { class: 'btn', onClick: state.saveConfig },
                            state.configSaving.value ? '保存中...' : '保存'),
                    ]),
                ])
            },
        },

        performance: {
            onLoad(ctx, state) { return state.loadPerf() },
            render(h, state) {
                const field = function(label, tip, key) {
                    return [
                        h('label', label),
                        h('input', { value: state.perf[key] || '',
                            onInput: function(e) { state.perf[key] = e.target.value },
                        }),
                        h('span', { class: 'tip' }, tip),
                    ]
                }
                return h('div', [
                    h('p', { class: 'tip' }, '修改后请保存并重启服务生效'),
                    h('div', { class: 'form-grid' }, [
                        ...field('bind', '绑定IP(修改绑定IP可能会存在安全隐患)', 'bind'),
                        ...field('port', '绑定端口', 'port'),
                        ...field('timeout', '空闲连接超时,0表示不断开', 'timeout'),
                        ...field('maxclients', '最大连接数', 'maxclients'),
                        ...field('databases', '数据库数量', 'databases'),
                        ...field('requirepass', 'redis密码,留空代表没有设置密码', 'requirepass'),
                        ...field('maxmemory', 'MB,最大使用内存，0表示不限制', 'maxmemory'),
                    ]),
                    h('div', { class: 'row' }, [
                        h('button', { class: 'btn', onClick: state.savePerformance },
                            state.perfSaving.value ? '保存中...' : '保存'),
                    ]),
                ])
            },
        },

        load: {
            onLoad(ctx, state) { return state.loadStatus() },
            render(h, state) {
                var s = state.statusInfo
                var rows = [
                    ['uptime_in_days', '已运行天数'],
                    ['tcp_port', '当前监听端口'],
                    ['connected_clients', '连接的客户端数量'],
                    ['used_memory_rss', 'Redis当前占用的系统内存总量'],
                    ['used_memory', 'Redis历史分配内存的峰值'],
                    ['mem_fragmentation_ratio', '内存碎片比率'],
                    ['total_connections_received', '运行以来连接过的客户端的总数量'],
                    ['total_commands_processed', '运行以来执行过的命令的总数量'],
                    ['instantaneous_ops_per_sec', '服务器每秒钟执行的命令数量'],
                    ['keyspace_hits', '查找数据库键成功的次数'],
                    ['keyspace_misses', '查找数据库键失败的次数'],
                    ['hit', '查找数据库键命中率'],
                    ['latest_fork_usec', '最近一次 fork() 操作耗费的微秒数'],
                ]
                return h('table', { class: 'table' }, [
                    h('thead', [h('tr', [h('th', '字段'), h('th', '当前值'), h('th', '说明')])]),
                    h('tbody', rows.map(function(r) {
                        return h('tr', [h('td', r[0]), h('td', s[r[0]]), h('td', r[1])])
                    })),
                ])
            },
        },

        log: {
            onLoad(ctx, state) { return state.loadLog() },
            render(h, state) {
                return h('div', [
                    h(state.Editor, { modelValue: state.logContent.value, readonly: true }),
                ])
            },
        },
    },

    // layout !== 'none' 时将被忽略（仅 layout == 'none' 使用 setup + render）
    // render(h, state) {
    //     return h('div', '自由渲染模式：整个插件界面由本函数产出')
    // },
}
Plugin(redis).show()