const nginx = {
  plugin_name: 'nginx',

  setup(ctx) {
    const { ref, reactive } = ctx
    const Editor = ctx.Editor

    const activeTab = ref('service')
    const tabs = ['service', 'config', 'performance', 'load', 'errorlog']

    const running = ref(false)
    const version = ref('')
    const actionLoading = ref('')

    const configContent = ref('')
    const configLoaded = ref(false)
    const configSaving = ref(false)

    const cfgEditorEl = ref(null)
    const logEditorEl = ref(null)
    var cfgEditor = null
    var logEditor = null

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
    const perfLoaded = ref(false)
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
    const loadLoaded = ref(false)

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
        var r = await ctx.api('/api/files/read?path=/www/server/nginx/conf/nginx.conf', { method: 'GET' })
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
          body: JSON.stringify({ path: '/www/server/nginx/conf/nginx.conf', content: configContent.value })
        })
        toast('已保存', 'ok')
      } catch (e) {
        toast('保存失败 ' + (e.message || ''), 'err')
      } finally {
        configSaving.value = false
      }
    }

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
      perfLoaded.value = true
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
        await ctx.api('/api/files/write', {
          method: 'POST',
          body: JSON.stringify({ path: '/tmp/nginx_perf.json', content: JSON.stringify(data) })
        })
        var r = await ctx.api('set_nginx_value')
        var d = (r && r.stdout) ? JSON.parse(r.stdout) : {}
        if (d.ok) {
          toast('已保存', 'ok')
          configLoaded.value = false
        } else {
          toast(d.error || '保存失败', 'err')
        }
      } catch (e) {
        toast('保存失败 ' + (e.message || ''), 'err')
      } finally {
        perfSaving.value = false
      }
    }

    async function loadLog() {
      try {
        var r = await ctx.api('/api/files/read?path=/www/wwwlogs/nginx_error.log', { method: 'GET' })
        logContent.value = (r && r.content) ? r.content : ''
      } catch (e) {
        logContent.value = ''
      }
      logLoaded.value = true
    }

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
      loadLoaded.value = true
    }

    var loading = ref(false)

    function switchTab(tab) {
      if (tab === activeTab.value) return
      activeTab.value = tab
      if (tab === 'config' && !configLoaded.value)      { loading.value = true; loadConfig().finally(function() { loading.value = false }) }
      if (tab === 'performance' && !perfLoaded.value)    { loading.value = true; loadPerf().finally(function() { loading.value = false }) }
      if (tab === 'errorlog' && !logLoaded.value)        { loading.value = true; loadLog().finally(function() { loading.value = false }) }
      if (tab === 'load' && !loadLoaded.value)           { loading.value = true; loadStatus().finally(function() { loading.value = false }) }
    }

    checkStatus()
    getVersion()

    return {
      activeTab, tabs, running, version, actionLoading,
      configContent, configLoaded, configSaving,
      perf, perfLoaded, perfSaving,
      loadInfo, loadLoaded,
      logContent, logLoaded,
      toastMsg, toastType, loading,
      checkStatus, control, loadConfig, saveConfig,
      loadPerf, savePerformance, loadLog, loadStatus, switchTab,
      Editor,
    }
  },

  render(h, state) {
    var active = state.activeTab.value
    var running = state.running
    var loading = state.loading

    var tabLabels = {
      service: '服务', config: '配置文件', performance: '性能调整',
      load: '负载状态', errorlog: '错误日志'
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
        h('p', { class: 'tip' }, '提示：修改后请保存并重启服务生效'),
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
    }

    function pagePerformance() {
      if (!state.perfLoaded.value) return spinner()
      return h('div', [
        h('p', { class: 'tip' }, '修改后请保存并重载Nginx生效'),
        pField('worker_processes', '进程数, auto 或数字', state.perf, 'worker_processes'),
        pField('worker_connections', '最大并发连接数', state.perf, 'worker_connections'),
        pField('keepalive_timeout', '连接超时(秒)', state.perf, 'keepalive_timeout'),
        h('div', { class: 'form' }, [
          h('label', 'gzip'),
          h('select', { class: 'slt', value: state.perf.gzip ? 'on' : 'off',
            onChange: function(e) { state.perf.gzip = e.target.value === 'on' } },
            [h('option', { value: 'on' }, '开启'), h('option', { value: 'off' }, '关闭')]),
          h('span', { class: 'tip' }, '是否启用压缩'),
        ]),
        pField('gzip_min_length', 'KB，最小压缩文件', state.perf, 'gzip_min_length'),
        pField('gzip_comp_level', '压缩等级 1-9', state.perf, 'gzip_comp_level'),
        pField('client_max_body_size', 'MB，最大上传(如50m)', state.perf, 'client_max_body_size'),
        pField('server_names_hash_bucket_size', 'hash表大小', state.perf, 'server_names_hash_bucket_size'),
        pField('client_header_buffer_size', 'KB，请求头buffer(如32k)', state.perf, 'client_header_buffer_size'),
        pField('client_body_buffer_size', 'KB，请求体buffer(如512k)', state.perf, 'client_body_buffer_size'),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn', onClick: state.savePerformance },
            state.perfSaving.value ? '保存中...' : '保存'),
        ]),
      ])
    }

    function pageLoad() {
      if (!state.loadLoaded.value) return spinner()
      return h('div', [
        h('table', { class: 'table' }, [
          h('thead', [h('tr', [h('th', '字段'), h('th', '当前值')])]),
          h('tbody', [
            h('tr', [h('td', '活动连接 Active'),          h('td', state.loadInfo.active_connections)]),
            h('tr', [h('td', '总连接次数 accepts'),       h('td', state.loadInfo.accepts)]),
            h('tr', [h('td', '总握手次数 handled'),       h('td', state.loadInfo.handled)]),
            h('tr', [h('td', '总请求数 requests'),         h('td', state.loadInfo.requests)]),
            h('tr', [h('td', '请求数 Reading'),            h('td', state.loadInfo.reading)]),
            h('tr', [h('td', '响应数 Writing'),            h('td', state.loadInfo.writing)]),
            h('tr', [h('td', '驻留进程 Waiting'),          h('td', state.loadInfo.waiting)]),
            h('tr', [h('td', '工作进程 Worker'),          h('td', state.loadInfo.worker_count)]),
            h('tr', [h('td', '占用 CPU'),                 h('td', state.loadInfo.worker_cpu)]),
            h('tr', [h('td', '占用内存'),                 h('td', state.loadInfo.worker_mem)]),
          ]),
        ]),
      ])
    }

    function pageErrorlog() {
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
      errorlog:    pageErrorlog(),
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
      '.form{display:flex;align-items:center;gap:10px;margin-bottom:12px}',
      '.form label{font-family:monospace;color:#aaa;font-size:13px;width:210px;flex-shrink:0}',
      '.form input{padding:5px 10px;border:1px solid #555;background:#1a1a1a;color:#ccc;border-radius:3px;font-size:13px;width:58px;outline:none}',
      '.form input:focus{border-color:#409eff}',
      '.slt{padding:5px 10px;border:1px solid #555;background:#1a1a1a;color:#ccc;border-radius:3px;font-size:13px;outline:none;cursor:pointer;width:80px}',
      '.slt:focus{border-color:#409eff}',
      '.code{width:100%;font-family:monospace;font-size:13px;padding:10px;border:1px solid #333;border-radius:3px;background:#1a1a1a;color:#ccc;resize:vertical;box-sizing:border-box;outline:none;line-height:1.5}',
      '.code:focus{border-color:#409eff}',
      '.plugin-editor{font-size:13px;min-height:200px}',
      '.plugin-editor .cm-editor{outline:none}',
      '.plugin-editor .cm-scroller{font-family:monospace;line-height:1.5}',
      '.table{width:100%;border-collapse:collapse;margin-top:4px}',
      '.table th{background:#202020;color:#ccc;font-weight:500}',
      '.table th,.table td{padding:8px 14px;border-bottom:1px solid #2a2a2a;font-size:14px}',
      '.table td{color:#aaa}',
      '.toast{position:fixed;top:12px;right:20px;padding:8px 18px;border-radius:4px;font-size:13px;z-index:9999;color:#fff;background:#333}',
      '.toast.ok{background:#16a34a}',
      '.toast.err{background:#dc2626}',
    ].join(' ')
  }
}

Plugin(nginx).show()
