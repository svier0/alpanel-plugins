# Alpanel 插件开发手册

本手册面向开发者与 AI Agent，说明 alpanel 面板插件的目录结构、文件格式、后端/前端约定与常见坑。写插件前通读一遍即可。

---

## 1. 仓库结构

```
alpanel-plugins/
├── index.json            # 插件市场索引（alp 52 获取）
└── plugins/
    └── <name>/           # 一个插件一个目录，目录名 = 插件名
        ├── info.json     # 插件元信息 + action 白名单（必需）
        ├── <name>.sh     # shell 后端逻辑（必需）
        ├── index.js      # 前端 UI（必需，见 §5 注）
        └── icon.png      # 插件图标（必需）
```

### 插件的唯一标识

- 目录名（`<name>`）就是插件名，也是后端所有路径/命令的组成部分。
- 插件名命名约束（后端强校验）：仅允许 `a-zA-Z0-9`、`.`、`_`、`-`。建议全小写字母。
- `info.json` 内的 `name` 字段必须等于目录名，否则该插件**不会出现在** `alp 51`（已安装列表）中。

---

## 2. 安装流程（重要，决定你文件必须齐）

`alp 53 <name>`（后端 `install` action 走同一条路）执行：

```sh
wget $GH_RAW/plugins/<name>/info.json
wget $GH_RAW/plugins/<name>/<name>.sh
wget $GH_RAW/plugins/<name>/icon.png
wget $GH_RAW/plugins/<name>/index.js
```

**只要任意一个文件下载失败，整个插件安装直接中止并删除目录。**

> 因此四个文件**缺一不可**：
> - 即使插件没有独立 UI（如 php74），也必须提供一个 `index.js`（可放最小骨架）。
> - 即使暂时没有图标，也必须有一个 `icon.png`。

下载成功后：`chmod +x <name>.sh` → `source <name>.sh` → 执行 `install` 函数。

安装目录固定为：`/www/server/panel/plugin/<name>/`

---

## 3. info.json

```json
{
  "title": "Nginx",
  "name": "nginx",
  "desc": "nginx",
  "versions": "1.0",
  "author": "alpanel",
  "home": "https://github.com/svier0/alpanel",
  "func": "get_version|get_nginx_status|get_nginx_value|set_nginx_value"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 是 | 展示名（市场/已安装列表显示） |
| `name` | 是 | 插件名，**必须等于目录名** |
| `desc` | 否 | 一句话描述 |
| `versions` | 否 | 版本号字符串 |
| `author` | 否 | 作者 |
| `home` | 否 | 项目主页 |
| `func` | 否 | 额外 action 白名单，`|` 分隔函数名（见 §7） |

### index.json（市场索引）

格式同上，只取展示字段（不含 `func` 也没关系，后端会忽略）。新增插件时在 `plugins/` 建目录 + 在 `index.json` 数组末尾追加一项。

---

## 4. 后端 <name>.sh

Alpine 环境，**POSIX sh / ash**，不是 bash。脚本内可定义以下函数：

### 固定 7 个 action（后端硬编码白名单）

| 函数 | 触发方式 | 约定 |
|------|----------|------|
| `install` | `alp 53 <name>` | 从零安装服务，全程 echo 中文进度 |
| `uninstall` | `alp 54 <name>` | 停服务、删开机自启、删文件 |
| `status` | `POST .../status` | 运行中：echo `running` 退出 0；停止：echo `stopped` 退出 1；未安装：echo `未安装` 退出 1 |
| `start` | `POST .../start` | 启动服务 |
| `stop` | `POST .../stop` | 停止服务 |
| `restart` | `POST .../restart` | 停止再启动 |
| `reload` | `POST .../reload` | 平滑重载配置 |

### 自定义 action

在 `info.json` 的 `func` 字段列出函数名（`|` 分隔），后端才能调用。未列入白名单的函数调用会直接返回 `不允许的方法`。

### 重要约定

- **脚本不得在顶层执行副作用代码**（只定义函数 + 变量）。因为后端执行方式是：
  ```sh
  sh -c ". '/www/server/panel/plugin/<name>/<name>.sh' && <method>"
  ```
  即每次调用都会先 `source` 整个脚本，顶层代码会被重复执行。
- 脚本开头建议 `#!/bin/sh` + `set -eu`（`-u` 在 source 时会立刻暴露未定义变量错误）。
- **输出约定**：所有 action 的响应都是
  ```json
  { "code": 0, "stdout": "...", "stderr": "..." }
  ```
  `code` = 进程退出码，`stdout`/`stderr` 为原始输出文本。
