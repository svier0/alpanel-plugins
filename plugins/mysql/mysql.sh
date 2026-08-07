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
    tmp=""
    if [ -n "${PLUGIN_ARGS:-}" ]; then
        tmp=$(mktemp)
        echo "$PLUGIN_ARGS" > "$tmp"
    fi
    if [ -z "$tmp" ] && [ -f "/tmp/mysql_perf.json" ]; then
        tmp="/tmp/mysql_perf.json"
    fi
    if [ -z "$tmp" ]; then
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

get_mysql_config() {
    if [ ! -f "$MY_CNF" ]; then
        echo '{"error":"conf missing"}'
        exit 1
    fi
    echo "{\"content\":$(cat "$MY_CNF" | jq -Rs .)}"
}

save_mysql_config() {
    if [ -z "${PLUGIN_ARGS:-}" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    content=$(echo "$PLUGIN_ARGS" | jq -r '.content // empty')
    if [ -z "$content" ]; then
        echo '{"error":"bad content"}'
        exit 1
    fi
    [ -f "$MY_CNF" ] && cp "$MY_CNF" "$MY_CNF.bak" || { echo '{"error":"conf missing"}'; exit 1; }
    printf '%s\n' "$content" > "$MY_CNF"
    reload >/dev/null 2>&1
    rm -f "$MY_CNF.bak"
    echo '{"ok":true}'
}

get_mysql_log() {
    logpath=""
    if [ -n "${PLUGIN_ARGS:-}" ]; then
        logpath=$(echo "$PLUGIN_ARGS" | jq -r '.path // empty')
    fi
    if [ -z "$logpath" ]; then
        echo '{"error":"no path"}'
        exit 1
    fi
    case "$logpath" in
        /www/wwwlogs/*|/www/server/data/*) ;;
        *) echo '{"error":"bad path"}'; exit 1 ;;
    esac
    if [ ! -f "$logpath" ]; then
        echo '{"content":""}'
        exit 0
    fi
    echo "{\"content\":$(cat "$logpath" | jq -Rs .)}"
}

get_mysql_status() {
    if [ ! -f "$MYSQLD_BIN" ]; then
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

    export LD_LIBRARY_PATH=/www/server/mysql/lib
    Q() { /www/server/mysql/bin/mariadb --socket="$SOCKFILE" -uroot -N -e "$1" 2>/dev/null; }

    uptime=$(Q "SHOW GLOBAL STATUS LIKE 'Uptime'" | awk '{print $2}')
    [ -z "$uptime" ] && uptime=0
    connections=$(Q "SHOW GLOBAL STATUS LIKE 'Connections'" | awk '{print $2}')
    bytes_sent=$(Q "SHOW GLOBAL STATUS LIKE 'Bytes_sent'" | awk '{print $2}')
    bytes_recv=$(Q "SHOW GLOBAL STATUS LIKE 'Bytes_received'" | awk '{print $2}')
    questions=$(Q "SHOW GLOBAL STATUS LIKE 'Questions'" | awk '{print $2}')
    com_commit=$(Q "SHOW GLOBAL STATUS LIKE 'Com_commit'" | awk '{print $2}')
    com_rollback=$(Q "SHOW GLOBAL STATUS LIKE 'Com_rollback'" | awk '{print $2}')
    threads_conn=$(Q "SHOW GLOBAL STATUS LIKE 'Threads_connected'" | awk '{print $2}')
    max_used=$(Q "SHOW GLOBAL STATUS LIKE 'Max_used_connections'" | awk '{print $2}')
    threads_created=$(Q "SHOW GLOBAL STATUS LIKE 'Threads_created'" | awk '{print $2}')
    key_reads=$(Q "SHOW GLOBAL STATUS LIKE 'Key_reads'" | awk '{print $2}')
    key_req=$(Q "SHOW GLOBAL STATUS LIKE 'Key_read_requests'" | awk '{print $2}')
    ib_reads=$(Q "SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_reads'" | awk '{print $2}')
    ib_req=$(Q "SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read_requests'" | awk '{print $2}')
    qc_hits=$(Q "SHOW GLOBAL STATUS LIKE 'Qcache_hits'" | awk '{print $2}')
    qc_inserts=$(Q "SHOW GLOBAL STATUS LIKE 'Qcache_inserts'" | awk '{print $2}')
    tmp_disk=$(Q "SHOW GLOBAL STATUS LIKE 'Created_tmp_disk_tables'" | awk '{print $2}')
    tmp_tables=$(Q "SHOW GLOBAL STATUS LIKE 'Created_tmp_tables'" | awk '{print $2}')
    open_tables=$(Q "SHOW GLOBAL STATUS LIKE 'Open_tables'" | awk '{print $2}')
    select_scan=$(Q "SHOW GLOBAL STATUS LIKE 'Select_scan'" | awk '{print $2}')
    full_join=$(Q "SHOW GLOBAL STATUS LIKE 'Select_full_join'" | awk '{print $2}')
    sort_merge=$(Q "SHOW GLOBAL STATUS LIKE 'Sort_merge_passes'" | awk '{print $2}')
    lock_waited=$(Q "SHOW GLOBAL STATUS LIKE 'Table_locks_waited'" | awk '{print $2}')

    [ -z "$connections" ] && connections=0
    [ -z "$bytes_sent" ] && bytes_sent=0
    [ -z "$bytes_recv" ] && bytes_recv=0
    [ -z "$questions" ] && questions=0
    [ -z "$com_commit" ] && com_commit=0
    [ -z "$com_rollback" ] && com_rollback=0
    [ -z "$threads_conn" ] && threads_conn=0
    [ -z "$max_used" ] && max_used=0
    [ -z "$threads_created" ] && threads_created=0
    [ -z "$key_reads" ] && key_reads=0
    [ -z "$key_req" ] && key_req=0
    [ -z "$ib_reads" ] && ib_reads=0
    [ -z "$ib_req" ] && ib_req=0
    [ -z "$qc_hits" ] && qc_hits=0
    [ -z "$qc_inserts" ] && qc_inserts=0
    [ -z "$tmp_disk" ] && tmp_disk=0
    [ -z "$tmp_tables" ] && tmp_tables=0
    [ -z "$open_tables" ] && open_tables=0
    [ -z "$select_scan" ] && select_scan=0
    [ -z "$full_join" ] && full_join=0
    [ -z "$sort_merge" ] && sort_merge=0
    [ -z "$lock_waited" ] && lock_waited=0

    start_time=$(date -d "@$(( $(date +%s) - uptime ))" '+%Y-%m-%d %H:%M:%S')
    qps=$(( questions / (uptime>0?uptime:1) ))
    tps=$(( (com_commit + com_rollback) / (uptime>0?uptime:1) ))

    thr_hit=$(awk -v c="$connections" -v t="$threads_created" 'BEGIN{ if(c<=0){print 100.00} else { v=(c-t)*100/c; if(v<0)v=0; printf "%.2f", v } }')
    key_hit=$(awk -v k="$key_reads" -v r="$key_req" 'BEGIN{ if(r<=0){print 100.00} else { v=(r-k)*100/r; if(v<0)v=0; printf "%.2f", v } }')
    ib_hit=$(awk -v k="$ib_reads" -v r="$ib_req" 'BEGIN{ if(r<=0){print 100.00} else { v=(r-k)*100/r; if(v<0)v=0; printf "%.2f", v } }')
    qc_total=$(( qc_hits + qc_inserts ))
    if [ "$qc_total" -gt 0 ]; then
        qc_hit=$(awk -v h="$qc_hits" -v t="$qc_total" 'BEGIN{ printf "%.2f", h*100/t }')
    else
        qc_hit="OFF"
    fi
    tmp_pct=$(awk -v d="$tmp_disk" -v t="$tmp_tables" 'BEGIN{ if(t<=0){print 0.00} else printf "%.2f", d*100/t }')

    fmt_size() {
        b=$1
        if [ "$b" -ge 1073741824 ]; then echo "$(awk "BEGIN{printf \"%.2f\", $b/1073741824}") GB"
        elif [ "$b" -ge 1048576 ]; then echo "$(awk "BEGIN{printf \"%.2f\", $b/1048576}") MB"
        elif [ "$b" -ge 1024 ]; then echo "$(awk "BEGIN{printf \"%.2f\", $b/1024}") KB"
        else echo "${b} B"; fi
    }

    file_name=$(Q "SHOW MASTER STATUS" | awk '{print $1}')
    file_pos=$(Q "SHOW MASTER STATUS" | awk '{print $2}')
    [ -z "$file_name" ] && file_name="-"
    [ -z "$file_pos" ] && file_pos="-"

    echo "{\"start_time\":\"$start_time\",\"connections\":\"$connections\",\"bytes_sent\":\"$(fmt_size "$bytes_sent")\",\"bytes_recv\":\"$(fmt_size "$bytes_recv")\",\"qps\":\"$qps\",\"tps\":\"$tps\",\"file\":\"$file_name\",\"position\":\"$file_pos\",\"threads\":\"$threads_conn/$max_used\",\"threads_hit\":\"$thr_hit%\",\"key_hit\":\"$key_hit%\",\"innodb_hit\":\"$ib_hit%\",\"qcache_hit\":\"$qc_hit\",\"tmp_disk\":\"$tmp_pct%\",\"open_tables\":\"$open_tables\",\"select_scan\":\"$select_scan\",\"full_join\":\"$full_join\",\"sort_merge\":\"$sort_merge\",\"lock_waited\":\"$lock_waited\"}"
}

binlog_enabled() {
    export LD_LIBRARY_PATH=/www/server/mysql/lib
    /www/server/mysql/bin/mariadb --socket="$SOCKFILE" -uroot -N -e "SHOW VARIABLES LIKE 'log_bin'" 2>/dev/null | awk '{print $2}'
}

get_mysql_binlog() {
    if [ ! -f "$MYSQLD_BIN" ]; then
        echo '{"error":"not installed"}'
        exit 1
    fi
    enabled=$(binlog_enabled)
    [ -z "$enabled" ] && enabled="OFF"
    fmt_size() {
        b=$1
        if [ "$b" -ge 1073741824 ]; then echo "$(awk "BEGIN{printf \"%.2f\", $b/1073741824}") GB"
        elif [ "$b" -ge 1048576 ]; then echo "$(awk "BEGIN{printf \"%.2f\", $b/1048576}") MB"
        elif [ "$b" -ge 1024 ]; then echo "$(awk "BEGIN{printf \"%.2f\", $b/1024}") KB"
        else echo "${b} B"; fi
    }
    total_size=0
    logs=""
    if [ "$enabled" = "ON" ]; then
        while read -r name size; do
            [ -z "$name" ] && continue
            logfile="$DATA_DIR/$name"
            mod_time=""
            if [ -f "$logfile" ]; then
                mod_time=$(date -r "$logfile" '+%Y-%m-%d %H:%M:%S')
            fi
            logs="$logs{\"name\":\"$name\",\"size\":\"$(fmt_size "$size")\",\"time\":\"$mod_time\"},"
            total_size=$(( total_size + size ))
        done << EOF
$(/www/server/mysql/bin/mariadb --socket="$SOCKFILE" -uroot -N -e "SHOW BINARY LOGS" 2>/dev/null)
EOF
        logs="${logs%,}"
    fi
    echo "{\"enabled\":\"$enabled\",\"size\":\"$(fmt_size "$total_size")\",\"logs\":[${logs}]}"
}

set_mysql_binlog() {
    tmp=""
    if [ -n "${PLUGIN_ARGS:-}" ]; then
        tmp=$(mktemp)
        echo "$PLUGIN_ARGS" > "$tmp"
    fi
    if [ -z "$tmp" ] && [ -f "/tmp/mysql_binlog.json" ]; then
        tmp="/tmp/mysql_binlog.json"
    fi
    if [ -z "$tmp" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    enable=$(jq -r '.enabled // empty' "$tmp" 2>/dev/null)
    if [ -z "$enable" ]; then
        echo '{"error":"bad param"}'
        exit 1
    fi
    conf="$MY_CNF"
    [ -f "$conf" ] && cp "$conf" "$conf.bak" || { echo '{"error":"conf missing"}'; exit 1; }

    if [ "$enable" = "on" ]; then
        if grep -qiE "^\s*log[-_]bin\s*=" "$conf"; then
            sed -i "s/^\(\s*log[-_]bin\s*=\s*\).*/\1\/www\/server\/data\/mysql-bin/" "$conf"
        else
            sed -i "/^\[mysqld\]/a log-bin=/www/server/data/mysql-bin" "$conf"
        fi
        if ! grep -qiE "^\s*expire_logs_days" "$conf"; then
            sed -i "/^\[mysqld\]/a expire_logs_days=10" "$conf"
        fi
    else
        sed -i "/^\s*log[-_]bin\s*=/d" "$conf"
        sed -i "/^\s*expire_logs_days\s*=/d" "$conf"
    fi

    rm -f "$tmp" "$conf.bak"
    restart
    echo '{"ok":true}'
}

delete_mysql_binlog() {
    tmp=""
    if [ -n "${PLUGIN_ARGS:-}" ]; then
        tmp=$(mktemp)
        echo "$PLUGIN_ARGS" > "$tmp"
    fi
    if [ -z "$tmp" ] && [ -f "/tmp/mysql_binlog_del.json" ]; then
        tmp="/tmp/mysql_binlog_del.json"
    fi
    if [ -z "$tmp" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    logname=$(jq -r '.name // empty' "$tmp" 2>/dev/null)
    if [ -z "$logname" ]; then
        echo '{"error":"bad param"}'
        exit 1
    fi
    export LD_LIBRARY_PATH=/www/server/mysql/lib
    if /www/server/mysql/bin/mariadb --socket="$SOCKFILE" -uroot -e "PURGE BINARY LOGS TO '$logname'" >/dev/null 2>&1; then
        rm -f "$tmp"
        echo '{"ok":true}'
    else
        echo '{"error":"purge failed"}'
        exit 1
    fi
}

get_mysql_port() {
    port=$(grep -iE "^\s*port\s*=" "$MY_CNF" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' ')
    [ -z "$port" ] && port="3306"
    echo "{\"port\":\"$port\"}"
}

set_mysql_port() {
    tmp=""
    if [ -n "${PLUGIN_ARGS:-}" ]; then
        tmp=$(mktemp)
        echo "$PLUGIN_ARGS" > "$tmp"
    fi
    if [ -z "$tmp" ] && [ -f "/tmp/mysql_port.json" ]; then
        tmp="/tmp/mysql_port.json"
    fi
    if [ -z "$tmp" ]; then
        echo '{"error":"no data"}'
        exit 1
    fi
    port=$(jq -r '.port // empty' "$tmp" 2>/dev/null)
    if [ -z "$port" ] || ! echo "$port" | grep -qE '^[0-9]+$'; then
        echo '{"error":"bad port"}'
        exit 1
    fi
    cp "$MY_CNF" "$MY_CNF.bak"
    if grep -qiE "^\s*port\s*=" "$MY_CNF"; then
        sed -i "s/^\(\s*port\s*=\s*\).*/\1${port}/" "$MY_CNF"
    else
        sed -i "/^\[mysqld\]/a port = ${port}" "$MY_CNF"
    fi
    rm -f "$MY_CNF.bak"
    restart >/dev/null 2>&1
    echo '{"ok":true}'
}
