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
            stop
            sleep 1
            start
            echo "Redis 已重载"
            return 0
        fi
    fi
    echo "Redis 未运行" >&2
    exit 1
}

get_redis_status() {
    if [ ! -f "$REDIS_BIN" ]; then
        echo '{"error":"not installed"}'
        exit 1
    fi
    if [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        if ! kill -0 "$PID" 2>/dev/null; then
            echo '{"error":"not running"}'
            exit 1
        fi
    else
        echo '{"error":"not running"}'
        exit 1
    fi

    export LD_LIBRARY_PATH=/www/server/redis/lib
    rcli="/www/server/redis/bin/redis-cli"
    pass=$(grep -iE "^\s*requirepass\s+" "$REDIS_CONF" 2>/dev/null | head -1 | awk '{print $2}')
    if [ -n "$pass" ]; then
        info=$("$rcli" -a "$pass" --no-auth-warning INFO 2>/dev/null || true)
    else
        info=$("$rcli" INFO 2>/dev/null || true)
    fi

    gf() {
        echo "$info" | sed -n "s/^${1}:\(.*\)$/\1/p" | head -1 | tr -d '\r'
    }

    uptime_in_days=$(gf uptime_in_days)
    tcp_port=$(gf tcp_port)
    connected_clients=$(gf connected_clients)
    used_memory_rss=$(gf used_memory_rss)
    used_memory=$(gf used_memory)
    mem_fragmentation_ratio=$(gf mem_fragmentation_ratio)
    total_connections_received=$(gf total_connections_received)
    total_commands_processed=$(gf total_commands_processed)
    instantaneous_ops_per_sec=$(gf instantaneous_ops_per_sec)
    keyspace_hits=$(gf keyspace_hits)
    keyspace_misses=$(gf keyspace_misses)
    latest_fork_usec=$(gf latest_fork_usec)

    [ -z "$uptime_in_days" ] && uptime_in_days=0
    [ -z "$tcp_port" ] && tcp_port=0
    [ -z "$connected_clients" ] && connected_clients=0
    [ -z "$used_memory_rss" ] && used_memory_rss=0
    [ -z "$used_memory" ] && used_memory=0
    [ -z "$mem_fragmentation_ratio" ] && mem_fragmentation_ratio=0
    [ -z "$total_connections_received" ] && total_connections_received=0
    [ -z "$total_commands_processed" ] && total_commands_processed=0
    [ -z "$instantaneous_ops_per_sec" ] && instantaneous_ops_per_sec=0
    [ -z "$keyspace_hits" ] && keyspace_hits=0
    [ -z "$keyspace_misses" ] && keyspace_misses=0
    [ -z "$latest_fork_usec" ] && latest_fork_usec=0

    hits_total=$(( keyspace_hits + keyspace_misses ))
    if [ "$hits_total" -gt 0 ]; then
        hit=$(awk -v h="$keyspace_hits" -v t="$hits_total" 'BEGIN{ printf "%.2f", h*100/t }')
        hit="${hit}%"
    else
        hit="0%"
    fi

    fmt_size() {
        b=$(echo "$1" | tr -d '\r')
        case "$b" in
            ''|*[!0-9]*) b=0 ;;
        esac
        if [ "$b" -ge 1073741824 ]; then echo "$(awk "BEGIN{printf \"%.2f\", $b/1073741824}") GB"
        elif [ "$b" -ge 1048576 ]; then echo "$(awk "BEGIN{printf \"%.2f\", $b/1048576}") MB"
        elif [ "$b" -ge 1024 ]; then echo "$(awk "BEGIN{printf \"%.2f\", $b/1024}") KB"
        else echo "${b} B"; fi
    }

    echo "{\"uptime_in_days\":\"$uptime_in_days\",\"tcp_port\":\"$tcp_port\",\"connected_clients\":\"$connected_clients\",\"used_memory_rss\":\"$(fmt_size "$used_memory_rss")\",\"used_memory\":\"$(fmt_size "$used_memory")\",\"mem_fragmentation_ratio\":\"$mem_fragmentation_ratio\",\"total_connections_received\":\"$total_connections_received\",\"total_commands_processed\":\"$total_commands_processed\",\"instantaneous_ops_per_sec\":\"$instantaneous_ops_per_sec\",\"keyspace_hits\":\"$keyspace_hits\",\"keyspace_misses\":\"$keyspace_misses\",\"hit\":\"$hit\",\"latest_fork_usec\":\"$latest_fork_usec\"}"
}

