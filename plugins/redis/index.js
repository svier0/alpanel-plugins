const redis = {
  plugin_name: 'redis',
  width: "600",

  setup(ctx) {
    const { ref, reactive } = ctx
    const Editor = ctx.Editor

    const activeTab = ref('service')
    const tabs = ['service', 'config', 'performance', 'load', 'log']

    const running = ref(false)
    const version = ref('')
    const actionLoading = ref('')

    const configContent = ref('')
    const configLoaded = ref(false)
    const configSaving = ref(false)

    const perf = reactive({
      bind: '',
      port: '',
      timeout: '',
      maxclients: '',
      databases: '',
      requirepass: '',
      maxmemory: '',
    })
    const perfLoaded = ref(false)
    const perfSaving = ref(false)

    const statusInfo = reactive({
      uptime_in_days: '',
      tcp_port: '',
      connected_clients: '',
      used_memory_rss: '',
      used_memory: '',
      mem_fragmentation_ratio: '',
      total_connections_received: '',
      total_commands_processed: '',
      instantaneous_ops_per_sec: '',
      keyspace_hits: '',
      keyspace_misses: '',
      hit: '',
      latest_fork_usec: '',
    })
    const statusLoaded = ref(false)

    const logContent = ref('')
    const logLoaded = ref(false)

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
        var r = await ctx.api('/api/files/read?path=/www/server/redis/conf/redis.conf', { method: 'GET' })
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
          body: JSON.stringify({ path: '/www/server/redis/conf/redis.conf', content: configContent.value })
        })
        await ctx.api('restart')
        toast('已保存，Redis已重启', 'ok')
      } catch (e) {
        toast('保存失败 ' + (e.message || ''), 'err')
      } finally {
        configSaving.value = false
      }
    }

    async function loadPerf() {
      try {
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
      } catch (e) {}
      perfLoaded.value = true
    }

    async function savePerformance() {
      perfSaving.value = true
      try {
        var data = {
          bind: perf.bind,
          port: perf.port,
          timeout: perf.timeout,
          maxclients: perf.maxclients,
          databases: perf.databases,
          requirepass: perf.requirepass,
          maxmemory: perf.maxmemory,
        }
        var r = await ctx.api('set_redis_value', { body: JSON.stringify(data) })
        var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
        if (d.ok) {
          toast('已保存，Redis已重启', 'ok')
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
      } catch (e) {}
      statusLoaded.value = true
    }

    async function loadLog() {
      try {
        var r = await ctx.api('/api/files/read?path=/www/wwwlogs/redis.log', { method: 'GET' })
        logContent.value = (r && r.content) ? r.content : ''
      } catch (e) {
        logContent.value = ''
      }
      logLoaded.value = true
    }

    var loading = ref(false)

    function switchTab(tab) {
      if (tab === activeTab.value) return
      activeTab.value = tab
      loading.value = true
      if (tab === 'config')       { loadConfig().finally(function() { loading.value = false }) }
      else if (tab === 'performance') { loadPerf().finally(function() { loading.value = false }) }
      else if (tab === 'load')        { loadStatus().finally(function() { loading.value = false }) }
      else if (tab === 'log')         { loadLog().finally(function() { loading.value = false }) }
      else loading.value = false
    }

    checkStatus()
    getVersion()

    return {
      activeTab, tabs, running, version, actionLoading,
      configContent, configLoaded, configSaving,
      perf, perfLoaded, perfSaving,
      statusInfo, statusLoaded,
      logContent, logLoaded,
      toastMsg, toastType, loading,
      checkStatus, control, loadConfig, saveConfig,
      loadPerf, savePerformance, loadStatus, loadLog, switchTab,
      Editor,
    }
  },

  render(h, state) {
    var active = state.activeTab.value
    var running = state.running
    var loading = state.loading

    var tabLabels = {
      service: '服务', config: '配置文件', performance: '性能调整',
      load: '负载状态', log: '日志'
    }

    function btn(text, action) {
      return h('button', {
        class: 'btn' + (state.actionLoading.value === action ? ' loading' : ''),
        onClick: function() { state.control(action) },
      }, state.actionLoading.value === action ? '...' : text)
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

    function spinner() {
      return h('div', { class: 'spin-wrap' }, h('div', { class: 'spin' }))
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
    }

    function pagePerformance() {
      if (!state.perfLoaded.value) return spinner()
      return h('div', [
        h('p', { class: 'tip' }, '修改后请保存并重启服务生效'),
        pField('bind', '绑定IP(修改绑定IP可能会存在安全隐患)', state.perf, 'bind'),
        pField('port', '绑定端口', state.perf, 'port'),
        pField('timeout', '空闲连接超时时间,0表示不断开', state.perf, 'timeout'),
        pField('maxclients', '最大连接数', state.perf, 'maxclients'),
        pField('databases', '数据库数量', state.perf, 'databases'),
        pField('requirepass', 'redis密码,留空代表没有设置密码', state.perf, 'requirepass'),
        pField('maxmemory', 'MB,最大使用内存，0表示不限制', state.perf, 'maxmemory'),
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
          h('thead', [h('tr', [h('th', '字段'), h('th', '当前值'), h('th', '说明')])]),
          h('tbody', [
            h('tr', [h('td', 'uptime_in_days'), h('td', s.uptime_in_days), h('td', '已运行天数')]),
            h('tr', [h('td', 'tcp_port'), h('td', s.tcp_port), h('td', '当前监听端口')]),
            h('tr', [h('td', 'connected_clients'), h('td', s.connected_clients), h('td', '连接的客户端数量')]),
            h('tr', [h('td', 'used_memory_rss'), h('td', s.used_memory_rss), h('td', 'Redis当前占用的系统内存总量')]),
            h('tr', [h('td', 'used_memory'), h('td', s.used_memory), h('td', 'Redis历史分配内存的峰值')]),
            h('tr', [h('td', 'mem_fragmentation_ratio'), h('td', s.mem_fragmentation_ratio), h('td', '内存碎片比率')]),
            h('tr', [h('td', 'total_connections_received'), h('td', s.total_connections_received), h('td', '运行以来连接过的客户端的总数量')]),
            h('tr', [h('td', 'total_commands_processed'), h('td', s.total_commands_processed), h('td', '运行以来执行过的命令的总数量')]),
            h('tr', [h('td', 'instantaneous_ops_per_sec'), h('td', s.instantaneous_ops_per_sec), h('td', '服务器每秒钟执行的命令数量')]),
            h('tr', [h('td', 'keyspace_hits'), h('td', s.keyspace_hits), h('td', '查找数据库键成功的次数')]),
            h('tr', [h('td', 'keyspace_misses'), h('td', s.keyspace_misses), h('td', '查找数据库键失败的次数')]),
            h('tr', [h('td', 'hit'), h('td', s.hit), h('td', '查找数据库键命中率')]),
            h('tr', [h('td', 'latest_fork_usec'), h('td', s.latest_fork_usec), h('td', '最近一次 fork() 操作耗费的微秒数')]),
          ]),
        ]),
      ])
    }

    function pageLog() {
      if (!state.logLoaded.value) return spinner()
      return h('div', [
        h(state.Editor, { modelValue: state.logContent.value, readonly: true }),
      ])
    }

    var pages = {
      service:     pageService(),
      config:      pageConfig(),
      performance: pagePerformance(),
      load:        pageLoad(),
      log:         pageLog(),
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
      '.form{display:flex;align-items:center;gap:10px;margin-bottom:12px}',
      '.form label{font-family:monospace;color:#aaa;font-size:13px;width:210px;flex-shrink:0}',
      '.form input{padding:5px 10px;border:1px solid #555;background:#1a1a1a;color:#ccc;border-radius:3px;font-size:13px;width:58px;outline:none}',
      '.form input:focus{border-color:#409eff}',
      '.slt{padding:5px 10px;border:1px solid #555;background:#1a1a1a;color:#ccc;border-radius:3px;font-size:13px;outline:none;cursor:pointer;width:80px}',
      '.slt:focus{border-color:#409eff}',
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
      '.plugin-editor{font-size:13px;min-height:200px}',
      '.plugin-editor .cm-editor{outline:none}',
      '.plugin-editor .cm-scroller{font-family:monospace;line-height:1.5}',
      '.toast{position:fixed;top:12px;right:20px;padding:8px 18px;border-radius:4px;font-size:13px;z-index:9999;color:#fff;background:#333}',
      '.toast.ok{background:#16a34a}',
      '.toast.err{background:#dc2626}',
    ].join(' ')
  }
}

Plugin(redis).show()