#!/usr/bin/env bash
# 自签 CA 与服务端证书生成（D8-A 内网 HTTPS）
# 用法：scripts/gen-certs.sh [服务器IP或域名，可多个，空格分隔]
# 产物：deploy/certs/{ca.pem,ca.key,server.pem,server.key}
# 服务端 IP 变化时重新执行并用新 IP 再生成（只需重建 admin-web 容器，终端 APK 无需变更）
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash 会把 /CN=... 当路径转换，禁用之
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"
mkdir -p deploy/certs

HOSTS="${*:-}"

# 1. CA（已存在则复用，保持终端内置信任不变）
if [ ! -f deploy/certs/ca.key ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout deploy/certs/ca.key -out deploy/certs/ca.pem \
    -subj "/CN=CPS Root CA/O=content-publish-system/C=CN" 2>/dev/null
  echo "CA 已生成：deploy/certs/ca.pem"
else
  echo "复用已有 CA：deploy/certs/ca.pem"
fi

# 2. 服务端证书 SAN：localhost + 127.0.0.1 + 传入的主机/IP
SAN="DNS:localhost,IP:127.0.0.1"
for h in $HOSTS; do
  if [[ "$h" =~ ^[0-9.]+$ ]]; then SAN="$SAN,IP:$h"; else SAN="$SAN,DNS:$h"; fi
done
echo "SAN = $SAN"

# CSR（已有 key 则复用，否则新生成）
if [ ! -f deploy/certs/server.key ]; then
  openssl genrsa -out deploy/certs/server.key 2048 2>/dev/null
fi
openssl req -new -key deploy/certs/server.key -out deploy/certs/server.csr \
  -subj "/CN=content-publish-server/O=content-publish-system/C=CN"

# SAN 扩展文件（用相对路径，避免 mingw openssl 打不开 MSYS /tmp）
printf "subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n" "$SAN" > deploy/certs/san.ext
openssl x509 -req -in deploy/certs/server.csr \
  -CA deploy/certs/ca.pem -CAkey deploy/certs/ca.key -CAcreateserial \
  -days 1825 -out deploy/certs/server.pem -extfile deploy/certs/san.ext 2>/dev/null
rm -f deploy/certs/server.csr deploy/certs/san.ext deploy/certs/ca.srl

echo "服务端证书已生成：deploy/certs/server.pem（5 年）"
openssl x509 -in deploy/certs/server.pem -noout -subject -ext subjectAltName
