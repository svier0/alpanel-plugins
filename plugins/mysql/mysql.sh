#!/bin/sh
set -eu

MYSQLD_BIN="/www/server/mysql/bin/mariadbd"
MYSQL_CLIENT="/www/server/mysql/bin/mariadb"
MY_CNF="/www/server/mysql/conf/my.cnf"
PIDFILE="/www/server/mysql/run/mysql.pid"
SOCKFILE="/www/server/mysql/run/mysql.sock"
ERRLOG="/www/wwwlogs/mysql_error.log"
DATA_DIR="/www/server/data"

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
    echo "正在安装 MySQL..."

    command -v apk >/dev/null 2>&1 || { echo "错误: 仅支持 Alpine Linux" >&2; exit 1; }

    mysql_dir="/www/server/mysql"
    bin_dir="$mysql_dir/bin"
    lib_dir="$mysql_dir/lib"
    conf_dir="$mysql_dir/conf"
    run_dir="$mysql_dir/run"
    log_dir="/www/wwwlogs"

    mkdir -p "$bin_dir" "$lib_dir" "$conf_dir" "$run_dir" "$DATA_DIR" "$log_dir"

    dl_dir=$(mktemp -d)
    ext_dir=$(mktemp -d)

    (
        cd "$dl_dir"
        apk fetch --recursive mariadb mariadb-client
    )

    for apk_file in "$dl_dir"/*.apk; do
        [ -f "$apk_file" ] || continue
        tar -xzf "$apk_file" -C "$ext_dir"
    done

    if [ -f "$ext_dir/usr/bin/mariadbd" ]; then
        cp -r "$ext_dir/usr/bin/." "$bin_dir/" 2>/dev/null || true
        for f in myisamchk myisam_ftdump myisamlog myisampack \
                 mariadb-embedded mariadb-ldb mariadb-slap myrocks_hotbackup; do
            rm -f "$bin_dir/$f" 2>/dev/null || true
        done
        chmod +x "$bin_dir/"* 2>/dev/null || true
        apply_rpath "/www/server/mysql/lib" "$bin_dir/mariadbd" "$bin_dir/mariadb"
        ln -sf "$bin_dir/mariadb" /usr/bin/mysql
        ln -sf "$bin_dir/mariadbd" /usr/bin/mysqld
    else
        echo "错误: 未找到 mariadbd 二进制" >&2
        rm -rf "$dl_dir" "$ext_dir"
        exit 1
    fi

    for d in "$ext_dir/lib" "$ext_dir/usr/lib"; do
        [ -d "$d" ] && cp -r "$d/." "$lib_dir/" 2>/dev/null || true
    done

    if [ -d "$ext_dir/usr/share/mariadb" ]; then
        mkdir -p "$mysql_dir/share"
        cp -r "$ext_dir/usr/share/mariadb/." "$mysql_dir/share/mariadb/" 2>/dev/null || true
    fi

    if [ -d "$ext_dir/etc/mysql" ]; then
        cp -r "$ext_dir/etc/mysql/." "$conf_dir/"
    fi

    cat > "$conf_dir/my.cnf" << 'EOF'
[mysqld]
user=root
basedir=/www/server/mysql
datadir=/www/server/data
pid-file=/www/server/mysql/run/mysql.pid
socket=/www/server/mysql/run/mysql.sock
log-error=/www/wwwlogs/mysql_error.log
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci

[client]
socket=/www/server/mysql/run/mysql.sock
EOF

    if [ ! -d "$DATA_DIR/mysql" ]; then
        echo "正在初始化数据库..."
        export LD_LIBRARY_PATH="$lib_dir"
        "$bin_dir/mariadb-install-db" --defaults-file="$conf_dir/my.cnf" \
            --user=root --datadir="$DATA_DIR" --basedir="$mysql_dir" >/dev/null 2>&1 || {
            echo "错误: 数据库初始化失败" >&2
            rm -rf "$dl_dir" "$ext_dir"
            exit 1
        }
    fi

    cat > /etc/init.d/mysql << 'MYSQLINIT'
#!/bin/sh

MYSQLD_BIN="/www/server/mysql/bin/mariadbd"
MY_CNF="/www/server/mysql/conf/my.cnf"
PIDFILE="/www/server/mysql/run/mysql.pid"

start() {
    mkdir -p /www/server/mysql/run
    export LD_LIBRARY_PATH=/www/server/mysql/lib
    start-stop-daemon --start --background --make-pidfile \
        --pidfile "$PIDFILE" \
        --env LD_LIBRARY_PATH=/www/server/mysql/lib \
        --exec "$MYSQLD_BIN" -- --defaults-file="$MY_CNF"
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
            echo "mysql 运行中 (pid $PID)"
            return 0
        fi
    fi
    echo "mysql 未运行"
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
MYSQLINIT
    chmod +x /etc/init.d/mysql

    rm -rf "$dl_dir" "$ext_dir"

    rc-update add mysql default 2>/dev/null || true

    echo "MySQL 安装完成"
}

uninstall() {
    echo "正在卸载 MySQL..."

    /etc/init.d/mysql stop 2>/dev/null || true
    rc-update del mysql default 2>/dev/null || true

    rm -f /etc/init.d/mysql
    rm -f /usr/bin/mysql /usr/bin/mysqld
    rm -rf /www/server/mysql /www/server/data

    echo "MySQL 已卸载"
}

get_version() {
    if [ ! -f "$MYSQLD_BIN" ]; then
        echo "未安装"
        exit 1
    fi
    "$MYSQLD_BIN" --version 2>&1 | sed 's/.*Ver \([0-9.]*\).*/\1/'
}

