#!/bin/sh
set -eu

NGINX_BIN="/www/server/nginx/sbin/nginx"
NGINX_CONF="/www/server/nginx/conf/nginx.conf"
PIDFILE="/www/server/nginx/run/nginx.pid"
ERRLOG="/www/wwwlogs/nginx_error.log"

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
    echo "正在安装 Nginx..."

    command -v apk >/dev/null 2>&1 || { echo "错误: 仅支持 Alpine Linux" >&2; exit 1; }

    nginx_dir="/www/server/nginx"
    conf_dir="$nginx_dir/conf"
    run_dir="$nginx_dir/run"
    tmp_dir="$nginx_dir/tmp"
    proxy_temp_dir="$nginx_dir/proxy_temp_dir"
    proxy_cache_dir="$nginx_dir/proxy_cache_dir"
    log_dir="/www/wwwlogs"
    vhost_dir="/www/server/panel/vhost/nginx"

    ghproxy_val=$(grep '^GHPROXY=' /www/server/panel/.env 2>/dev/null | cut -d= -f2-)
    GH_PROXY=""
    [ -n "$ghproxy_val" ] && [ "$ghproxy_val" != "false" ] && GH_PROXY="$ghproxy_val"
    NGINX_RAW="${GH_PROXY}https://raw.githubusercontent.com/svier0/alpanel-plugins/master/plugins/nginx"

    mkdir -p "$nginx_dir" "$conf_dir" "$run_dir" "$tmp_dir" "$proxy_temp_dir" "$proxy_cache_dir" "$vhost_dir" "$log_dir"

    dl_dir=$(mktemp -d)
    ext_dir=$(mktemp -d)

    (
        cd "$dl_dir"
        apk fetch --recursive nginx
    )

    for apk_file in "$dl_dir"/*.apk; do
        [ -f "$apk_file" ] || continue
        tar -xzf "$apk_file" -C "$ext_dir"
    done

    if [ -f "$ext_dir/usr/sbin/nginx" ]; then
        mkdir -p "$nginx_dir/sbin"
        cp "$ext_dir/usr/sbin/nginx" "$nginx_dir/sbin/nginx"
        chmod +x "$nginx_dir/sbin/nginx"
        apply_rpath "/www/server/nginx/lib" "$nginx_dir/sbin/nginx"
        ln -sf "$nginx_dir/sbin/nginx" /usr/bin/nginx
    else
        echo "错误: 未找到 nginx 二进制" >&2
        rm -rf "$dl_dir" "$ext_dir"
        exit 1
    fi

    mkdir -p "$nginx_dir/lib"
    for d in "$ext_dir/lib" "$ext_dir/usr/lib"; do
        [ -d "$d" ] && cp -r "$d/." "$nginx_dir/lib/" 2>/dev/null || true
    done

    if [ -d "$ext_dir/etc/nginx" ]; then
        cp -r "$ext_dir/etc/nginx/." "$conf_dir/"
    fi

    wget -q --timeout=10 "$NGINX_RAW/conf/nginx.conf" -O "$conf_dir/nginx.conf" \
        || { echo "错误: 下载 nginx.conf 失败" >&2; rm -rf "$dl_dir" "$ext_dir"; exit 1; }

    for tpl in proxy.conf php-00.conf php-74.conf php-75.conf php-80.conf php-81.conf php-82.conf php-83.conf php-84.conf php-85.conf; do
        wget -q --timeout=10 "$NGINX_RAW/conf/$tpl" -O "$conf_dir/$tpl" \
            || { echo "错误: 下载 $tpl 失败" >&2; rm -rf "$dl_dir" "$ext_dir"; exit 1; }
    done

    cat > /etc/init.d/nginx << 'NGINXINIT'
#!/bin/sh

NGINX_BIN="/www/server/nginx/sbin/nginx"
NGINX_CONF="/www/server/nginx/conf/nginx.conf"
PIDFILE="/www/server/nginx/run/nginx.pid"
ERRLOG="/www/wwwlogs/nginx_error.log"

start() {
    mkdir -p /www/server/nginx/run
    mkdir -p /var/lib/nginx/tmp/client_body /var/lib/nginx/tmp/proxy /var/lib/nginx/tmp/fastcgi /var/lib/nginx/tmp/uwsgi /var/lib/nginx/tmp/scgi
    mkdir -p /www/server/nginx/tmp /www/server/nginx/proxy_temp_dir /www/server/nginx/proxy_cache_dir
    export LD_LIBRARY_PATH=/www/server/nginx/lib
    start-stop-daemon --start --background --make-pidfile \
        --pidfile "$PIDFILE" \
        --env LD_LIBRARY_PATH=/www/server/nginx/lib \
        --exec "$NGINX_BIN" -- -e "$ERRLOG" -c "$NGINX_CONF"
}

stop() {
    if [ -f "$PIDFILE" ]; then
        start-stop-daemon --stop --pidfile "$PIDFILE" --retry QUIT/5
        rm -f "$PIDFILE"
    fi
}

reload() {
    if [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        kill -HUP "$PID" 2>/dev/null
    fi
}

status() {
    if [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        if kill -0 "$PID" 2>/dev/null; then
            echo "nginx 运行中 (pid $PID)"
            return 0
        fi
    fi
    echo "nginx 未运行"
    return 1
}

if [ -z "${RC_SVCNAME:-}" ]; then
    case "${1:-}" in
        start)   start ;;
        stop)    stop ;;
        restart) stop; sleep 1; start ;;
        reload)  reload ;;
        status)  status ;;
        *)       echo "用法: $0 {start|stop|restart|reload|status}" >&2; exit 1 ;;
    esac
fi
NGINXINIT
    chmod +x /etc/init.d/nginx

    rm -rf "$dl_dir" "$ext_dir"

    rc-update add nginx default 2>/dev/null || true

    echo "Nginx 安装完成"
}

uninstall() {
    echo "正在卸载 Nginx..."

    /etc/init.d/nginx stop 2>/dev/null || true
    rc-update del nginx default 2>/dev/null || true

    rm -f /etc/init.d/nginx
    rm -f /usr/bin/nginx
    rm -rf /www/server/nginx

    echo "Nginx 已卸载"
}

get_version() {
    if [ ! -f "$NGINX_BIN" ]; then
        echo "未安装"
        exit 1
    fi
    "$NGINX_BIN" -v 2>&1 | sed 's/.*nginx\/\([0-9.]*\).*/\1/'
}

