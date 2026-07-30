#!/bin/sh
set -eu

REDIS_BIN="/www/server/redis/bin/redis-server"
REDIS_CONF="/www/server/redis/conf/redis.conf"
PIDFILE="/www/server/redis/run/redis.pid"
DATA_DIR="/www/server/redis/data"
ERRLOG="/www/wwwlogs/redis.log"

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
    echo "正在安装 Redis..."

    command -v apk >/dev/null 2>&1 || { echo "错误: 仅支持 Alpine Linux" >&2; exit 1; }

    redis_dir="/www/server/redis"
    bin_dir="$redis_dir/bin"
    lib_dir="$redis_dir/lib"
    conf_dir="$redis_dir/conf"
    run_dir="$redis_dir/run"
    log_dir="/www/wwwlogs"

    mkdir -p "$bin_dir" "$lib_dir" "$conf_dir" "$run_dir" "$DATA_DIR" "$log_dir"

    dl_dir=$(mktemp -d)
    ext_dir=$(mktemp -d)

    (
        cd "$dl_dir"
        apk fetch --recursive redis
    )

    for apk_file in "$dl_dir"/*.apk; do
        [ -f "$apk_file" ] || continue
        tar -xzf "$apk_file" -C "$ext_dir"
    done

    if [ -f "$ext_dir/usr/bin/redis-server" ]; then
        cp -r "$ext_dir/usr/bin/." "$bin_dir/" 2>/dev/null || true
        chmod +x "$bin_dir/"* 2>/dev/null || true
        apply_rpath "/www/server/redis/lib" "$bin_dir/redis-server"
        ln -sf "$bin_dir/redis-server" /usr/bin/redis
    else
        echo "错误: 未找到 redis-server 二进制" >&2
        rm -rf "$dl_dir" "$ext_dir"
        exit 1
    fi

    for d in "$ext_dir/lib" "$ext_dir/usr/lib"; do
        [ -d "$d" ] && cp -r "$d/." "$lib_dir/" 2>/dev/null || true
    done

    cat > "$conf_dir/redis.conf" << 'EOF'
bind 0.0.0.0
port 6379
daemonize no
dir /www/server/redis/data
pidfile /www/server/redis/run/redis.pid
logfile /www/wwwlogs/redis.log
EOF

    cat > /etc/init.d/redis << 'REDISINIT'
#!/bin/sh

REDIS_BIN="/www/server/redis/bin/redis-server"
REDIS_CONF="/www/server/redis/conf/redis.conf"
PIDFILE="/www/server/redis/run/redis.pid"

start() {
    mkdir -p /www/server/redis/run
    export LD_LIBRARY_PATH=/www/server/redis/lib
    start-stop-daemon --start --background --make-pidfile \
        --pidfile "$PIDFILE" \
        --env LD_LIBRARY_PATH=/www/server/redis/lib \
        --exec "$REDIS_BIN" -- "$REDIS_CONF"
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
            echo "redis 运行中 (pid $PID)"
            return 0
        fi
    fi
    echo "redis 未运行"
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
REDISINIT
    chmod +x /etc/init.d/redis

    rm -rf "$dl_dir" "$ext_dir"

    rc-update add redis default 2>/dev/null || true

    echo "Redis 安装完成"
}

uninstall() {
    echo "正在卸载 Redis..."

    /etc/init.d/redis stop 2>/dev/null || true
    rc-update del redis default 2>/dev/null || true

    rm -f /etc/init.d/redis
    rm -f /usr/bin/redis
    rm -rf /www/server/redis

    echo "Redis 已卸载"
}

get_version() {
    if [ ! -f "$REDIS_BIN" ]; then
        echo "未安装"
        exit 1
    fi
    "$REDIS_BIN" --version 2>&1 | sed 's/.*v=\([0-9.]*\).*/\1/'
}

status() {
    if [ ! -f "$REDIS_BIN" ]; then
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
    if [ ! -f "$REDIS_BIN" ]; then
        echo "Redis 未安装" >&2
        exit 1
    fi
    if status >/dev/null 2>&1; then
        echo "Redis 已在运行"
        return 0
    fi
    mkdir -p "$(dirname "$PIDFILE")"
    export LD_LIBRARY_PATH=/www/server/redis/lib
    start-stop-daemon --start --background --make-pidfile \
        --pidfile "$PIDFILE" \
        --env LD_LIBRARY_PATH=/www/server/redis/lib \
        --exec "$REDIS_BIN" -- "$REDIS_CONF"
    sleep 1
    if status >/dev/null 2>&1; then
        echo "Redis 已启动"
    else
        echo "Redis 启动失败" >&2
        exit 1
    fi
}

stop() {
    if [ -f "$PIDFILE" ]; then
        export LD_LIBRARY_PATH=/www/server/redis/lib
        start-stop-daemon --stop --pidfile "$PIDFILE" --retry QUIT/5
        rm -f "$PIDFILE"
    fi
    echo "Redis 已停止"
}

restart() {
    stop
    sleep 1
    start
}

reload() {
    if [ ! -f "$REDIS_BIN" ]; then
        echo "Redis 未安装" >&2
        exit 1
    fi
    if [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        if kill -0 "$PID" 2>/dev/null; then
            kill -HUP "$PID" 2>/dev/null
            echo "Redis 已重载"
            return 0
        fi
    fi
    echo "Redis 未运行" >&2
    exit 1
}