status() {
    if [ ! -f "$MYSQLD_BIN" ]; then
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
    if [ ! -f "$MYSQLD_BIN" ]; then
        echo "MySQL 未安装" >&2
        exit 1
    fi
    if status >/dev/null 2>&1; then
        echo "MySQL 已在运行"
        return 0
    fi
    mkdir -p "$(dirname "$PIDFILE")"
    export LD_LIBRARY_PATH=/www/server/mysql/lib
    start-stop-daemon --start --background --make-pidfile \
        --pidfile "$PIDFILE" \
        --env LD_LIBRARY_PATH=/www/server/mysql/lib \
        --exec "$MYSQLD_BIN" -- --defaults-file="$MY_CNF"
    sleep 2
    if status >/dev/null 2>&1; then
        echo "MySQL 已启动"
    else
        echo "MySQL 启动失败" >&2
        exit 1
    fi
}

stop() {
    if [ -f "$PIDFILE" ]; then
        export LD_LIBRARY_PATH=/www/server/mysql/lib
        start-stop-daemon --stop --pidfile "$PIDFILE" --retry QUIT/5
        rm -f "$PIDFILE"
    fi
    echo "MySQL 已停止"
}

restart() {
    stop
    sleep 2
    start
}

reload() {
    if [ ! -f "$MYSQLD_BIN" ]; then
        echo "MySQL 未安装" >&2
        exit 1
    fi
    if [ -f "$PIDFILE" ]; then
        read PID < "$PIDFILE"
        if kill -0 "$PID" 2>/dev/null; then
            kill -HUP "$PID" 2>/dev/null
            echo "MySQL 已重载"
            return 0
        fi
    fi
    echo "MySQL 未运行" >&2
    exit 1
}

get_mysql_value() {
    conf="$MY_CNF"
    getv() {
        val=$(grep -iE "^\s*${1}\s*=" "$conf" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' ')
        [ -n "$val" ] && echo "$val" || echo "${2}"
    }
    strip() { echo "$1" | sed 's/[MmKk]$//'; }

    echo "{\"table_open_cache\":\"$(strip "$(getv table_open_cache 128)")\",\"thread_cache_size\":\"$(strip "$(getv thread_cache_size 16)")\",\"key_buffer_size\":\"$(strip "$(getv key_buffer_size 32M)")\",\"tmp_table_size\":\"$(strip "$(getv tmp_table_size 32M)")\",\"innodb_buffer_pool_size\":\"$(strip "$(getv innodb_buffer_pool_size 128M)")\",\"innodb_log_buffer_size\":\"$(strip "$(getv innodb_log_buffer_size 16M)")\",\"max_connections\":\"$(getv max_connections 500)\",\"sort_buffer_size\":\"$(strip "$(getv sort_buffer_size 768K)")\",\"read_buffer_size\":\"$(strip "$(getv read_buffer_size 768K)")\",\"read_rnd_buffer_size\":\"$(strip "$(getv read_rnd_buffer_size 256K)")\",\"join_buffer_size\":\"$(strip "$(getv join_buffer_size 256K)")\",\"thread_stack\":\"$(strip "$(getv thread_stack 256K)")\",\"binlog_cache_size\":\"$(strip "$(getv binlog_cache_size 32K)")\"}"
}

set_mysql_value() {
    tmp="/tmp/mysql_perf.json"
    if [ ! -f "$tmp" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    conf="$MY_CNF"
    [ -f "$conf" ] && cp "$conf" "$conf.bak" || { echo '{"error":"conf missing"}'; exit 1; }

    setv() {
        key="$1"; unit="$2"
        val=$(jq -r ".${key} // empty" "$tmp" 2>/dev/null)
        if [ -n "$val" ]; then
            val="${val}${unit}"
            if grep -qiE "^\s*${key}\s*=" "$conf"; then
                sed -i "s/^\(\s*${key}\s*=\s*\).*/\1${val}/" "$conf"
            else
                sed -i "/^\[mysqld\]/a ${key} = ${val}" "$conf"
            fi
        fi
    }

    setv table_open_cache ""
    setv thread_cache_size ""
    setv key_buffer_size M
    setv tmp_table_size M
    setv innodb_buffer_pool_size M
    setv innodb_log_buffer_size M
    setv max_connections ""
    setv sort_buffer_size K
    setv read_buffer_size K
    setv read_rnd_buffer_size K
    setv join_buffer_size K
    setv thread_stack K
    setv binlog_cache_size K

    rm -f "$tmp" "$conf.bak"
    echo '{"ok":true}'
}
