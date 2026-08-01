const nginx = {
  plugin_name: 'nginx',
  width: 800,

  setup(ctx) {
    const { ref, reactive } = ctx

    const active = ref('service')
    const tabs = ['service', 'config', 'performance', 'load', 'errorlog']

    const running = ref(false)
    const version = ref('')
    const actionLoading = ref('')

    const configContent = ref('')
    const configLoaded = ref(false)
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
    const perfLoaded = ref(false)
    const perfSaving = ref(false)

    const loadInfo = reactive({
      active_connections: '-',
      accepts: '-',
      handled: '-',
      requests: '-',
      reading: '-',
      writing: '-',
      waiting: '-',
      worker_count: '-',
      worker_cpu: '-',
      worker_mem: '-',
    })

    const logContent = ref('')
    const logLoaded = ref(false)

    var toastMsg = ref('')
    var toastType = ref('')

    function toast(msg, type) {
      toastMsg.value = msg
      toastType.value = type || ''
      setTimeout(function() { toastMsg.value = '' }, 3000)
    }

    async function checkStatus() {
      try {
        const r = await ctx.api('status')
        running.value = r.code === 0
      } catch {
        running.value = false
      }
    }

    async function getVersion() {
      try {
        const r = await ctx.api('get_version')
        version.value = r && r.stdout ? r.stdout.trim() : ''
      } catch { version.value = '' }
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

    function parsePerf(content) {
      var getVal = function(pattern, def) {
        var m = content.match(pattern)
        return m && m[1] ? m[1].trim() : def || ''
      }
      perf.worker_processes = getVal(/worker_processes\s+(\S+);/i, 'auto')
      perf.worker_connections = getVal(/worker_connections\s+(\S+);/i, '1024')
      perf.keepalive_timeout = getVal(/keepalive_timeout\s+(\S+);/i, '65')
      perf.gzip = getVal(/gzip\s+(\S+);/i, 'off') === 'on'
      perf.gzip_min_length = getVal(/gzip_min_length\s+(\S+);/i, '1024')
      perf.gzip_comp_level = getVal(/gzip_comp_level\s+(\S+);/i, '6')
      perf.client_max_body_size = getVal(/client_max_body_size\s+(\S+);/i, '1m')
      perf.server_names_hash_bucket_size = getVal(/server_names_hash_bucket_size\s+(\S+);/i, '64')
      perf.client_header_buffer_size = getVal(/client_header_buffer_size\s+(\S+);/i, '4k')
      perf.client_body_buffer_size = getVal(/client_body_buffer_size\s+(\S+);/i, '8k')
      perfLoaded.value = true
    }

    async function loadConfig() {
      try {
        var r = await ctx.api('/api/files/read?path=/www/server/nginx/conf/nginx.conf', { method: 'GET' })
        configContent.value = r && r.content ? r.content : ''
        configLoaded.value = true
        if (!perfLoaded.value) parsePerf(configContent.value)
      } catch {
        configContent.value = ''
        configLoaded.value = true
      }
    }

    async function saveConfig() {
      configSaving.value = true
      try {
        await ctx.api('/api/files/write', {
          method: 'POST',
          body: JSON.stringify({ path: '/www/server/nginx/conf/nginx.conf', content: configContent.value })
        })
        parsePerf(configContent.value)
        toast('已保存', 'ok')
      } catch (e) {
        toast('保存失败 ' + (e.message || ''), 'err')
      } finally {
        configSaving.value = false
      }
    }

    function setConfVal(content, pattern, newVal) {
      return content.replace(new RegExp(pattern.source, 'gi'), function(match) {
        return match.replace(/\s\S+;?$/, ' ' + newVal + ';')
      })
    }

    async function savePerformance() {
      perfSaving.value = true
      try {
        var c = configContent.value
        c = setConfVal(c, /worker_processes\s+\S+;/, perf.worker_processes)
        c = setConfVal(c, /worker_connections\s+\S+;/, perf.worker_connections)
        c = setConfVal(c, /keepalive_timeout\s+\S+;/, perf.keepalive_timeout)
        c = setConfVal(c, /gzip\s+\S+;/, perf.gzip ? 'on' : 'off')
        c = setConfVal(c, /gzip_min_length\s+\S+;/, perf.gzip_min_length)
        c = setConfVal(c, /gzip_comp_level\s+\S+;/, perf.gzip_comp_level)
        c = setConfVal(c, /client_max_body_size\s+\S+;/, perf.client_max_body_size)
        c = setConfVal(c, /server_names_hash_bucket_size\s+\S+;/, perf.server_names_hash_bucket_size)
        c = setConfVal(c, /client_header_buffer_size\s+\S+;/, perf.client_header_buffer_size)
        c = setConfVal(c, /client_body_buffer_size\s+\S+;/, perf.client_body_buffer_size)
        await ctx.api('/api/files/write', {
          method: 'POST',
          body: JSON.stringify({ path: '/www/server/nginx/conf/nginx.conf', content: c })
        })
        configContent.value = c
        toast('已保存', 'ok')
      } catch (e) {
        toast('保存失败 ' + (e.message || ''), 'err')
      } finally {
        perfSaving.value = false
      }
    }

    async function loadLog() {
      try {
        var r = await ctx.api('/api/files/read?path=/www/wwwlogs/nginx_error.log', { method: 'GET' })
        logContent.value = r && r.content ? r.content : ''
        logLoaded.value = true
      } catch {
        logContent.value = ''
        logLoaded.value = true
      }
    }

    async function loadStatusDetail() {
      try {
        var r = await ctx.api('/api/files/read?path=/www/server/nginx/run/nginx.pid', { method: 'GET' })
        var pid = r && r.content ? r.content.trim() : ''
        if (pid) {
          try {
            var sr = await ctx.api('/api/files/read?path=/proc/' + pid + '/status', { method: 'GET' })
            if (sr && sr.content) {
              var threads = sr.content.match(/Threads:\s*(\d+)/)
              if (threads) loadInfo.worker_count = threads[1]
              var vmrss = sr.content.match(/VmRSS:\s*(\d+)\s*kB/)
              if (vmrss) loadInfo.worker_mem = Math.round(vmrss[1] / 1024) + 'MB'
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    function onTabChange(tab) {
      active.value = tab
      if (tab === 'config' && !configLoaded.value) loadConfig()
      if (tab === 'performance') { if (!configLoaded.value) loadConfig() }
      if (tab === 'errorlog' && !logLoaded.value) loadLog()
      if (tab === 'load') loadStatusDetail()
    }

    checkStatus()
    getVersion()

    return {
      active, tabs, running, version, actionLoading,
      configContent, configLoaded, configSaving,
      perf, perfLoaded, perfSaving,
      loadInfo,
      logContent, logLoaded,
      toastMsg, toastType,
      checkStatus, control, loadConfig, saveConfig,
      savePerformance, loadLog, onTabChange,
    }
  },

  render(h, state) {
    var _a = state.active, _t = state.tabs
    var running = state.running, loading = state.actionLoading

    var tabLabels = {
      service: '服务', config: '配置文件', performance: '性能调整',
      load: '负载状态', errorlog: '错误日志'
    }

    function btn(text, action, type) {
      type = type || ''
      return h('button', {
        class: 'btn ' + type + (loading.value === action ? ' loading' : ''),
        onClick: function() { state.control(action) },
      }, loading.value === action ? '...' : text)
    }

    function pField(label, desc, valRef) {
      return h('div', { class: 'form' }, [
        h('label', label),
        h('input', {
          value: valRef.value,
          onInput: function(e) { valRef.value = e.target.value },
        }),
        h('span', { class: 'tip' }, desc),
      ])
    }

    function pFieldSw(label, desc, valRef) {
      return h('div', { class: 'form' }, [
        h('label', label),
        h('select', {
          class: 'slt',
          value: valRef.value ? 'on' : 'off',
          onChange: function(e) { valRef.value = e.target.value === 'on' },
        }, [
          h('option', { value: 'on' }, '开启'),
          h('option', { value: 'off' }, '关闭'),
        ]),
        h('span', { class: 'tip' }, desc),
      ])
    }

    var pages = {
      service: h('div', [
        h('p', ['当前状态：' + (running.value ? '' : '未') + '运行', h('span', { class: running.value ? 'on' : 'off' }, running.value ? ' \u25b6' : ' \u23f8')]),
        h('div', { class: 'row' },
          running.value
            ? [btn('停止', 'stop', 'danger'), btn('重启', 'restart'), btn('重载配置', 'reload')]
            : [btn('启动', 'start', 'primary')]
        ),
      ]),

      config: h('div', [
        h('p', { class: 'tip' }, '提示：修改后请保存并重启服务生效'),
        h('textarea', {
          rows: 18, class: 'code',
          value: state.configContent.value,
          onInput: function(e) { state.configContent.value = e.target.value },
        }),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', onClick: state.saveConfig },
            state.configSaving.value ? '保存中...' : '保存'),
        ]),
      ]),

      performance: h('div', [
        h('p', { class: 'tip' }, '提示：修改后请保存并重载Nginx生效'),
        pField('worker_processes', '进程数,auto或数字', state.perf.worker_processes),
        pField('worker_connections', '最大并发连接数', state.perf.worker_connections),
        pField('keepalive_timeout', '连接超时(秒)', state.perf.keepalive_timeout),
        pFieldSw('gzip', '是否启用压缩', state.perf.gzip),
        pField('gzip_min_length', '最小压缩(KB)', state.perf.gzip_min_length),
        pField('gzip_comp_level', '压缩等级1-9', state.perf.gzip_comp_level),
        pField('client_max_body_size', '最大上传(如50m)', state.perf.client_max_body_size),
        pField('server_names_hash_bucket_size', 'hash表大小', state.perf.server_names_hash_bucket_size),
        pField('client_header_buffer_size', '请求头buffer(如32k)', state.perf.client_header_buffer_size),
        pField('client_body_buffer_size', '请求体buffer(如512k)', state.perf.client_body_buffer_size),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', onClick: state.savePerformance },
            state.perfSaving.value ? '保存中...' : '保存'),
        ]),
      ]),

      load: h('div', [
        h('table', { class: 'table' }, [
          h('thead', [h('tr', [h('th', '字段'), h('th', '当前值')])]),
          h('tbody', [
            h('tr', [h('td', '活动连接 Active'), h('td', state.loadInfo.active_connections)]),
            h('tr', [h('td', '总连接次数 accepts'), h('td', state.loadInfo.accepts)]),
            h('tr', [h('td', '总握手次数 handled'), h('td', state.loadInfo.handled)]),
            h('tr', [h('td', '总请求数 requests'), h('td', state.loadInfo.requests)]),
            h('tr', [h('td', '请求数 Reading'), h('td', state.loadInfo.reading)]),
            h('tr', [h('td', '响应数 Writing'), h('td', state.loadInfo.writing)]),
            h('tr', [h('td', '驻留进程 Waiting'), h('td', state.loadInfo.waiting)]),
            h('tr', [h('td', '工作进程 Worker'), h('td', state.loadInfo.worker_count)]),
            h('tr', [h('td', '占用CPU'), h('td', state.loadInfo.worker_cpu)]),
            h('tr', [h('td', '占用内存'), h('td', state.loadInfo.worker_mem)]),
          ]),
        ]),
      ]),

      errorlog: h('div', [
        h('textarea', { rows: 20, readonly: '', class: 'code', value: state.logContent.value }),
      ]),
    }

    return h('div', { class: 'app' }, [
      h('nav', { class: 'side' },
        _t.map(function(k) {
          return h('div', {
            class: ['item', _a.value === k ? 'active' : ''],
            onClick: function() { state.onTabChange(k) },
          }, tabLabels[k])
        })
      ),
      h('main', { class: 'content' }, [
        state.toastMsg.value ? h('div', { class: 'toast ' + state.toastType.value }, state.toastMsg.value) : null,
        pages[_a.value],
      ]),
    ])
  },

  style() {
    return [
      '.app{display:flex;height:100%}',
      '.side{width:100px;background:#202020}',
      '.item{padding:10px 16px;color:#666;cursor:pointer;border-left:2px solid transparent}',
      '.item.active{color:#fff;background:#141414;border-left-color:#444}',
      '.content{flex:1;padding:20px;background:#141414}',
      '.row{display:flex;gap:10px;margin-top:10px}',
      '.btn{padding:5px 14px;border:1px solid #555;background:#141414;color:#ccc;border-radius:3px;cursor:pointer;font-size:13px}',
      '.btn.primary{background:#7c3aed;color:#fff;border-color:#7c3aed}',
      '.btn.danger{background:#ef4444;color:#fff;border-color:#ef4444}',
      '.btn.loading{opacity:.6;pointer-events:none}',
      '.on{color:#4ade80;font-weight:bold}',
      '.off{color:red;font-weight:bold}',
      '.tip{color:#666;font-size:13px}',
      '.form{display:flex;align-items:center;gap:10px;margin-bottom:12px}',
      '.form label{font-family:monospace;color:#aaa;width:210px;flex-shrink:0}',
      '.form input{padding:5px 10px;border:1px solid #555;background:#1a1a1a;color:#ccc;border-radius:3px;font-size:13px;width:180px;outline:none}',
      '.form input:focus{border-color:#7c3aed}',
      '.slt{padding:5px 10px;border:1px solid #555;background:#1a1a1a;color:#ccc;border-radius:3px;font-size:13px;outline:none}',
      '.slt:focus{border-color:#7c3aed}',
      '.code{width:100%;font-family:monospace;font-size:13px;padding:10px;border:1px solid #333;border-radius:3px;background:#1a1a1a;color:#ccc;resize:vertical;box-sizing:border-box;outline:none;line-height:1.5}',
      '.code:focus{border-color:#7c3aed}',
      '.table{width:100%;border-collapse:collapse}',
      '.table th{background:#202020;color:#ccc;font-weight:500}',
      '.table th,.table td{padding:8px 14px;border-bottom:1px solid #2a2a2a;font-size:14px}',
      '.table td{color:#aaa}',
      '.toast{position:fixed;top:12px;right:20px;padding:8px 18px;border-radius:4px;font-size:13px;z-index:9999;color:#fff;background:#333}',
      '.toast.ok{background:#22c55e}',
      '.toast.err{background:#ef4444}',
    ].join(' ')
  }
}

Plugin(nginx).show()