- 自定义函数若返回结构化数据，用 `echo '{"key":"value"}'` 输出 JSON 到 stdout，前端 `JSON.parse(r.stdout)`。
- 函数名只允许 `a-zA-Z0-9_`（后端校验），**不能含 `.`/`-`**。
- 服务控制一律走 `/etc/init.d/<svc>`（OpenRC start-stop-daemon），不要裸调二进制。

### 参考模板（nginx.sh 精华）

```sh
#!/bin/sh
set -eu

NGINX_BIN="/www/server/nginx/sbin/nginx"

install() {
    echo "正在安装..."
    # 下载/解包/写 conf / 写 /etc/init.d/<svc> / rc-update add <svc> default
}

uninstall() {
    /etc/init.d/nginx stop 2>/dev/null || true
    rc-update del nginx default 2>/dev/null || true
    rm -f /etc/init.d/nginx
    rm -rf /www/server/nginx
}

status() {
    [ -f "$NGINX_BIN" ] || { echo "未安装"; exit 1; }
    # 检测 pid，运行中 echo "running" return 0，否则 echo "stopped" return 1
}

get_version() {
    "$NGINX_BIN" -v 2>&1 | sed 's/.*nginx\/\([0-9.]*\).*/\1/'
}
```

---

## 5. 前端 index.js（Vue DSL）

文件经后端 `/iframe/<name>/index.js` 读取，前端 `new Function('Plugin', code)(Plugin)` 执行。

### 骨架

```js
const nginx = {
  plugin_name: 'nginx',        // 必填，用于 ctx.api 拼 action URL

  // 可选：弹窗尺寸。数字=px，字符串原样。默认 620px × 620px，居中显示
  width: 800,
  height: 700,

  // setup(ctx) 返回响应式 state，render(h, state) 里取用
  setup(ctx) {
    const { ref, reactive } = ctx
    const running = ref(false)

    async function check() {
      const r = await ctx.api('status')     // → POST /api/plugins/action/nginx/status
      running.value = r.code === 0
    }
    check()

    return { running, check }   // 返回的对象是 reactive，render 中取 .value
  },

  // 返回 VNode（h = Vue h 函数）
  render(h, state) {
    return h('div', { class: 'app' }, [
      h('p', '状态：' + (state.running.value ? '运行中' : '已停止')),
      h('button', { class: 'btn', onClick: () => state.check() }, '刷新'),
    ])
  },

  // 可选：CSS 字符串，自动加 .plugin-dlg 前缀做隔离
  style() {
    return '.app{...} .btn{...}'
  },
}

Plugin(nginx).show()
```

> **语言限制**：`new Function` 执行，无 `import`/`require`/模块系统，不能用外部库（Element Plus 组件需经 ctx 提供的组件）。纯函数式 JS 即可。

### ctx 上下文

| 属性 | 类型 | 说明 |
|------|------|------|
| `ctx.api(action, opts?)` | fn | `action` 不以 `/` 开头 → `POST /api/plugins/action/{name}/{action}`；以 `/` 开头 → 原路请求该路径（如 `'/api/files/read?path=...'`）。默认 POST，可用 `{ method: 'GET' }` 覆盖 |
| `ctx.ref` | fn | Vue 3 `ref` |
| `ctx.reactive` | fn | Vue 3 `reactive` |
| `ctx.computed` | fn | Vue 3 `computed` |
| `ctx.onMounted(fn)` | fn | 弹窗挂载后回调（注册一次） |
| `ctx.onUnmounted(fn)` | fn | 弹窗卸载回调（注册一次，用于清理定时器/监听） |
| `ctx.Editor` | 组件 | CodeMirror 6 编辑器，见 §6 |
| `ctx.plugin_name` | string | 当前插件名 |

### api() 返回结构

后端所有 action 统一返回 `{ code, stdout, stderr }`：
- 判断运行状态用 `r.code === 0`。
- 读版本/JSON 用 `r.stdout`。

### 常用技巧

