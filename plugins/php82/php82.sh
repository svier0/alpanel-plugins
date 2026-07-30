#!/bin/sh
set -eu

VER=82
PHP_DIR="/www/server/php/$VER"
BIN_DIR="$PHP_DIR/bin"
LIB_DIR="$PHP_DIR/lib"
CONF_DIR="$PHP_DIR/conf"
RUN_DIR="$PHP_DIR/run"
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

    cat > "$FPM_CONF" << 'EOF'
[global]
pid = VERRUN/php-fpm.pid
error_log = /www/wwwlogs/php-fpmVER.log
include=/www/server/php/VER/conf/php-fpm.d/*.conf
EOF
    sed -i "s|VERRUN|$RUN_DIR|g; s|VER|$VER|g" "$FPM_CONF"

    mkdir -p "$CONF_DIR/php-fpm.d"
    cat > "$CONF_DIR/php-fpm.d/www.conf" << 'EOF'
[www]
user = www
group = www
listen = /www/server/php/VER/run/php-fpmVER.sock
listen.owner = www
listen.group = www
pm = dynamic
pm.max_children = 5
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
EOF
    sed -i "s|VER|$VER|g" "$CONF_DIR/php-fpm.d/www.conf"

    cat > "/etc/init.d/php$VER" << 'PHINIT'
#!/bin/sh

PHP_FPM_BIN="/www/server/php/__VER__/bin/php-fpm__VER__"
PHP_FPM_CONF="/www/server/php/__VER__/conf/php-fpm.conf"
PIDFILE="/www/server/php/__VER__/run/php-fpm.pid"

start() {
    mkdir -p /www/server/php/__VER__/run
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
    "$PHP_BIN" -v 2>&1 | sed 's/PHP \([0-9.]*\).*/\1/'
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