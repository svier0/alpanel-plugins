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

    const errLogContent = ref('')
    const errLogLoaded = ref(false)

    const slowLogContent = ref('')
    const slowLogLoaded = ref(false)

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
      if (tab === 'errorlog' && !errLogLoaded.value)   { loading.value = true; loadErrLog().finally(function() { loading.value = false }) }
      if (tab === 'slowlog' && !slowLogLoaded.value)   { loading.value = true; loadSlowLog().finally(function() { loading.value = false }) }
    }

    checkStatus()
    getVersion()

    return {
      activeTab, tabs, running, version, actionLoading,
      configContent, configLoaded, configSaving,
      errLogContent, errLogLoaded,
      slowLogContent, slowLogLoaded,
      toastMsg, toastType, loading,
      checkStatus, control, loadConfig, saveConfig,
      loadErrLog, loadSlowLog, switchTab,
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
        }),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn', onClick: state.saveConfig },
            state.configSaving.value ? '保存中...' : '保存'),
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
      performance: placeholder(),
      load:        placeholder(),
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
