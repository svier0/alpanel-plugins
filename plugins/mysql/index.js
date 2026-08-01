const mysql = {
  plugin_name: 'mysql',

  setup(ctx) {
    const { ref, reactive } = ctx
    const Editor = ctx.Editor

    const activeTab = ref('service')
    const tabs = ['service', 'config', 'performance', 'load', 'errorlog', 'slowlog', 'binlog', 'port']

    const running = ref(false)
    const version = ref('')
    const actionLoading = ref('')

    const configContent = ref('')
    const configLoaded = ref(false)
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
    const perfLoaded = ref(false)
    const perfSaving = ref(false)

    const errLogContent = ref('')
    const errLogLoaded = ref(false)

    const slowLogContent = ref('')
    const slowLogLoaded = ref(false)

    const statusInfo = reactive({
      start_time: '', connections: '', bytes_sent: '', bytes_recv: '',
      qps: '', tps: '', file: '', position: '',
      threads: '', threads_hit: '', key_hit: '', innodb_hit: '',
      qcache_hit: '', tmp_disk: '', open_tables: '',
      select_scan: '', full_join: '', sort_merge: '', lock_waited: '',
    })
    const statusLoaded = ref(false)

    const toastMsg = ref('')
    const toastType = ref('')

    function toast(msg, type) {
      toastMsg.value = msg
      toastType.value = type || ''
      setTimeout(function() { toastMsg.value = '' }, 3000)
    }

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
        var r = await ctx.api('/api/files/read?path=/www/server/mysql/conf/my.cnf', { method: 'GET' })
        configContent.value = (r && r.content) ? r.content : ''
      } catch (e) {
        configContent.value = ''
      }
      configLoaded.value = true
    }

    async function saveConfig() {
      configSaving.value = true
      try {
        await ctx.api('/api/files/write', {
          method: 'POST',
          body: JSON.stringify({ path: '/www/server/mysql/conf/my.cnf', content: configContent.value })
        })
        await ctx.api('reload')
        toast('已保存并重载', 'ok')
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
      perfLoaded.value = true
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
        await ctx.api('/api/files/write', {
          method: 'POST',
          body: JSON.stringify({ path: '/tmp/mysql_perf.json', content: JSON.stringify(data) })
        })
        var r = await ctx.api('set_mysql_value')
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
      statusLoaded.value = true
    }

    async function loadErrLog() {
      try {
        var r = await ctx.api('/api/files/read?path=/www/wwwlogs/mysql_error.log', { method: 'GET' })
        errLogContent.value = (r && r.content) ? r.content : ''
      } catch (e) {
        errLogContent.value = ''
      }
      errLogLoaded.value = true
    }

    async function loadSlowLog() {
      try {
        var r = await ctx.api('/api/files/read?path=/www/server/data/SVIER-slow.log', { method: 'GET' })
        slowLogContent.value = (r && r.content) ? r.content : ''
      } catch (e) {
        slowLogContent.value = ''
      }
      slowLogLoaded.value = true
    }

    var loading = ref(false)

    function switchTab(tab) {
      if (tab === activeTab.value) return
      activeTab.value = tab
      if (tab === 'config' && !configLoaded.value)     { loading.value = true; loadConfig().finally(function() { loading.value = false }) }
      if (tab === 'performance' && !perfLoaded.value)  { loading.value = true; loadPerf().finally(function() { loading.value = false }) }
      if (tab === 'errorlog' && !errLogLoaded.value)   { loading.value = true; loadErrLog().finally(function() { loading.value = false }) }
      if (tab === 'slowlog' && !slowLogLoaded.value)   { loading.value = true; loadSlowLog().finally(function() { loading.value = false }) }
      if (tab === 'load' && !statusLoaded.value)       { loading.value = true; loadStatus().finally(function() { loading.value = false }) }
    }

    checkStatus()
    getVersion()

    return {
      activeTab, tabs, running, version, actionLoading,
      configContent, configLoaded, configSaving,
      perf, perfLoaded, perfSaving,
      errLogContent, errLogLoaded,
      slowLogContent, slowLogLoaded,
      statusInfo, statusLoaded,
      toastMsg, toastType, loading,
      checkStatus, control, loadConfig, saveConfig,
      loadPerf, savePerformance,
      loadErrLog, loadSlowLog, loadStatus, switchTab,
      Editor,
    }
  },

  render(h, state) {
    var active = state.activeTab.value
    var running = state.running
    var loading = state.loading

    var tabLabels = {
      service: '服务', config: '配置文件', performance: '性能调整',
      load: '负载状态', errorlog: '错误日志', slowlog: '慢日志',
      binlog: '二进制日志', port: '端口配置'
    }

    function btn(text, action) {
      return h('button', {
        class: 'btn' + (state.actionLoading.value === action ? ' loading' : ''),
        onClick: function() { state.control(action) },
      }, state.actionLoading.value === action ? '...' : text)
    }

    function spinner() {
      return h('div', { class: 'spin-wrap' }, h('div', { class: 'spin' }))
    }

    function pField(label, tip, obj, key) {
      return h('div', { class: 'form' }, [
        h('label', label),
        h('input', { size: 8,
          value: obj[key] || '',
          onInput: function(e) { obj[key] = e.target.value },
        }),
        h('span', { class: 'tip' }, tip),
      ])
    }

    function placeholder() {
      return h('div', { class: 'ph' }, [
        h('p', { class: 'tip' }, '功能开发中，敬请期待'),
      ])
    }

    function pageService() {
      return h('div', [
        h('p', [
          '当前状态：' + (running.value ? '' : '未') + '运行',
          h('span', { class: running.value ? 'on' : 'off' }, running.value ? ' \u25b6' : ' \u23f8'),
        ]),
        h('div', { class: 'row' },
          running.value
            ? [btn('停止', 'stop'), btn('重启', 'restart'), btn('重载配置', 'reload')]
            : [btn('启动', 'start')]
        ),
      ])
    }

    function pageConfig() {
      if (!state.configLoaded.value) return spinner()
      return h('div', [
        h('p', { class: 'tip' }, '此处为MySQL主配置文件，修改请谨慎'),
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
    }

    function pagePerformance() {
      if (!state.perfLoaded.value) return spinner()
      return h('div', [
        h('p', { class: 'tip' }, '修改后请保存并重启数据库生效'),
        pField('table_open_cache', '128 表缓存', state.perf, 'table_open_cache'),
        pField('thread_cache_size', '16 线程池大小', state.perf, 'thread_cache_size'),
        pField('key_buffer_size', 'MB 索引缓冲区', state.perf, 'key_buffer_size'),
        pField('tmp_table_size', 'MB 临时表缓存', state.perf, 'tmp_table_size'),
        pField('innodb_buffer_pool_size', 'MB Innodb缓冲区', state.perf, 'innodb_buffer_pool_size'),
        pField('innodb_log_buffer_size', 'MB Innodb日志缓冲区', state.perf, 'innodb_log_buffer_size'),
        pField('max_connections', '最大连接数', state.perf, 'max_connections'),
        pField('sort_buffer_size', 'KB*连接 排序缓冲', state.perf, 'sort_buffer_size'),
        pField('read_buffer_size', 'KB*连接 读入缓冲', state.perf, 'read_buffer_size'),
        pField('read_rnd_buffer_size', 'KB*连接 随机读缓冲', state.perf, 'read_rnd_buffer_size'),
        pField('join_buffer_size', 'KB*连接 关联表缓存', state.perf, 'join_buffer_size'),
        pField('thread_stack', 'KB*连接 线程堆栈', state.perf, 'thread_stack'),
        pField('binlog_cache_size', 'KB*连接 二进制日志缓存(4096倍数)', state.perf, 'binlog_cache_size'),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn', onClick: state.savePerformance },
            state.perfSaving.value ? '保存中...' : '保存'),
        ]),
      ])
    }

    function pageLoad() {
      if (!state.statusLoaded.value) return spinner()
      var s = state.statusInfo
      return h('div', [
        h('table', { class: 'table' }, [
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
    }

    function pageErrLog() {
      if (!state.errLogLoaded.value) return spinner()
      return h('div', [
        h(state.Editor, { modelValue: state.errLogContent.value, readonly: true }),
      ])
    }

    function pageSlowLog() {
      if (!state.slowLogLoaded.value) return spinner()
      return h('div', [
        h(state.Editor, { modelValue: state.slowLogContent.value, readonly: true }),
      ])
    }

    var pages = {
      service:     pageService(),
      config:      pageConfig(),
      performance: pagePerformance(),
      load:        pageLoad(),
      errorlog:    pageErrLog(),
      slowlog:     pageSlowLog(),
      binlog:      placeholder(),
      port:        placeholder(),
    }

    return h('div', { class: 'app' }, [
      h('nav', { class: 'side' },
        state.tabs.map(function(k) {
          return h('div', { class: ['item', active === k ? 'active' : ''],
            onClick: function() { state.switchTab(k) } },
            tabLabels[k])
        })
      ),
      h('main', { class: 'content' }, [
        state.toastMsg.value ? h('div', { class: 'toast ' + state.toastType.value }, state.toastMsg.value) : null,
        pages[active],
      ]),
    ])
  },

  style() {
    return [
      '@keyframes spin{to{transform:rotate(360deg)}}',
      '.app{display:flex;height:100%}',
      '.side{width:100px;background:#202020}',
      '.item{padding:10px 16px;color:#666;cursor:pointer;border-left:2px solid transparent;font-size:13px}',
      '.item:hover{color:#aaa}',
      '.item.active{color:#fff;background:#141414;border-left-color:#444}',
      '.content{flex:1;padding:20px;background:#141414;color:#ccc;overflow:auto}',
      '.spin-wrap{display:flex;align-items:center;justify-content:center;height:100%;min-height:200px}',
      '.spin{width:28px;height:28px;border:2px solid #333;border-top-color:#666;border-radius:50%;animation:spin .6s linear infinite}',
      '.row{display:flex;gap:10px;margin-top:10px}',
      '.btn{padding:5px 14px;border:1px solid #555;background:#141414;color:#ccc;border-radius:3px;cursor:pointer;font-size:13px}',
      '.btn:hover{color:#fff;border-color:#888}',
      '.btn.loading{opacity:.6;pointer-events:none}',
      '.on{color:#4ade80;font-weight:bold}',
      '.off{color:red;font-weight:bold}',
      '.tip{color:#666;font-size:13px}',
      '.ph{padding:40px 0;text-align:center}',
      '.table{width:100%;border-collapse:collapse;margin-top:4px}',
      '.table + .table{margin-top:20px}',
      '.table th{background:#202020;color:#ccc;font-weight:500}',
      '.table th,.table td{padding:8px 14px;border-bottom:1px solid #2a2a2a;font-size:14px}',
      '.table td{color:#aaa}',
      '.table tr td:nth-child(2n){width:26%}',
      '.plugin-editor{font-size:13px;min-height:200px}',
      '.plugin-editor .cm-editor{outline:none}',
      '.plugin-editor .cm-scroller{font-family:monospace;line-height:1.5}',
      '.toast{position:fixed;top:12px;right:20px;padding:8px 18px;border-radius:4px;font-size:13px;z-index:9999;color:#fff;background:#333}',
      '.toast.ok{background:#16a34a}',
      '.toast.err{background:#dc2626}',
    ].join(' ')
  }
}

Plugin(mysql).show()
