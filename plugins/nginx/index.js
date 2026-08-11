const nginx = {
    plugin_name: 'nginx',
    title: 'Nginx',
    // layout: 'none' | 'tabpages'（缺省/空/null 均视为 'none'）
    layout: 'tabpages',

    // layout == 'tabpages' 时生效（否则忽略）
    // 键的插入顺序 = 侧边栏显示顺序，值 = 显示名
    tabs: {
        service: '服务',
        config: '配置文件',
        performance: '性能调整',
        load: '负载状态',
        errorlog: '错误日志',
    },

    // setup 里的状态与函数，供各页 render 使用
    setup(ctx) {
        const { ref, reactive } = ctx
        const Editor = ctx.Editor
        const toast = ctx.toast

        const running = ref(false)
        const version = ref('')
        const actionLoading = ref('')

        const configContent = ref('')
        const configSaving = ref(false)

        const perf = reactive({
            worker_processes: '',
            worker_connections: '',
            keepalive_timeout: '',
            gzip: false,
            gzip_min_length: '',
            gzip_comp_level: '',
            client_max_body_size: '',
            server_names_hash_bucket_size: '',
            client_header_buffer_size: '',
            client_body_buffer_size: '',
        })
        const perfSaving = ref(false)

        const loadInfo = reactive({
            active_connections: '',
            accepts: '',
            handled: '',
            requests: '',
            reading: '',
            writing: '',
            waiting: '',
            worker_count: '',
            worker_cpu: '',
            worker_mem: '',
        })

        const logContent = ref('')

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

        // —— 配置页 ——
        async function loadConfig() {
            try {
                var r = await ctx.api('get_nginx_config')
                var d = JSON.parse(r.stdout)
                configContent.value = (d.content) ? d.content : ''
            } catch (e) {
                configContent.value = ''
            }
        }

        async function saveConfig() {
            configSaving.value = true
            try {
                var r = await ctx.api('save_nginx_config', { body: JSON.stringify({ content: configContent.value }) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) {
                    toast('已保存并重载', 'ok')
                } else {
                    toast(d.error || '保存失败', 'err')
                }
            } catch (e) {
                toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                configSaving.value = false
            }
        }

        // —— 性能页 ——
        async function loadPerf() {
            try {
                var r = await ctx.api('get_nginx_value')
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    perf.worker_processes = d.worker_processes || 'auto'
                    perf.worker_connections = d.worker_connections || '1024'
                    perf.keepalive_timeout = d.keepalive_timeout || '65'
                    perf.gzip = d.gzip === 'on'
                    perf.gzip_min_length = d.gzip_min_length || '1024'
                    perf.gzip_comp_level = d.gzip_comp_level || '6'
                    perf.client_max_body_size = d.client_max_body_size || '1m'
                    perf.server_names_hash_bucket_size = d.server_names_hash_bucket_size || '64'
                    perf.client_header_buffer_size = d.client_header_buffer_size || '4k'
                    perf.client_body_buffer_size = d.client_body_buffer_size || '8k'
                }
            } catch (e) {}
        }

        async function savePerformance() {
            perfSaving.value = true
            try {
                var data = {
                    worker_processes: perf.worker_processes,
                    worker_connections: perf.worker_connections,
                    keepalive_timeout: perf.keepalive_timeout,
                    gzip: perf.gzip ? 'on' : 'off',
                    gzip_min_length: perf.gzip_min_length,
                    gzip_comp_level: perf.gzip_comp_level,
                    client_max_body_size: perf.client_max_body_size,
                    server_names_hash_bucket_size: perf.server_names_hash_bucket_size,
                    client_header_buffer_size: perf.client_header_buffer_size,
                    client_body_buffer_size: perf.client_body_buffer_size,
                }
                var r = await ctx.api('set_nginx_value', { body: JSON.stringify(data) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) {
                    toast('已保存', 'ok')
                } else {
                    toast(d.error || '保存失败', 'err')
                }
            } catch (e) {
                toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                perfSaving.value = false
            }
        }

        // —— 日志页 ——
        async function loadLog() {
            try {
                var r = await ctx.api('/api/files/read?path=/www/wwwlogs/nginx_error.log', { method: 'GET' })
                logContent.value = (r && r.content) ? r.content : ''
            } catch (e) {
                logContent.value = ''
            }
        }

        // —— 负载页 ——
        async function loadStatus() {
            try {
                var r = await ctx.api('get_nginx_status')
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    loadInfo.active_connections = d.active_connections || '-'
                    loadInfo.accepts = d.accepts || '-'
                    loadInfo.handled = d.handled || '-'
                    loadInfo.requests = d.requests || '-'
                    loadInfo.reading = d.reading || '-'
                    loadInfo.writing = d.writing || '-'
                    loadInfo.waiting = d.waiting || '-'
                    loadInfo.worker_count = d.worker_count || '-'
                    loadInfo.worker_cpu = d.worker_cpu || '-'
                    loadInfo.worker_mem = d.worker_mem || '-'
                }
            } catch (e) {}
        }

        return {
            Editor, running, version, actionLoading,
            configContent, configSaving,
            perf, perfSaving,
            loadInfo,
            logContent,
            checkStatus, getVersion, control,
            loadConfig, saveConfig,
            loadPerf, savePerformance,
            loadLog, loadStatus,
        }
    },

    // layout == 'tabpages' 时生效（否则忽略）
    // 每个页面：onLoad 负责该页切入时加载数据(首次与每次切回都会跑)，render 只画页面内容
    // 侧边栏 tab 切换、页面加载中转圈、ctx.toast 提示均由框架自动处理，插件只需写 onLoad 和 render
    pages: {
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

        // —— 配置文件 ——
        config: {
            onLoad(ctx, state) { return state.loadConfig() },
            render(h, state) {
                return h('div', [
                    h('p', { class: 'tip' }, '此处为 nginx 主配置文件，修改请谨慎'),
                    h(state.Editor, {
                        modelValue: state.configContent.value,
                        'onUpdate:modelValue': function(v) { state.configContent.value = v },
                        language: 'nginx',
                    }),
                    h('div', { class: 'row' }, [
                        h('button', { class: 'btn', onClick: state.saveConfig },
                            state.configSaving.value ? '保存中...' : '保存'),
                    ]),
                ])
            },
        },

        // —— 性能调整 ——
        performance: {
            onLoad(ctx, state) { return state.loadPerf() },
            render(h, state) {
                const field = function(label, tip, key) {
                    return [
                        h('label', label),
                        h('input', {
                            value: state.perf[key] || '',
                            onInput: function(e) { state.perf[key] = e.target.value },
                        }),
                        h('span', { class: 'tip' }, tip),
                    ]
                }
                return h('div', [
                    h('p', { class: 'tip' }, '修改后请保存并重载 Nginx 生效'),
                    h('div', { class: 'form-grid' }, [
                        ...field('worker_processes', '进程数, auto 或数字', 'worker_processes'),
                        ...field('worker_connections', '最大并发连接数', 'worker_connections'),
                        ...field('keepalive_timeout', '连接超时(秒)', 'keepalive_timeout'),
                        h('label', 'gzip'),
                        h('select', { class: 'slt', value: state.perf.gzip ? 'on' : 'off',
                            onChange: function(e) { state.perf.gzip = e.target.value === 'on' } },
                            [h('option', { value: 'on' }, '开启'), h('option', { value: 'off' }, '关闭')]),
                        h('span', { class: 'tip' }, '是否启用压缩'),
                        ...field('gzip_min_length', 'KB，最小压缩文件', 'gzip_min_length'),
                        ...field('gzip_comp_level', '压缩等级 1-9', 'gzip_comp_level'),
                        ...field('client_max_body_size', 'MB，最大上传(如50m)', 'client_max_body_size'),
                        ...field('server_names_hash_bucket_size', 'hash表大小', 'server_names_hash_bucket_size'),
                        ...field('client_header_buffer_size', 'KB，请求头buffer(如32k)', 'client_header_buffer_size'),
                        ...field('client_body_buffer_size', 'KB，请求体buffer(如512k)', 'client_body_buffer_size'),
                    ]),
                    h('div', { class: 'row' }, [
                        h('button', { class: 'btn', onClick: state.savePerformance },
                            state.perfSaving.value ? '保存中...' : '保存'),
                    ]),
                ])
            },
        },

        // —— 负载状态 ——
        load: {
            onLoad(ctx, state) { return state.loadStatus() },
            render(h, state) {
                var s = state.loadInfo
                var rows = [
                    ['active_connections', '活动连接 Active'],
                    ['accepts', '总连接次数 accepts'],
                    ['handled', '总握手次数 handled'],
                    ['requests', '总请求数 requests'],
                    ['reading', '请求数 Reading'],
                    ['writing', '响应数 Writing'],
                    ['waiting', '驻留进程 Waiting'],
                    ['worker_count', '工作进程 Worker'],
                    ['worker_cpu', '占用 CPU'],
                    ['worker_mem', '占用内存'],
                ]
                return h('div', [
                    h('table', { class: 'table' }, [
                        h('thead', [h('tr', [h('th', '字段'), h('th', '当前值')])]),
                        h('tbody', rows.map(function(r) {
                            return h('tr', [h('td', r[1]), h('td', s[r[0]])])
                        })),
                    ]),
                ])
            },
        },

        // —— 错误日志 ——
        errorlog: {
            onLoad(ctx, state) { return state.loadLog() },
            render(h, state) {
                return h('div', [
                    h(state.Editor, { modelValue: state.logContent.value, readonly: true }),
                ])
            },
        },
    },
}

Plugin(nginx).show()