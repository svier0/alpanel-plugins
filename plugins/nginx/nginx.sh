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
    log_dir="/www/wwwlogs"
    vhost_dir="/www/server/panel/vhost/nginx"

    mkdir -p "$nginx_dir" "$conf_dir" "$run_dir" "$vhost_dir" "$log_dir"

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

    cat > "$conf_dir/nginx.conf" << 'EOF'
user www;
worker_processes auto;
pid /www/server/nginx/run/nginx.pid;
error_log /www/wwwlogs/nginx_error.log warn;

events {
    worker_connections 1024;
}

http {
    include mime.types;

    proxy_temp_path /www/server/nginx/proxy_temp_dir;
    proxy_cache_path /www/server/nginx/proxy_cache_dir levels=1:2 keys_zone=cache_one:20m inactive=1d max_size=5g;
    client_body_buffer_size 512k;
    proxy_connect_timeout 60;
    proxy_read_timeout 60;
    proxy_send_timeout 60;
    proxy_buffer_size 32k;
    proxy_buffers 4 64k;
    proxy_busy_buffers_size 128k;
    proxy_temp_file_write_size 128k;
    proxy_next_upstream error timeout invalid_header http_500 http_503 http_404;
    proxy_cache cache_one;

    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /www/wwwlogs/nginx_access.log main;
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;

    server_names_hash_bucket_size 512;
    client_header_buffer_size 32k;
    large_client_header_buffers 4 32k;
    client_max_body_size 50m;

    tcp_nodelay on;

    fastcgi_connect_timeout 300;
    fastcgi_send_timeout 300;
    fastcgi_read_timeout 300;
    fastcgi_buffer_size 64k;
    fastcgi_buffers 4 64k;
    fastcgi_busy_buffers_size 128k;
    fastcgi_temp_file_write_size 256k;
    fastcgi_intercept_errors on;

    gzip on;
    gzip_min_length  1k;
    gzip_buffers     4 16k;
    gzip_http_version 1.1;
    gzip_comp_level 5;
    gzip_types     text/plain application/javascript application/x-javascript text/javascript text/css application/xml application/json image/jpeg image/gif image/png font/ttf font/otf image/svg+xml application/xml+rss text/x-js;
    gzip_vary on;
    gzip_proxied   expired no-cache no-store private auth;
    gzip_disable   "MSIE [1-6]\.";

    limit_conn_zone $binary_remote_addr zone=perip:10m;
    limit_conn_zone $server_name zone=perserver:10m;

    server_tokens off;
    access_log off;

    include /www/server/panel/vhost/nginx/*.conf;
}
EOF

    cat > /etc/init.d/nginx << 'NGINXINIT'
#!/bin/sh

NGINX_BIN="/www/server/nginx/sbin/nginx"
NGINX_CONF="/www/server/nginx/conf/nginx.conf"
PIDFILE="/www/server/nginx/run/nginx.pid"
ERRLOG="/www/wwwlogs/nginx_error.log"

start() {
    mkdir -p /www/server/nginx/run
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