get_redis_value() {
    conf="$REDIS_CONF"
    getv() {
        val=$(grep -iE "^\s*${1}\s+" "$conf" 2>/dev/null | head -1 | awk '{print $2}')
        [ -n "$val" ] && echo "$val" || echo "${2}"
    }
    strip() {
        echo "$1" | sed 's/\([MmGgKk][Bb]\?\)$//'
    }

    echo "{\"bind\":\"$(getv bind 127.0.0.1)\",\"port\":\"$(getv port 6379)\",\"timeout\":\"$(getv timeout 0)\",\"maxclients\":\"$(getv maxclients 10000)\",\"databases\":\"$(getv databases 4)\",\"requirepass\":\"$(getv requirepass "")\",\"maxmemory\":\"$(strip "$(getv maxmemory 0)")\"}"
}

set_redis_value() {
    tmp=""
    if [ -n "${PLUGIN_ARGS:-}" ]; then
        tmp=$(mktemp)
        echo "$PLUGIN_ARGS" > "$tmp"
    fi
    if [ -z "$tmp" ] && [ -f "/tmp/redis_perf.json" ]; then
        tmp="/tmp/redis_perf.json"
    fi
    if [ -z "$tmp" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    conf="$REDIS_CONF"
    [ -f "$conf" ] && cp "$conf" "$conf.bak" || { echo '{"error":"conf missing"}'; exit 1; }

    setv() {
        key="$1"; unit="$2"
        val=$(jq -r ".${key} // empty" "$tmp" 2>/dev/null)
        if [ -n "$val" ]; then
            val="${val}${unit}"
            if grep -qiE "^\s*${key}\s+" "$conf"; then
                sed -i "s/^\(\s*${key}\s\+\).*/\1${val}/I" "$conf"
            else
                echo "${key} ${val}" >> "$conf"
            fi
        fi
    }

    setv bind ""
    setv port ""
    setv timeout ""
    setv maxclients ""
    setv databases ""
    setv maxmemory mb

    pass=$(jq -r '.requirepass // empty' "$tmp" 2>/dev/null)
    if [ -n "$pass" ]; then
        if grep -qiE "^\s*requirepass\s+" "$conf"; then
            sed -i "s/^\(\s*requirepass\s\+\).*/\1${pass}/I" "$conf"
        else
            echo "requirepass ${pass}" >> "$conf"
        fi
    else
        sed -i "/^\s*requirepass\s/d" "$conf"
    fi

    rm -f "$tmp"
    restart >/dev/null 2>&1
    rm -f "$conf.bak"
    echo '{"ok":true}'
}

get_redis_config() {
    if [ ! -f "$REDIS_CONF" ]; then
        echo '{"error":"conf missing"}'
        exit 1
    fi
    echo "{\"content\":$(cat "$REDIS_CONF" | jq -Rs .)}"
}

save_redis_config() {
    if [ -z "${PLUGIN_ARGS:-}" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    content=$(echo "$PLUGIN_ARGS" | jq -r '.content // empty')
    if [ -z "$content" ]; then
        echo '{"error":"bad content"}'
        exit 1
    fi
    [ -f "$REDIS_CONF" ] && cp "$REDIS_CONF" "$REDIS_CONF.bak" || { echo '{"error":"conf missing"}'; exit 1; }
    printf '%s\n' "$content" > "$REDIS_CONF"
    rm -f "$REDIS_CONF.bak"
    restart >/dev/null 2>&1
    echo '{"ok":true}'
}
