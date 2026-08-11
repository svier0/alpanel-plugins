const mysql = {
    plugin_name: 'mysql',
    title: 'MySQL',
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
        slowlog: '慢日志',
        binlog: '二进制日志',
        port: '端口配置',
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
            table_open_cache: '',
            thread_cache_size: '',
            key_buffer_size: '',
            tmp_table_size: '',
            innodb_buffer_pool_size: '',
            innodb_log_buffer_size: '',
            max_connections: '',
            sort_buffer_size: '',
            read_buffer_size: '',
            read_rnd_buffer_size: '',
            join_buffer_size: '',
            thread_stack: '',
            binlog_cache_size: '',
        })
        const perfSaving = ref(false)

        const errLogContent = ref('')
        const slowLogContent = ref('')

        const statusInfo = reactive({
            start_time: '', connections: '', bytes_sent: '', bytes_recv: '',
            qps: '', tps: '', file: '', position: '',
            threads: '', threads_hit: '', key_hit: '', innodb_hit: '',
            qcache_hit: '', tmp_disk: '', open_tables: '',
            select_scan: '', full_join: '', sort_merge: '', lock_waited: '',
        })

        const binlog = reactive({
            enabled: false,
            size: '',
            logs: [],
        })
        const binlogSaving = ref(false)

        const portVal = ref('3306')
        const portSaving = ref(false)

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

        async function loadConfig() {
            try {
                var r = await ctx.api('get_mysql_config')
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    configContent.value = (d.content) ? d.content : ''
                }
            } catch (e) {
                configContent.value = ''
            }
        }

        async function saveConfig() {
            configSaving.value = true
            try {
                var r = await ctx.api('save_mysql_config', { body: JSON.stringify({ content: configContent.value }) })
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

        async function loadPerf() {
            try {
                var r = await ctx.api('get_mysql_value')
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    perf.table_open_cache = d.table_open_cache || '128'
                    perf.thread_cache_size = d.thread_cache_size || '16'
                    perf.key_buffer_size = d.key_buffer_size || '32'
                    perf.tmp_table_size = d.tmp_table_size || '32'
                    perf.innodb_buffer_pool_size = d.innodb_buffer_pool_size || '128'
                    perf.innodb_log_buffer_size = d.innodb_log_buffer_size || '16'
                    perf.max_connections = d.max_connections || '500'
                    perf.sort_buffer_size = d.sort_buffer_size || '768'
                    perf.read_buffer_size = d.read_buffer_size || '768'
                    perf.read_rnd_buffer_size = d.read_rnd_buffer_size || '256'
                    perf.join_buffer_size = d.join_buffer_size || '256'
                    perf.thread_stack = d.thread_stack || '256'
                    perf.binlog_cache_size = d.binlog_cache_size || '32'
                }
            } catch (e) {}
        }

        async function savePerformance() {
            perfSaving.value = true
            try {
                var data = {
                    table_open_cache: perf.table_open_cache,
                    thread_cache_size: perf.thread_cache_size,
                    key_buffer_size: perf.key_buffer_size,
                    tmp_table_size: perf.tmp_table_size,
                    innodb_buffer_pool_size: perf.innodb_buffer_pool_size,
                    innodb_log_buffer_size: perf.innodb_log_buffer_size,
                    max_connections: perf.max_connections,
                    sort_buffer_size: perf.sort_buffer_size,
                    read_buffer_size: perf.read_buffer_size,
                    read_rnd_buffer_size: perf.read_rnd_buffer_size,
                    join_buffer_size: perf.join_buffer_size,
                    thread_stack: perf.thread_stack,
                    binlog_cache_size: perf.binlog_cache_size,
                }
                var r = await ctx.api('set_mysql_value', { body: JSON.stringify(data) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) {
                    toast('已保存，需重启数据库生效', 'ok')
                } else {
                    toast(d.error || '保存失败', 'err')
                }
            } catch (e) {
                toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                perfSaving.value = false
            }
        }

        async function loadStatus() {
            try {
                var r = await ctx.api('get_mysql_status')
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    statusInfo.start_time = d.start_time || '-'
                    statusInfo.connections = d.connections || '-'
                    statusInfo.bytes_sent = d.bytes_sent || '-'
                    statusInfo.bytes_recv = d.bytes_recv || '-'
                    statusInfo.qps = d.qps || '-'
                    statusInfo.tps = d.tps || '-'
                    statusInfo.file = d.file || '-'
                    statusInfo.position = d.position || '-'
                    statusInfo.threads = d.threads || '-'
                    statusInfo.threads_hit = d.threads_hit || '-'
                    statusInfo.key_hit = d.key_hit || '-'
                    statusInfo.innodb_hit = d.innodb_hit || '-'
                    statusInfo.qcache_hit = d.qcache_hit || '-'
                    statusInfo.tmp_disk = d.tmp_disk || '-'
                    statusInfo.open_tables = d.open_tables || '-'
                    statusInfo.select_scan = d.select_scan || '-'
                    statusInfo.full_join = d.full_join || '-'
                    statusInfo.sort_merge = d.sort_merge || '-'
                    statusInfo.lock_waited = d.lock_waited || '-'
                }
            } catch (e) {}
        }

        async function loadErrLog() {
            try {
                var r = await ctx.api('get_mysql_log', { body: JSON.stringify({ path: '/www/wwwlogs/mysql_error.log' }) })
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    errLogContent.value = (d.content) ? d.content : ''
                }
            } catch (e) {
                errLogContent.value = ''
            }
        }

        async function loadSlowLog() {
            try {
                var r = await ctx.api('get_mysql_log', { body: JSON.stringify({ path: '/www/server/data/SVIER-slow.log' }) })
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    slowLogContent.value = (d.content) ? d.content : ''
                }
            } catch (e) {
                slowLogContent.value = ''
            }
        }

        async function loadBinlog() {
            try {
                var r = await ctx.api('get_mysql_binlog')
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    binlog.enabled = d.enabled === 'ON'
                    binlog.size = d.size || ''
                    binlog.logs = d.logs || []
                }
            } catch (e) {}
        }

        async function setBinlog(on) {
            binlogSaving.value = true
            try {
                var r = await ctx.api('set_mysql_binlog', { body: JSON.stringify({ enabled: on ? 'on' : 'off' }) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) {
                    toast('已' + (on ? '开启' : '关闭') + '，数据库已重启', 'ok')
                } else {
                    toast(d.error || '操作失败', 'err')
                }
            } catch (e) {
                toast('操作失败 ' + (e.message || ''), 'err')
            } finally {
                binlogSaving.value = false
            }
            loadBinlog()
        }

        async function deleteBinlog(name) {
            try {
                var r = await ctx.api('delete_mysql_binlog', { body: JSON.stringify({ name: name }) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) {
                    toast('已删除 ' + name, 'ok')
                } else {
                    toast(d.error || '删除失败', 'err')
                }
            } catch (e) {
                toast('删除失败 ' + (e.message || ''), 'err')
            }
            loadBinlog()
        }

        async function loadPort() {
            try {
                var r = await ctx.api('get_mysql_port')
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    portVal.value = d.port || '3306'
                }
            } catch (e) {}
        }

        async function savePort() {
            portSaving.value = true
            try {
                var r = await ctx.api('set_mysql_port', { body: JSON.stringify({ port: portVal.value }) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) {
                    toast('已保存，数据库已重启', 'ok')
                } else {
                    toast(d.error || '保存失败', 'err')
                }
            } catch (e) {
                toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                portSaving.value = false
            }
        }

        return {
            Editor, running, version, actionLoading,
            configContent, configSaving,
            perf, perfSaving,
            errLogContent, slowLogContent,
            statusInfo,
            binlog, binlogSaving,
            portVal, portSaving,
            checkStatus, getVersion, control,
            loadConfig, saveConfig,
            loadPerf, savePerformance,
            loadErrLog, loadSlowLog, loadStatus,
            loadBinlog, setBinlog, deleteBinlog,
            loadPort, savePort,
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

        config: {
            onLoad(ctx, state) { return state.loadConfig() },
            render(h, state) {
                return h('div', [
                    h('p', { class: 'tip' }, '此处为 MySQL 主配置文件，修改请谨慎'),
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
                        h('input', {
                            value: state.perf[key] || '',
                            onInput: function(e) { state.perf[key] = e.target.value },
                        }),
                        h('span', { class: 'tip' }, tip),
                    ]
                }
                return h('div', [
                    h('p', { class: 'tip' }, '修改后请保存并重启数据库生效'),
                    h('div', { class: 'form-grid' }, [
                        ...field('table_open_cache', '128 表缓存', 'table_open_cache'),
                        ...field('thread_cache_size', '16 线程池大小', 'thread_cache_size'),
                        ...field('key_buffer_size', 'MB 索引缓冲区', 'key_buffer_size'),
                        ...field('tmp_table_size', 'MB 临时表缓存', 'tmp_table_size'),
                        ...field('innodb_buffer_pool_size', 'MB Innodb缓冲区', 'innodb_buffer_pool_size'),
                        ...field('innodb_log_buffer_size', 'MB Innodb日志缓冲区', 'innodb_log_buffer_size'),
                        ...field('max_connections', '最大连接数', 'max_connections'),
                        ...field('sort_buffer_size', 'KB*连接 排序缓冲', 'sort_buffer_size'),
                        ...field('read_buffer_size', 'KB*连接 读入缓冲', 'read_buffer_size'),
                        ...field('read_rnd_buffer_size', 'KB*连接 随机读缓冲', 'read_rnd_buffer_size'),
                        ...field('join_buffer_size', 'KB*连接 关联表缓存', 'join_buffer_size'),
                        ...field('thread_stack', 'KB*连接 线程堆栈', 'thread_stack'),
                        ...field('binlog_cache_size', 'KB*连接 二进制日志缓存(4096倍数)', 'binlog_cache_size'),
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
                return h('div', [
                    h('table', { class: 'table kv' }, [
                        h('tbody', [
                            h('tr', [h('td', '启动时间'), h('td', s.start_time), h('td', '总连接次数'), h('td', s.connections)]),
                            h('tr', [h('td', '发送'), h('td', s.bytes_sent), h('td', '接收'), h('td', s.bytes_recv)]),
                            h('tr', [h('td', '每秒查询'), h('td', s.qps), h('td', '每秒事务'), h('td', s.tps)]),
                            h('tr', [h('td', 'File'), h('td', s.file), h('td', 'Position'), h('td', s.position)]),
                        ]),
                    ]),
                    h('table', { class: 'table' }, [
                        h('thead', [h('tr', [h('th', '字段'), h('th', '当前值'), h('th', '注意')])]),
                        h('tbody', [
                            h('tr', [h('td', '活动/峰值连接数'), h('td', s.threads), h('td', '若值过大,增加max_connections')]),
                            h('tr', [h('td', '线程缓存命中率'), h('td', s.threads_hit), h('td', '若过低,增加thread_cache_size')]),
                            h('tr', [h('td', '索引命中率'), h('td', s.key_hit), h('td', '若过低,增加key_buffer_size')]),
                            h('tr', [h('td', 'Innodb索引命中率'), h('td', s.innodb_hit), h('td', '若过低,增加innodb_buffer_pool_size')]),
                            h('tr', [h('td', '查询缓存命中率'), h('td', s.qcache_hit), h('td', '若过低,增加query_cache_size')]),
                            h('tr', [h('td', '创建临时表到磁盘'), h('td', s.tmp_disk), h('td', '若过大,尝试增加tmp_table_size')]),
                            h('tr', [h('td', '已打开的表'), h('td', s.open_tables), h('td', 'table_open_cache配置值应大于等于此值')]),
                            h('tr', [h('td', '没有使用索引的量'), h('td', s.select_scan), h('td', '若不为0,请检查数据表的索引是否合理')]),
                            h('tr', [h('td', '没有索引的JOIN量'), h('td', s.full_join), h('td', '若不为0,请检查数据表的索引是否合理')]),
                            h('tr', [h('td', '排序后的合并次数'), h('td', s.sort_merge), h('td', '若值过大,增加sort_buffer_size')]),
                            h('tr', [h('td', '锁表次数'), h('td', s.lock_waited), h('td', '若值过大,请考虑增加您的数据库性能')]),
                        ]),
                    ]),
                ])
            },
        },

        errorlog: {
            onLoad(ctx, state) { return state.loadErrLog() },
            render(h, state) {
                return h('div', [
                    h(state.Editor, { modelValue: state.errLogContent.value, readonly: true }),
                ])
            },
        },

        slowlog: {
            onLoad(ctx, state) { return state.loadSlowLog() },
            render(h, state) {
                return h('div', [
                    h(state.Editor, { modelValue: state.slowLogContent.value, readonly: true }),
                ])
            },
        },

        binlog: {
            onLoad(ctx, state) { return state.loadBinlog() },
            render(h, state) {
                var b = state.binlog
                var sw = h('div', {
                    class: 'switch' + (b.enabled ? ' on' : ''),
                    onClick: function() { if (!state.binlogSaving.value) state.setBinlog(!b.enabled) },
                }, [
                    h('span', { class: 'track' }, [h('i', { class: 'knob' })]),
                ])
                return h('div', [
                    h('div', { class: 'sw' }, [
                        '二进制日志',
                        sw,
                        h('span', { class: 'sw-size' }, b.size),
                    ]),
                    h('p', { class: 'tip' }, '· 温馨提示：MySQL二进制日志可用于数据备份恢复。'),
                    h('table', { class: 'table' }, [
                        h('thead', [h('tr', [h('th', '文件名'), h('th', '大小'), h('th', '最后修改时间'), h('th', '操作')])]),
                        h('tbody', b.logs && b.logs.length
                            ? b.logs.map(function(log) {
                                    return h('tr', [
                                        h('td', log.name),
                                        h('td', log.size),
                                        h('td', log.time || '-'),
                                        h('td', h('a', { class: 'dl-link', onClick: function() { state.deleteBinlog(log.name) } }, '删除')),
                                    ])
                                })
                            : []),
                    ]),
                ])
            },
        },

        port: {
            onLoad(ctx, state) { return state.loadPort() },
            render(h, state) {
                return h('div', [
                    h('div', { class: 'form-grid' }, [
                        h('label', '端口'),
                        h('input', {
                            value: state.portVal.value,
                            onInput: function(e) { state.portVal.value = e.target.value },
                        }),
                        h('span', { class: 'tip' }, '修改后保存并重启生效'),
                    ]),
                    h('div', { class: 'row' }, [
                        h('button', { class: 'btn', onClick: state.savePort },
                            state.portSaving.value ? '保存中...' : '保存'),
                    ]),
                ])
            },
        },
    },

    style() {
        return [
            '.table{width:100%;border-collapse:collapse;margin-top:4px}',
            '.table + .table{margin-top:20px}',
            '.table.kv{border:1px solid #2a2a2a}',
            '.table.kv td{border:1px solid #2a2a2a}',
            '.table th{background:#202020;color:#ccc;font-weight:500}',
            '.table th,.table td{padding:8px 14px;border-bottom:1px solid #2a2a2a;font-size:14px}',
            '.table td{color:#aaa}',
            '.table tr td:nth-child(2n){width:26%}',
            '.sw{display:flex;align-items:center;gap:10px;margin-bottom:14px}',
            '.sw-size{font-size:13px;color:#ccc}',
            '.switch{display:inline-flex;align-items:center;cursor:pointer;user-select:none}',
            '.switch .track{width:44px;height:24px;border-radius:12px;background:#333;position:relative;transition:background .2s;flex-shrink:0}',
            '.switch .track .knob{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#ccc;transition:left .2s,background .2s}',
            '.switch.on .track{background:#409eff}',
            '.switch.on .track .knob{left:22px;background:#fff}',
            '.dl-link{color:#f56c6c;cursor:pointer;font-size:13px}',
            '.dl-link:hover{text-decoration:underline}',
        ].join(' ')
    }
}

Plugin(mysql).show()