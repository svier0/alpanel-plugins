const nginx = {
  plugin_name: 'nginx',

  setup(ctx) {
    const { ref } = ctx
    const active = ref('service')
    const tabs = ['service', 'config', 'performance', 'load', 'errorlog']
    const tabLabel = {
      service: '服务',
      config: '配置文件',
      performance: '性能调整',
      load: '负载状态',
      errorlog: '错误日志',
    }
    return { active, tabs, tabLabel }
  },

  render(h, state) {
    const { active, tabLabel } = state
    const pages = {
      service: h('div', [
        h('p', ['当前状态：开启', h('span', { class: 'on' }, '\u25b6')]),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn danger' }, '停止'),
          h('button', { class: 'btn primary' }, '重启'),
          h('button', { class: 'btn' }, '重载配置'),
        ]),
      ]),
      config: h('div', [
        h('p', { class: 'tip' }, '提示：修改后请保存并重启服务生效'),
        h('textarea', { rows: 12, class: 'code' }),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary' }, '保存'),
        ]),
      ]),
      performance: h('div', [
        h('div', { class: 'form' }, [
          h('label', 'worker_processes'),
          h('input', { value: 'auto' }),
          h('span', { class: 'tip' }, '进程数量'),
        ]),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary' }, '保存'),
        ]),
      ]),
      load: h('table', { class: 'table' }, [
        h('thead', [
          h('tr', [h('th', '字段'), h('th', '值')]),
        ]),
        h('tbody', [
          h('tr', [h('td', '活动连接'), h('td', '1')]),
          h('tr', [h('td', '工作进程'), h('td', '2')]),
        ]),
      ]),
      errorlog: h('div', [
        h('textarea', { rows: 12, readonly: '', class: 'code' }),
      ]),
    }

    return h('div', { class: 'app' }, [
      h('nav', { class: 'side' },
        state.tabs.map(function(k) {
          return h('div', {
            class: ['item', active.value === k ? 'active' : ''],
            onClick: function() { active.value = k },
          }, tabLabel[k])
        })
      ),
      h('main', { class: 'content' }, pages[active.value]),
    ])
  },

  style() {
    return `
      .app{display:flex;height:100%;min-height:400px}
      .side{width:140px;background:#0f0f1a}
      .item{padding:10px 16px;color:#888;cursor:pointer;border-left:2px solid transparent}
      .item.active{color:#fff;border-left-color:#a78bfa}
      .content{flex:1;padding:20px;background:#f5f5fa}
      .row{display:flex;gap:10px;margin-top:10px}
      .btn{padding:5px 14px;border:0;border-radius:3px;cursor:pointer;background:#e0e0ea}
      .btn.primary{background:#7c3aed;color:#fff}
      .btn.danger{background:#ef4444;color:#fff}
      .on{color:#22c55e;font-weight:bold}
      .tip{color:#888;font-size:13px}
      .form{display:flex;align-items:center;gap:10px}
      .form label{font-family:monospace}
      .code{width:100%;font-family:monospace;font-size:13px;padding:10px;border:1px solid #d0d0dc;border-radius:3px;background:#fff;resize:vertical}
      .table{width:100%;border-collapse:collapse;background:#fff}
      .table th{background:#1a1a2e;color:#fff}
      .table th,.table td{padding:8px 14px;border-bottom:1px solid #e8e8f0;font-size:14px}
    `
  },
}
Plugin(nginx).show()
