#!/bin/bash
set -euo pipefail

echo "Flushing existing rules..."
iptables -F
iptables -X
ipset destroy allowed-domains 2>/dev/null || true

ipset create allowed-domains hash:net

echo "Fetching GitHub's published IP ranges..."
curl -s https://api.github.com/meta | node -e "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const all = [...data.git, ...data.web, ...data.api, ...(data.packages || [])];
  console.log(all.join('\n'));
" | while read -r cidr; do
  ipset add allowed-domains "$cidr" 2>/dev/null || true
done

echo "Adding remaining static allowlist..."
for domain in registry.npmjs.org pypi.org files.pythonhosted.org; do
  for ip in $(getent ahosts "$domain" | awk '{print $1}' | sort -u); do
    ipset add allowed-domains "$ip" 2>/dev/null || true
  done
done

echo "Locking down default-deny..."
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT

ALLOWED_DOMAINS=(
  "api.anthropic.com"
  "npmx.dev"
  "npmjs.com"
  "registry.npmjs.org"
  "github.com"
  "codeload.github.com"
  "pypi.org"
  "files.pythonhosted.org"
)

for domain in "${ALLOWED_DOMAINS[@]}"; do
  ips=$(getent ahosts "$domain" | awk '{print $1}' | sort -u)
  for ip in $ips; do
    iptables -A OUTPUT -d "$ip" -p tcp --dport 443 -j ACCEPT
  done
done

iptables -A OUTPUT -m set --match-set allowed-domains dst -p tcp --dport 443 -j ACCEPT

echo "Firewall active. $(ipset list allowed-domains | grep -c '^[0-9]') ranges allowlisted."