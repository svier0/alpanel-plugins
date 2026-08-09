#!/bin/sh
set -eu

VER=82
PHP_DIR="/www/server/php/$VER"
BIN_DIR="$PHP_DIR/bin"
LIB_DIR="$PHP_DIR/lib"
CONF_DIR="$PHP_DIR/conf"
RUN_DIR="$PHP_DIR/var/run"
VARLOG_DIR="$PHP_DIR/var/log"
LOG_DIR="/www/wwwlogs"
PHP_BIN="$BIN_DIR/php$VER"
FPM_BIN="$BIN_DIR/php-fpm$VER"
FPM_CONF="$CONF_DIR/php-fpm.conf"
PIDFILE="$RUN_DIR/php-fpm.pid"

apply_rpath() {
    rpath="$1"; shift
    [ "$#" -gt 0 ] || return 0
    pt_dir=$(mktemp -d)
    ( cd "$pt_dir" && apk fetch --recursive patchelf >/dev/null 2>&1 ) || { rm -rf "$pt_dir"; return 1; }
    for apk_file in "$pt_dir"/*.apk; do
        [ -f "$apk_file" ] || continue
        tar -xzf "$apk_file" -C "$pt_dir"
    done
    pt_bin=$(find "$pt_dir" -type f -name patchelf 2>/dev/null | head -1)
    if [ -n "$pt_bin" ]; then
        chmod +x "$pt_bin"
        for bin in "$@"; do
            [ -f "$bin" ] && LD_LIBRARY_PATH="$pt_dir/usr/lib:$pt_dir/lib" "$pt_bin" --set-rpath "$rpath" "$bin" 2>/dev/null || true
        done
    fi
    rm -rf "$pt_dir"
    return 0
}

install() {
    echo "正在安装 PHP $VER..."

    command -v apk >/dev/null 2>&1 || { echo "错误: 仅支持 Alpine Linux" >&2; exit 1; }

    mkdir -p "$BIN_DIR" "$LIB_DIR" "$CONF_DIR" "$RUN_DIR" "$LOG_DIR"
    adduser -D -H -s /sbin/nologin www 2>/dev/null || true

    dl_dir=$(mktemp -d)
    ext_dir=$(mktemp -d)

    (
        cd "$dl_dir"
        apk fetch --recursive "php$VER" "php$VER-fpm" "php$VER-mysqli" "php$VER-pdo_mysql" \
            "php$VER-gd" "php$VER-curl" "php$VER-mbstring" "php$VER-opcache" "php$VER-zip"
    ) || {
        echo "错误: 未找到 php$VER 相关软件包" >&2
        rm -rf "$dl_dir" "$ext_dir"
        exit 1
    }

    for apk_file in "$dl_dir"/*.apk; do
        [ -f "$apk_file" ] || continue
        tar -xzf "$apk_file" -C "$ext_dir"
    done

    if [ -f "$ext_dir/usr/bin/php$VER" ]; then
        cp -r "$ext_dir/usr/bin/." "$BIN_DIR/" 2>/dev/null || true
        cp -r "$ext_dir/usr/sbin/." "$BIN_DIR/" 2>/dev/null || true
        chmod +x "$BIN_DIR/"* 2>/dev/null || true
        apply_rpath "$PHP_DIR/lib" "$PHP_BIN" "$FPM_BIN"
        ln -sf "$PHP_BIN" "/usr/bin/php$VER"
    else
        echo "错误: 未找到 php$VER 二进制" >&2
        rm -rf "$dl_dir" "$ext_dir"
        exit 1
    fi

    for d in "$ext_dir/lib" "$ext_dir/usr/lib"; do
        [ -d "$d" ] && cp -r "$d/." "$LIB_DIR/" 2>/dev/null || true
    done

    if [ -d "$ext_dir/usr/lib/php$VER" ]; then
        cp -r "$ext_dir/usr/lib/php$VER" "$LIB_DIR/" 2>/dev/null || true
    fi

    if [ -d "$ext_dir/etc/php$VER" ]; then
        cp -r "$ext_dir/etc/php$VER/." "$CONF_DIR/"
    fi

    if [ -f "$CONF_DIR/php.ini" ]; then
        echo "extension_dir = $LIB_DIR/php$VER/modules" >> "$CONF_DIR/php.ini"
    fi

    ghproxy_val=$(grep '^GHPROXY=' /www/server/panel/.env 2>/dev/null | cut -d= -f2-)
    GH_PROXY=""
    [ -n "$ghproxy_val" ] && [ "$ghproxy_val" != "false" ] && GH_PROXY="$ghproxy_val"
    PHP_RAW="${GH_PROXY}https://raw.githubusercontent.com/svier0/alpanel-plugins/master/plugins/php82"

    mkdir -p "$RUN_DIR" "$VARLOG_DIR"
    wget -q --timeout=10 "$PHP_RAW/conf/php-fpm.conf" -O "$FPM_CONF" \
        || { echo "错误: 下载 php-fpm.conf 失败" >&2; rm -rf "$dl_dir" "$ext_dir"; exit 1; }

    cat > "/etc/init.d/php$VER" << 'PHINIT'
#!/bin/sh

PHP_FPM_BIN="/www/server/php/__VER__/bin/php-fpm__VER__"
PHP_FPM_CONF="/www/server/php/__VER__/conf/php-fpm.conf"
PIDFILE="/www/server/php/__VER__/var/run/php-fpm.pid"

start() {
    mkdir -p /www/server/php/__VER__/var/run /www/server/php/__VER__/var/log
    export LD_LIBRARY_PATH=/www/server/php/__VER__/lib
    start-stop-daemon --start --background --make-pidfile \
        --pidfile "$PIDFILE" \
        --env LD_LIBRARY_PATH=/www/server/php/__VER__/lib \
        --exec "$PHP_FPM_BIN" -- --fpm-config "$PHP_FPM_CONF"
}

stop() {
    if [ -f "$PIDFILE" ]; then
        start-stop-daemon --stop --pidfile "$PIDFILE" --retry QUIT/5
        rm -f "$PIDFILE"
    fi
}

status() {
    if [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        if kill -0 "$PID" 2>/dev/null; then
            echo "php__VER__-fpm 运行中 (pid $PID)"
            return 0
        fi
    fi
    echo "php__VER__-fpm 未运行"
    return 1
}

if [ -z "${RC_SVCNAME:-}" ]; then
    case "${1:-}" in
        start)   start ;;
        stop)    stop ;;
        restart) stop; sleep 1; start ;;
        status)  status ;;
        *)       echo "用法: $0 {start|stop|restart|status}" >&2; exit 1 ;;
    esac
fi
PHINIT
    sed -i "s|__VER__|$VER|g" "/etc/init.d/php$VER"
    chmod +x "/etc/init.d/php$VER"

    rm -rf "$dl_dir" "$ext_dir"

    rc-update add "php$VER" default 2>/dev/null || true

    echo "PHP $VER 安装完成"
}

uninstall() {
    echo "正在卸载 PHP $VER..."

    /etc/init.d/php$VER stop 2>/dev/null || true
    rc-update del "php$VER" default 2>/dev/null || true

    rm -f "/etc/init.d/php$VER"
    rm -f "/usr/bin/php$VER"
    rm -rf "$PHP_DIR"

    echo "PHP $VER 已卸载"
}

get_version() {
    if [ ! -f "$PHP_BIN" ]; then
        echo "未安装"
        exit 1
    fi
    "$PHP_BIN" -v 2>&1 | sed -n 's/PHP \([0-9.]*\).*/\1/p' | head -1
}

