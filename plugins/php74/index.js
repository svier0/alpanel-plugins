const php74 = {
    plugin_name: 'php74',
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

        // —— Session 配置 ——
        const sessionCfg = reactive({ handler: 'files', host: '', port: '', password: '' })
        const sessionSaving = ref(false)
        const sessionFiles = reactive({ total: '0', cleanable: '0' })
        async function loadSession() {
            try {
                var r = await ctx.api('get_session')
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    Object.assign(sessionCfg, { handler: d.handler || 'files', host: d.host || '', port: d.port || '', password: d.password || '' })
                }
            } catch (e) {}
            try {
                var r2 = await ctx.api('get_session_files')
                if (r2 && r2.stdout) {
                    var d2 = JSON.parse(r2.stdout)
                    sessionFiles.total = d2.total || '0'
                    sessionFiles.cleanable = d2.cleanable || '0'
                }
            } catch (e) {}
        }
        async function saveSession() {
            sessionSaving.value = true
            try {
                var r = await ctx.api('set_session', { body: JSON.stringify(sessionCfg) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                toast(d.ok ? '保存成功' : (d.error || '保存失败'), d.ok ? 'ok' : 'err')
            } catch (e) {
                toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                sessionSaving.value = false
            }
        }
        async function cleanSession() {
            try {
                var r = await ctx.api('clean_session_files')
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                toast(d.ok ? '清理完成' : (d.error || '清理失败'), d.ok ? 'ok' : 'err')
            } catch (e) {
                toast('清理失败 ' + (e.message || ''), 'err')
            }
            loadSession()
        }

        // —— 禁用函数 ——
        const disableFuncs = ref([])
        async function loadDisableFuncs() {
            try {
                var r = await ctx.api('get_disable_funcs')
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                disableFuncs.value = d.list || []
            } catch (e) {
                disableFuncs.value = []
            }
        }
        async function delDisableFunc(name) {
            try {
                var r = await ctx.api('del_disable_func', { body: JSON.stringify({ name: name }) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                toast(d.ok ? '已删除 ' + name : (d.error || '删除失败'), d.ok ? 'ok' : 'err')
            } catch (e) {
                toast('删除失败 ' + (e.message || ''), 'err')
            }
            loadDisableFuncs()
        }

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

        // —— 性能调整页 ——
        const perf = reactive({
            listen: '/tmp/php-cgi-74.sock',
            allowed_clients: '127.0.0.1',
            pm: '按需模式',
            max_children: '30',
            start_servers: '5',
            min_spare_servers: '5',
            max_spare_servers: '10',
        })
        const perfSaving = ref(false)

        async function loadPerf() {
            try {
                var r = await ctx.api('get_fpm_value')
                if (r && r.stdout) {
                    var d = JSON.parse(r.stdout)
                    perf.listen = d.listen || '/tmp/php-cgi-74.sock'
                    perf.allowed_clients = d.allowed_clients || '127.0.0.1'
                    perf.pm = (d.pm === 'static') ? '静态模式' : (d.pm === 'dynamic' ? '动态模式' : '按需模式')
                    perf.max_children = d.max_children || '30'
                    perf.start_servers = d.start_servers || '5'
                    perf.min_spare_servers = d.min_spare_servers || '5'
                    perf.max_spare_servers = d.max_spare_servers || '10'
                }
            } catch (e) {}
        }

        async function savePerf() {
            perfSaving.value = true
            try {
                var data = {
                    listen: perf.listen,
                    allowed_clients: perf.allowed_clients,
                    pm: perf.pm === '静态模式' ? 'static' : (perf.pm === '动态模式' ? 'dynamic' : 'ondemand'),
                    max_children: perf.max_children,
                    start_servers: perf.start_servers,
                    min_spare_servers: perf.min_spare_servers,
                    max_spare_servers: perf.max_spare_servers,
                }
                var r = await ctx.api('set_fpm_value', { body: JSON.stringify(data) })
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d.ok) {
                    toast('已保存，请重启PHP生效', 'ok')
                } else {
                    toast(d.error || '保存失败', 'err')
                }
            } catch (e) {
                toast('保存失败 ' + (e.message || ''), 'err')
            } finally {
                perfSaving.value = false
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
                var r = await ctx.api('get_fpm_log')
                logContent.value = (r && r.stdout) ? r.stdout : ''
            } catch (e) {
                logContent.value = ''
            }
        }

        // —— 慢日志页 ——
        async function loadSlowlog() {
            try {
                var r = await ctx.api('get_slow_log')
                slowlogContent.value = (r && r.stdout) ? r.stdout : ''
            } catch (e) {
                slowlogContent.value = ''
            }
        }

        // —— 负载状态页 ——
        const statusFields = [
            { key: 'pool', label: '应用池' },
            { key: 'process manager', label: '进程管理方式' },
            { key: 'start time', label: '启动日期' },
            { key: 'accepted conn', label: '请求数' },
            { key: 'listen queue', label: '请求队列' },
            { key: 'max listen queue', label: '最大等待队列' },
            { key: 'idle processes', label: '空闲进程数' },
            { key: 'active processes', label: '活跃进程数' },
            { key: 'total processes', label: '总进程数' },
            { key: 'max active processes', label: '最大活跃进程数' },
            { key: 'max children reached', label: '到达进程上限次数' },
            { key: 'slow requests', label: '慢请求数量' },
        ]
        const fpmStatus = reactive({})
        const statusError = ref('')
        const extStatus = ref({})

        async function loadStatus() {
            statusError.value = ''
            try {
                var r = await ctx.api('get_fpm_status')
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d && d.error) {
                    statusError.value = d.error
                    return
                }
                Object.keys(fpmStatus).forEach(function(k) { delete fpmStatus[k] })
                Object.assign(fpmStatus, d)
                extStatus.value = (d && d.requests) ? d.requests : {}
            } catch (e) {
                statusError.value = '服务未启动'
            }
        }

        // —— 安装扩展 ——
        // 子tab: 安装列表 / 本地扩展
        const extTab = ref('list')
        const extList = ref([])
        const extListError = ref('')
        const localExts = ref({ builtin: [], so: [] })
        const BUILTIN_EXTS = [
            'Core', 'date', 'filter', 'hash', 'libxml', 'pcre', 'phpdbg_webhelper',
            'readline', 'Reflection', 'SPL', 'standard', 'zlib',
        ]
        async function loadExtList() {
            try {
                var r = await ctx.api('get_ext_list')
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d && d.list) {
                    extList.value = d.list
                    return
                }
                if (d && d.error) {
                    extListError.value = d.error
                }
            } catch (e) {}
            if (!extList.value.length) {
                extListError.value = extListError.value || '扩展列表加载失败'
            }
        }
        async function refreshExtList() {
            try {
                var r = await ctx.api('build_ext_cache')
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d && d.ok) {
                    ctx.toast('已更新扩展列表', 'ok')
                    loadExtList()
                } else {
                    ctx.toast((d && d.error) || '获取扩展列表失败', 'err')
                }
            } catch (e) {
                ctx.toast('获取扩展列表失败 ' + (e.message || ''), 'err')
            }
        }
        async function loadLocalExts() {
            try {
                var r = await ctx.api('get_local_exts')
                var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                if (d && (d.builtin || d.so)) {
                    localExts.value = { builtin: d.builtin || [], so: d.so || [] }
                    return
                }
            } catch (e) {}
            localExts.value = {
                builtin: BUILTIN_EXTS,
                so: ['curl', 'gd', 'mbstring', 'mysqli', 'mysqlnd', 'opcache', 'openssl', 'pdo', 'pdo_mysql', 'zip'],
            }
        }
        function installExt(pkg) {
            ctx.api('install_ext', { body: JSON.stringify({ name: pkg }) })
                .then(function(r) {
                    var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                    if (d.ok) {
                        ctx.toast('已安装 ' + pkg, 'ok')
                        if (running.value) control('reload')
                        loadLocalExts()
                    } else {
                        ctx.toast(d.error || '安装失败', 'err')
                    }
                })
                .catch(function(e) { ctx.toast('安装失败 ' + (e.message || ''), 'err') })
        }
        function uninstallExt(pkg) {
            ctx.api('uninstall_ext', { body: JSON.stringify({ name: pkg }) })
                .then(function(r) {
                    var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
                    if (d.ok) {
                        ctx.toast('已卸载 ' + pkg, 'ok')
                        if (running.value) control('reload')
                        loadLocalExts()
                    } else {
                        ctx.toast(d.error || '卸载失败', 'err')
                    }
                })
                .catch(function(e) { ctx.toast('卸载失败 ' + (e.message || ''), 'err') })
        }

        return {
            Editor, running, version, actionLoading,
            adjust, adjustSaving,
            perf, perfSaving,
            iniContent, iniSaving,
            fpmContent, fpmSaving,
            logContent, slowlogContent,
            disableFuncs, loadDisableFuncs, delDisableFunc,
            sessionCfg, sessionSaving, sessionFiles, loadSession, saveSession, cleanSession,
            statusFields, fpmStatus, statusError, extStatus,
            extTab, extList, extListError, localExts, loadExtList, loadLocalExts, refreshExtList, installExt, uninstallExt,
            checkStatus, getVersion, control,
            loadAdjust, saveAdjust,
            loadPerf, savePerf,
            loadPhpIni, savePhpIni,
            loadFpmConf, saveFpmConf,
            loadLog, loadSlowlog, loadStatus,
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
            onLoad(ctx, state) { return state.loadDisableFuncs() },
            render(h, state) {
                var list = state.disableFuncs.value
                return h('div', [
                    h('table', { class: 'table' }, [
                        h('thead', [h('tr', [h('th', '名称'), h('th', '操作')])]),
                        h('tbody', list && list.length
                            ? list.map(function(name) {
                                    return h('tr', [
                                        h('td', name),
                                        h('td', h('a', { class: 'dl-link', onClick: function() { state.delDisableFunc(name) } }, '删除')),
                                    ])
                                })
                            : []),
                    ]),
                    h('p', { class: 'tip' }, '在此处可以禁用指定函数的调用,以增强环境安全性!'),
                    h('p', { class: 'tip' }, '强烈建议禁用如exec,system等危险函数!'),
                ])
            },
        },

        // —— 安装扩展 ——
        ext: {
            onLoad(ctx, state) { return Promise.all([state.loadExtList(), state.loadLocalExts()]) },
            render(h, state) {
                var tab = state.extTab.value
                var soNames = state.localExts.value.so || []
                var builtinNames = state.localExts.value.builtin || []
                var subTab = function(key, label) {
                    return h('div', {
                        class: 'subtab-item' + (tab === key ? ' active' : ''),
                        onClick: function() { state.extTab.value = key },
                    }, label)
                }
                var content
                if (tab === 'local') {
                    var localRows = builtinNames.concat(soNames).map(function(name) {
                        return h('tr', [h('td', name)])
                    })
                    content = h('table', { class: 'table' }, [
                        h('thead', [h('tr', [h('th', '扩展名称')])]),
                        h('tbody', localRows),
                    ])
                } else {
                    var rows = state.extList.value.map(function(item) {
                        var name = item.name
                        var pkg = item.pkg || name
                        var isBuiltin = builtinNames.indexOf(name) !== -1
                        var isInstalled = soNames.indexOf(name) !== -1
                        var op
                        if (isBuiltin) {
                            op = h('a', { class: 'builtin-tag' }, '内置')
                        } else if (isInstalled) {
                            op = h('a', { class: 'dl-link', onClick: function() { state.uninstallExt(pkg) } }, '卸载')
                        } else {
                            op = h('a', { class: 'inst-link', onClick: function() { state.installExt(pkg) } }, '安装')
                        }
                        return h('tr', [
                            h('td', name),
                            h('td', item.desc || ''),
                            h('td', op),
                        ])
                    })
                    content = [
                        h('table', { class: 'table' }, [
                            h('thead', [h('tr', [h('th', '名称'), h('th', '说明'), h('th', '操作')])]),
                            h('tbody', rows),
                        ]),
                        h('p', { class: 'tip' }, state.extListError.value ? state.extListError.value : ''),
                        h('p', { class: 'tip' }, [
                            h('a', { class: 'refresh-link', onClick: state.refreshExtList }, '点击获取最新扩展列表'),
                        ]),
                        h('p', { class: 'tip' }, 'Redis扩展仅支持一个PHP版本安装使用,若在其它PHP版本已安装redis扩展,请勿再装'),
                        h('p', { class: 'tip' }, '请按实际需求安装扩展,不要安装不必要的PHP扩展,这会影响PHP执行效率,甚至出现异常'),
                        h('p', { class: 'tip' }, 'opcache/xcache/apc等脚本缓存扩展,请只安装其中1个,否则可能导致您的站点程序异常'),
                    ]
                }
                return h('div', [
                    h('div', { class: 'subtab' }, [
                        subTab('list', '安装列表'),
                        subTab('local', '本地扩展'),
                    ]),
                    content,
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
            onLoad(ctx, state) { return state.loadPerf() },
            render(h, state) {
                var p = state.perf
                const field = function(label, tip, key) {
                    return [
                        h('label', label),
                        h('input', {
                            value: p[key] || '',
                            onInput: function(e) { p[key] = e.target.value },
                        }),
                        h('span', { class: 'tip' }, tip),
                    ]
                }
                return h('div', [
                    h('div', { class: 'form-grid' }, [
                        ...field('连接信息', '绑定IP:监听端口或Unix套接字地址', 'listen'),
                        ...field('IP白名单', '允许访问PHP的IP，多个请用逗号隔开', 'allowed_clients'),
                        h('label', '运行模式'),
                        h('select', { class: 'slt', value: p.pm,
                            onChange: function(e) { p.pm = e.target.value } },
                            [
                                h('option', { value: '静态模式' }, '静态模式'),
                                h('option', { value: '动态模式' }, '动态模式'),
                                h('option', { value: '按需模式' }, '按需模式'),
                            ]),
                        h('span', { class: 'tip' }, 'PHP-FPM运行模式'),
                        ...field('max_children', '允许创建的最大子进程数', 'max_children'),
                        ...field('start_servers', '起始进程数（服务启动后初始进程数量）', 'start_servers'),
                        ...field('min_spare_servers', '最小空闲进程数（清理空闲进程后的保留数量）', 'min_spare_servers'),
                        ...field('max_spare_servers', '最大空闲进程数（当空闲进程达到此值时清理）', 'max_spare_servers'),
                    ]),
                    h('div', { class: 'row' }, [
                        h('button', { class: 'btn', onClick: state.savePerf },
                            state.perfSaving.value ? '保存中...' : '保存'),
                    ]),
                    h('p', { class: 'tip' }, '【最大子进程数量】越大，并发能力越强，但max_children最大不要超过5000'),
                    h('p', { class: 'tip' }, '【内存】每个PHP子进程需要20MB左右内存，过大的max_children会导致服务器不稳定'),
                    h('p', { class: 'tip' }, '【静态模式】始终维持设置的子进程数量，对内存开销较大，但并发能力较好'),
                    h('p', { class: 'tip' }, '【动态模式】按设置最大空闲进程数来收回进程，内存开销小，建议小内存机器使用'),
                    h('p', { class: 'tip' }, '【按需模式】根据访问需求自动创建进程，内存开销极小，但并发能力略差'),
                    h('p', { class: 'tip' }, '调整完配置需要重启PHP才会生效'),
                ])
            },
        },

        // —— Session配置 ——
        session: {
            onLoad(ctx, state) { return state.loadSession() },
            render(h, state) {
                var s = state.sessionCfg
                return h('div', [
                    h('div', { class: 'form-grid' }, [
                        h('label', '存储模式'),
                        h('select', { class: 'slt', value: s.handler,
                            onChange: function(e) { s.handler = e.target.value } },
                            [
                                h('option', { value: 'files' }, 'files'),
                                h('option', { value: 'redis' }, 'redis'),
                                h('option', { value: 'memcache' }, 'Memcache'),
                                h('option', { value: 'memcached' }, 'Memcached'),
                            ]),
                        h('span', { class: 'tip' }, 'Session存储方式'),
                        h('label', '链接地址'),
                        h('input', {
                            value: s.host,
                            onInput: function(e) { s.host = e.target.value },
                        }),
                        h('span', { class: 'tip' }, '支持域名和IP地址'),
                        h('label', '端口'),
                        h('input', {
                            value: s.port,
                            onInput: function(e) { s.port = e.target.value },
                        }),
                        h('span', { class: 'tip' }, ''),
                        h('label', '密码'),
                        h('input', {
                            value: s.password,
                            placeholder: '无密码时留空',
                            onInput: function(e) { s.password = e.target.value },
                        }),
                        h('span', { class: 'tip' }, ''),
                    ]),
                    h('div', { class: 'row' }, [
                        h('button', { class: 'btn', onClick: state.saveSession },
                            state.sessionSaving.value ? '保存中...' : '保存'),
                    ]),
                    h('p', { class: 'tip' }, '切换Session模式会使在线的用户会话丢失，请在流量小的时候切换'),
                    h('div', { class: 'session-clear' }, [
                        h('p', { class: 'sc-title' }, '清理Session文件'),
                        h('table', { class: 'table' }, [
                            h('tbody', [
                                h('tr', [h('td', '总Session文件数量'), h('td', state.sessionFiles.total)]),
                                h('tr', [h('td', '可清理的Session文件数量'), h('td', state.sessionFiles.cleanable)]),
                            ]),
                        ]),
                        h('button', { class: 'btn', onClick: state.cleanSession }, '清理session文件'),
                    ]),
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
            onLoad(ctx, state) { return state.loadStatus() },
            render(h, state) {
                var rows = state.statusFields.map(function(f) {
                    var v = state.fpmStatus[f.key]
                    if (f.key === 'start time' && typeof v === 'number') {
                        var d = new Date(v * 1000)
                        var pad = function(n) { return (n < 10 ? '0' : '') + n }
                        v = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
                            + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
                    }
                    return h('tr', [
                        h('td', { class: 'tkey' }, f.label),
                        h('td', { class: 'tval' }, (v === undefined || v === null) ? '-' : String(v)),
                    ])
                })
                var content
                if (state.statusError.value) {
                    content = h('p', { class: 'tip' }, state.statusError.value)
                } else {
                    content = h('table', { class: 'table kv' },
                        h('tbody', rows))
                }
                return h('div', [
                    content,
                ])
            },
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

    style() {
        return [
            '.dl-link{color:#f56c6c;cursor:pointer;font-size:13px}',
            '.dl-link:hover{text-decoration:underline}',
            '.inst-link{color:#409eff;cursor:pointer;font-size:13px}',
            '.inst-link:hover{text-decoration:underline}',
            '.refresh-link{color:#409eff;cursor:pointer;font-size:13px}',
            '.refresh-link:hover{text-decoration:underline}',
            '.builtin-tag{color:#888;font-size:13px;cursor:default}',
            '.subtab{display:flex;border-bottom:1px solid #2a2a2a;margin-bottom:14px}',
            '.subtab-item{padding:8px 18px;color:#666;cursor:pointer;font-size:14px;border-bottom:2px solid transparent;margin-bottom:-1px}',
            '.subtab-item:hover{color:#aaa}',
            '.subtab-item.active{color:#fff;border-bottom-color:#409eff}',
        ].join(' ')
    }
}

Plugin(php74).show()