status() {
    if [ ! -f "$NGINX_BIN" ]; then
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
    if [ ! -f "$NGINX_BIN" ]; then
        echo "Nginx 未安装" >&2
        exit 1
    fi
    if status >/dev/null 2>&1; then
        echo "Nginx 已在运行"
        return 0
    fi
    mkdir -p "$(dirname "$PIDFILE")"
    mkdir -p /var/lib/nginx/tmp/client_body /var/lib/nginx/tmp/proxy /var/lib/nginx/tmp/fastcgi /var/lib/nginx/tmp/uwsgi /var/lib/nginx/tmp/scgi
    mkdir -p /www/server/nginx/tmp /www/server/nginx/proxy_temp_dir /www/server/nginx/proxy_cache_dir
    export LD_LIBRARY_PATH=/www/server/nginx/lib
    start-stop-daemon --start --background --make-pidfile \
        --pidfile "$PIDFILE" \
        --env LD_LIBRARY_PATH=/www/server/nginx/lib \
        --exec "$NGINX_BIN" -- -e "$ERRLOG" -c "$NGINX_CONF"
    sleep 1
    if status >/dev/null 2>&1; then
        echo "Nginx 已启动"
    else
        echo "Nginx 启动失败" >&2
        exit 1
    fi
}

stop() {
    if [ -f "$PIDFILE" ]; then
        export LD_LIBRARY_PATH=/www/server/nginx/lib
        start-stop-daemon --stop --pidfile "$PIDFILE" --retry QUIT/5
        rm -f "$PIDFILE"
    fi
    echo "Nginx 已停止"
}

restart() {
    stop
    sleep 1
    start
}