- **Tab 切换懒加载**：每个 tab 一个 `xxxLoaded` ref，首次进入才 `loadXxx()`，配合旋转 loading 动画。
- **toast 提示**：自己用 `ref('')` + 固定定位的 div + `setTimeout` 清除即可（参考 nginx 插件）。
- **按钮 loading**：点击时把 action 名存入 ref，按钮 class 加 `loading`（CSS 置灰 + `pointer-events:none`）。
- **表单**：`pField(label, tip, obj, key)` 模式——`h('input', { value: obj[key], onInput: e => obj[key] = e.target.value })`，直接读写 reactive 属性（**不要**用 `ref.value` 包装嵌套对象）。

---

## 6. ctx.Editor（CodeMirror 6）

```js
h(state.Editor, {
  modelValue: state.configContent.value,            // 编辑内容
  'onUpdate:modelValue': v => state.configContent.value = v,  // 变更回调
  language: 'nginx',                                // 语法高亮
  readonly: false,                                  // 只读模式
})
```

- 支持语言：`'nginx'` / `'shell'` / `'json'`，其他值视为纯文本。
- 内置行号、暗色主题（one-dark）、Ctrl+S 等基础快捷键。
- 只读场景（看日志）设 `readonly: true` 即可。

---

## 7. 后端 action 白名单（安全边界）

后端 `POST /api/plugins/action/{name}/{method}` 逻辑：

1. 校验 `name`（`a-zA-Z0-9._-`）、`method`（`a-zA-Z0-9_`）。
2. 白名单 = 固定 7 个方法（`install|uninstall|start|stop|restart|reload|status`）+ 当前插件 `info.json` 里 `func` 字段列出的方法。
3. 不在白名单 → 返回 `不允许的方法: xxx`。
4. `install`/`uninstall` 走 `alp 53/54`；其余走 `source <name>.sh && <method>`。

> 想给自定义函数加白名单，改 `info.json` 的 `func` 即可，无需动后端。

---

## 8. 踩坑清单

- **四个文件必须齐全**（info.json / <name>.sh / icon.png / index.js），缺一个安装失败。
- **`info.json` 的 `name` ≠ 目录名** → 不出现在已安装列表。
- **`.sh` 顶层不要写副作用代码**——后端每次调用都先 `source` 它。
- **脚本用 POSIX sh**，别写 bash 特性（`[[ ]]`、数组、`local` 在 ash 中的兼容差异）。
- **函数名只能含字母数字下划线**，不要用 `get-xxx` 这种带横杠的名字。
- **自定义 action 必须加进 `func` 白名单**，否则 400。
- **前端 state 用 reactive 直接读写属性**，嵌套对象别套 ref。
- **弹窗 CSS 全部放 `style()` 里**，前端已自动加 `.plugin-dlg` 前缀隔离，不用自己拼前缀。
- **安装/重装后要刷新浏览器**（后端静态文件可能被缓存，`index.js` URL 带 `?_=${Date.now()}` 防缓存，但仍建议 Ctrl+Shift+R）。

---

## 9. 完整最小示例（hello 插件）

```
plugins/hello/
├── info.json     { "title": "Hello", "name": "hello", "desc": "demo", "func": "say_hello" }
├── hello.sh      见下
├── icon.png      （任意小图）
└── index.js      见下
```

`hello.sh`：

```sh
#!/bin/sh
set -eu

install()   { echo "hello 已安装" }
uninstall() { echo "hello 已卸载" }
status()    { echo "running"; exit 0 }

say_hello() {
    echo '{"msg":"Hello from alpanel!"}'
}
```

`index.js`：

```js
Plugin({
  plugin_name: 'hello',
  width: 480,
  setup(ctx) {
    const msg = ctx.ref('')
    async function greet() {
      const r = await ctx.api('say_hello')
      msg.value = JSON.parse(r.stdout).msg
    }
    return { msg, greet }
  },
  render(h, s) {
    return h('div', { class: 'app' }, [
      h('button', { class: 'btn', onClick: s.greet }, '打招呼'),
      h('p', s.msg.value),
    ])
  },
  style() {
    return '.app{display:flex;flex-direction:column;gap:10px;padding:10px}' +
           '.btn{padding:5px 14px;border:1px solid #555;background:#141414;color:#ccc;border-radius:3px;cursor:pointer}'
  },
}).show()
```

## 10. 参考实现

- `plugins/nginx/`：最完整的参考——五标签布局、CodeMirror 配置编辑、性能表单、JSON 状态表、懒加载 + loading + toast。
- `plugins/mysql/`、`plugins/redis/`：服务控制类插件。