status() {
    if [ ! -f "$FPM_BIN" ]; then
        echo "未安装"
        exit 1
    fi
    if [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        if kill -0 "$PID" 2>/dev/null; then
            echo "running"
            return 0
        fi
    fi
    echo "stopped"
    return 1
}

start() {
    if [ ! -f "$FPM_BIN" ]; then
        echo "PHP $VER 未安装" >&2
        exit 1
    fi
    if status >/dev/null 2>&1; then
        echo "PHP $VER 已在运行"
        return 0
    fi
    mkdir -p "$RUN_DIR"
    export LD_LIBRARY_PATH="$LIB_DIR"
    start-stop-daemon --start --background --make-pidfile \
        --pidfile "$PIDFILE" \
        --env LD_LIBRARY_PATH="$LIB_DIR" \
        --exec "$FPM_BIN" -- --fpm-config "$FPM_CONF"
    sleep 1
    if status >/dev/null 2>&1; then
        echo "PHP $VER 已启动"
    else
        echo "PHP $VER 启动失败" >&2
        exit 1
    fi
}

stop() {
    if [ -f "$PIDFILE" ]; then
        export LD_LIBRARY_PATH="$LIB_DIR"
        start-stop-daemon --stop --pidfile "$PIDFILE" --retry QUIT/5
        rm -f "$PIDFILE"
    fi
    echo "PHP $VER 已停止"
}

restart() {
    stop
    sleep 1
    start
}

reload() {
    if [ ! -f "$FPM_BIN" ]; then
        echo "PHP $VER 未安装" >&2
        exit 1
    fi
    if [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        if kill -0 "$PID" 2>/dev/null; then
            kill -USR2 "$PID" 2>/dev/null
            echo "PHP $VER 已重载"
            return 0
        fi
    fi
    echo "PHP $VER 未运行" >&2
    exit 1
}

INI_FILE="$CONF_DIR/php.ini"
FPM_D="$CONF_DIR/php-fpm.conf"

get_php_ini() {
    if [ ! -f "$CONF_DIR/php.ini" ]; then
        echo '{"error":"php.ini not found"}'
        exit 1
    fi
    echo "{\"content\": $(cat "$INI_FILE" | jq -Rs .)}"
}

save_php_ini() {
    if [ -z "${PLUGIN_ARGS:-}" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    content=$(echo "$PLUGIN_ARGS" | jq -r '.content // empty')
    if [ -z "$content" ]; then
        echo '{"error":"bad content"}'
        exit 1
    fi
    [ -f "$INI_FILE" ] && cp "$INI_FILE" "$INI_FILE.bak" || { echo '{"error":"ini missing"}'; exit 1; }
    printf '%s\n' "$content" > "$INI_FILE"
    echo '{"ok":true}'
}

get_fpm_conf() {
    if [ ! -f "$FPM_D" ]; then
        echo '{"error":"www.conf not found"}'
        exit 1
    fi
    echo "{\"content\": $(cat "$FPM_D" | jq -Rs .)}"
}

save_fpm_conf() {
    if [ -z "${PLUGIN_ARGS:-}" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    content=$(echo "$PLUGIN_ARGS" | jq -r '.content // empty')
    if [ -z "$content" ]; then
        echo '{"error":"bad content"}'
        exit 1
    fi
    [ -f "$FPM_D" ] && cp "$FPM_D" "$FPM_D.bak" || { echo '{"error":"conf missing"}'; exit 1; }
    printf '%s\n' "$content" > "$FPM_D"
    if "$FPM_BIN" -t --fpm-config "$FPM_CONF" >/dev/null 2>&1; then
        rm -f "$FPM_D.bak"
        reload >/dev/null 2>&1 || true
        echo '{"ok":true}'
    else
        cp "$FPM_D.bak" "$FPM_D"
        rm -f "$FPM_D.bak"
        echo '{"error":"fpm config test failed"}'
        exit 1
    fi
}

update_kv() {
    # update_kv <file> <key> <value>: 覆盖或追加 key = value
    file="$1" key="$2" val="$3"
    sed -i "s|^\([;#[:space:]]*${key}[[:space:]]*=\).*|\1 ${val}|I" "$file"
    if ! grep -qiE "^[[:space:]]*${key}[[:space:]]*=" "$file"; then
        echo "${key} = ${val}" >> "$file"
    fi
}

getv() {
    # 读取 file= 环境变量指定的 conf 中 key 的值(取首个非注释行, 去注释与首尾空格)
    grep -iE "^[[:space:]]*${key}[[:space:]]*=" "$file" 2>/dev/null \
        | head -1 \
        | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/[[:space:]]*[;#].*$//' \
        | cut -d= -f2- \
        | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

get_php_value() {
    [ -f "$INI_FILE" ] || { echo '{"error":"php.ini not found"}'; exit 1; }
    file="$INI_FILE"         # getv 通过环境变量读
    echo "{\"short_open_tag\":\"$(getv short_open_tag)\",\"max_execution_time\":\"$(getv max_execution_time)\",\"max_input_time\":\"$(getv max_input_time)\",\"memory_limit\":\"$(getv memory_limit)\",\"post_max_size\":\"$(getv post_max_size)\",\"file_uploads\":\"$(getv file_uploads)\",\"upload_max_filesize\":\"$(getv upload_max_filesize)\",\"max_file_uploads\":\"$(getv max_file_uploads)\",\"default_socket_timeout\":\"$(getv default_socket_timeout)\",\"error_reporting\":\"$(getv error_reporting)\",\"display_errors\":\"$(getv display_errors)\",\"cgi.fix_pathinfo\":\"$(getv cgi.fix_pathinfo)\",\"date.timezone\":\"$(getv date.timezone)\"}"
}

set_php_value() {
    if [ -z "${PLUGIN_ARGS:-}" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    [ -f "$INI_FILE" ] && cp "$INI_FILE" "$INI_FILE.bak" || { echo '{"error":"ini missing"}'; exit 1; }
    tmp=$(mktemp)
    echo "$PLUGIN_ARGS" > "$tmp"
    for key in short_open_tag max_execution_time max_input_time memory_limit post_max_size file_uploads upload_max_filesize max_file_uploads default_socket_timeout error_reporting display_errors cgi.fix_pathinfo date.timezone; do
        val=$(jq -r ".$key // empty" "$tmp" 2>/dev/null)
        [ -n "$val" ] && update_kv "$INI_FILE" "$key" "$val"
    done
    rm -f "$tmp" "$INI_FILE.bak"
    echo '{"ok":true}'
}

get_fpm_value() {
    [ -f "$FPM_D" ] || { echo '{"error":"www.conf not found"}'; exit 1; }
    file="$FPM_D"
    echo "{\"listen\":\"$(getv listen)\",\"allowed_clients\":\"$(getv listen.allowed_clients)\",\"pm\":\"$(getv pm)\",\"max_children\":\"$(getv pm.max_children)\",\"start_servers\":\"$(getv pm.start_servers)\",\"min_spare_servers\":\"$(getv pm.min_spare_servers)\",\"max_spare_servers\":\"$(getv pm.max_spare_servers)\"}"
}

set_fpm_value() {
    if [ -z "${PLUGIN_ARGS:-}" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    [ -f "$FPM_D" ] && cp "$FPM_D" "$FPM_D.bak" || { echo '{"error":"conf missing"}'; exit 1; }
    tmp=$(mktemp)
    echo "$PLUGIN_ARGS" > "$tmp"
    for key in listen allowed_clients pm max_children start_servers min_spare_servers max_spare_servers; do
        val=$(jq -r ".$key // empty" "$tmp" 2>/dev/null)
        [ -n "$val" ] && update_kv "$FPM_D" "$key" "$val"
    done
    rm -f "$tmp"
    if "$FPM_BIN" -t --fpm-config "$FPM_CONF" >/dev/null 2>&1; then
        rm -f "$FPM_D.bak"
        echo '{"ok":true}'
    else
        cp "$FPM_D.bak" "$FPM_D"
        rm -f "$FPM_D.bak"
        echo '{"error":"fpm config test failed"}'
        exit 1
    fi
}

get_fpm_status() {
    if [ ! -f "$FPM_BIN" ]; then
        echo '{"error":"PHP 未安装"}'
        exit 1
    fi
    file="$FPM_D" key="listen"
    sock=$(grep -iE "^[[:space:]]*${key}[[:space:]]*=" "$file" 2>/dev/null \
        | head -1 | cut -d= -f2- | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/[[:space:]]*[;#].*$//')
    [ -n "$sock" ] || sock="/tmp/php-cgi-$VER.sock"

    script=$(mktemp)
    cat > "$script" << 'PHPEOF'
<?php
$sock = getenv("FPM_SOCK") ?: "/tmp/php-cgi-82.sock";
$query = getenv("FPM_QS") ?: "json";
$fp = stream_socket_client("unix://" . $sock, $errno, $errstr, 3);
if (!$fp) { echo json_encode(["error" => "connect fail: $errstr"]); exit(1); }
function pnl($n){ if($n < 128) return chr($n); return chr(($n>>24)&255).chr(($n>>16)&255).chr(($n>>8)&255).chr($n&255); }
function wr($fp, $t, $id, $c){
  $len = strlen($c); $pad = (8 - ($len % 8)) % 8;
  $h = chr(1).chr($t).chr(($id>>8)&255).chr($id&255).chr(($len>>8)&255).chr($len&255).chr($pad).chr(0);
  fwrite($fp, $h.$c.str_repeat("\0", $pad));
}
wr($fp, 1, 1, "\0\x01\0\0\0\0\0\0");
$p = [
  "GATEWAY_INTERFACE" => "CGI/1.1",
  "REQUEST_METHOD"    => "GET",
  "REQUEST_URI"       => "/phpfpm_82_status",
  "SCRIPT_NAME"       => "/phpfpm_82_status",
  "SCRIPT_FILENAME"   => "/phpfpm_82_status",
  "QUERY_STRING"      => $query,
  "SERVER_SOFTWARE"   => "alp",
  "SERVER_PROTOCOL"   => "HTTP/1.1",
  "SERVER_NAME"       => "127.0.0.1",
  "SERVER_PORT"       => "80",
];
$c = "";
foreach ($p as $k => $v) { $c .= pnl(strlen($k)).pnl(strlen($v)).$k.$v; }
wr($fp, 4, 1, $c); wr($fp, 4, 1, ""); wr($fp, 5, 1, "");
stream_socket_shutdown($fp, STREAM_SHUT_WR);
stream_set_blocking($fp, false);
$out = "";
for ($i = 0; $i < 200; $i++) {
  $r = fread($fp, 4096);
  if ($r !== false && strlen($r) > 0) { $out .= $r; if (strpos($out, "\0") !== false) break; }
  usleep(20000);
}
$pos = strpos($out, "\r\n\r\n");
if ($pos !== false) $out = substr($out, $pos + 4);
$end = strpos($out, "\0");
if ($end !== false) $out = substr($out, 0, $end);
echo $out;
PHPEOF

    FPM_SOCK="$sock" FPM_QS="json" "$PHP_BIN" "$script" 2>/dev/null
    code=$?
    rm -f "$script"
    [ "$code" -eq 0 ] || { echo '{"error":"获取 PHP 状态失败"}'; exit 1; }
}