reload() {
    if [ ! -f "$NGINX_BIN" ]; then
        echo "Nginx 未安装" >&2
        exit 1
    fi
    if [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        if kill -0 "$PID" 2>/dev/null; then
            kill -HUP "$PID" 2>/dev/null
            echo "Nginx 已重载"
            return 0
        fi
    fi
    echo "Nginx 未运行" >&2
    exit 1
}

get_nginx_status() {
    workers="-"; mem="-"; cpu="-"
    active="-"; accepts="-"; handled="-"; requests="-"; reading="-"; writing="-"; waiting="-"

    if [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        if kill -0 "$PID" 2>/dev/null; then
            workers=$(pgrep -P "$PID" 2>/dev/null | wc -l | tr -d ' ')
            if [ -f "/proc/$PID/status" ]; then
                mem=$(awk '/VmRSS/{printf "%.0f", $2/1024}' /proc/$PID/status 2>/dev/null)
                [ -n "$mem" ] && mem="${mem}MB" || mem="-"
            fi
        fi
    fi

    if command -v curl >/dev/null 2>&1 && [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        if kill -0 "$PID" 2>/dev/null; then
            status_data=$(curl -s --max-time 2 http://localhost/nginx_status 2>/dev/null || true)
            if [ -n "$status_data" ]; then
                active=$(echo "$status_data" | awk '/Active connections/{print $3}')
                accepts=$(echo "$status_data" | awk '/^\s+[0-9]+\s+[0-9]+\s+[0-9]+/{print $1}')
                handled=$(echo "$status_data" | awk '/^\s+[0-9]+\s+[0-9]+\s+[0-9]+/{print $2}')
                requests=$(echo "$status_data" | awk '/^\s+[0-9]+\s+[0-9]+\s+[0-9]+/{print $3}')
                reading=$(echo "$status_data" | awk '/Reading:/{print $2}')
                writing=$(echo "$status_data" | awk '/Reading:/{print $4}')
                waiting=$(echo "$status_data" | awk '/Reading:/{print $6}')
            fi
        fi
    fi

    echo "{\"active_connections\":\"$active\",\"accepts\":\"$accepts\",\"handled\":\"$handled\",\"requests\":\"$requests\",\"reading\":\"$reading\",\"writing\":\"$writing\",\"waiting\":\"$waiting\",\"worker_count\":\"$workers\",\"worker_cpu\":\"$cpu\",\"worker_mem\":\"$mem\"}"
}

get_nginx_value() {
    conf="$NGINX_CONF"
    getv() { val=$(grep -iE "^\s*${1}\s+" "$conf" 2>/dev/null | head -1 | awk '{gsub(/;/, "", $2); print $2}'); [ -n "$val" ] && echo "$val" || echo "${2}"; }

    echo "{\"worker_processes\":\"$(getv worker_processes auto)\",\"worker_connections\":\"$(getv worker_connections 1024)\",\"keepalive_timeout\":\"$(getv keepalive_timeout 65)\",\"gzip\":\"$(getv gzip off)\",\"gzip_min_length\":\"$(getv gzip_min_length 1024)\",\"gzip_comp_level\":\"$(getv gzip_comp_level 6)\",\"client_max_body_size\":\"$(getv client_max_body_size 1m)\",\"server_names_hash_bucket_size\":\"$(getv server_names_hash_bucket_size 64)\",\"client_header_buffer_size\":\"$(getv client_header_buffer_size 4k)\",\"client_body_buffer_size\":\"$(getv client_body_buffer_size 8k)\"}"
}

set_nginx_value() {
    tmp=""
    if [ -n "${PLUGIN_ARGS:-}" ]; then
        tmp=$(mktemp)
        echo "$PLUGIN_ARGS" > "$tmp"
    fi
    if [ -z "$tmp" ] && [ -f "/tmp/nginx_perf.json" ]; then
        tmp="/tmp/nginx_perf.json"
    fi
    if [ -z "$tmp" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    conf="$NGINX_CONF"
    [ -f "$conf" ] && cp "$conf" "$conf.bak" || { echo '{"error":"conf missing"}'; exit 1; }

    for key in worker_processes worker_connections keepalive_timeout gzip gzip_min_length gzip_comp_level client_max_body_size server_names_hash_bucket_size client_header_buffer_size client_body_buffer_size; do
        val=$(jq -r ".$key // empty" "$tmp" 2>/dev/null)
        if [ -n "$val" ]; then
            sed -i "s/^\(\s*${key}\s\+\).*;/\1${val};/I" "$conf"
        fi
    done

    rm -f "$tmp"
    if "$NGINX_BIN" -t -c "$NGINX_CONF" 2>/dev/null; then
        rm -f "$conf.bak"
        echo '{"ok":true}'
    else
        cp "$conf.bak" "$conf"
        rm -f "$conf.bak"
        echo '{"error":"config test failed"}'
        exit 1
    fi
}

get_nginx_config() {
    if [ ! -f "$NGINX_CONF" ]; then
        echo '{"error":"conf missing"}'
        exit 1
    fi
    echo "{\"content\":$(cat "$NGINX_CONF" | jq -Rs .)}"
}

save_nginx_config() {
    if [ -z "${PLUGIN_ARGS:-}" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    content=$(echo "$PLUGIN_ARGS" | jq -r '.content // empty')
    if [ -z "$content" ]; then
        echo '{"error":"bad content"}'
        exit 1
    fi
    [ -f "$NGINX_CONF" ] && cp "$NGINX_CONF" "$NGINX_CONF.bak" || { echo '{"error":"conf missing"}'; exit 1; }
    printf '%s\n' "$content" > "$NGINX_CONF"
    if "$NGINX_BIN" -t -c "$NGINX_CONF" 2>/dev/null; then
        rm -f "$NGINX_CONF.bak"
        reload >/dev/null 2>&1
        echo '{"ok":true}'
    else
        cp "$NGINX_CONF.bak" "$NGINX_CONF"
        rm -f "$NGINX_CONF.bak"
        echo '{"error":"config test failed"}'
        exit 1
    fi
}
