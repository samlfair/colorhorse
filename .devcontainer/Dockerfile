FROM mcr.microsoft.com/devcontainers/javascript-node:24-bullseye

ARG USERNAME=node

# System deps + firewall tooling
RUN apt-get update && apt-get install -y \
    iptables ipset git curl sudo \
    && apt-get clean

# Persist shell history in a volume-friendly location
RUN mkdir /commandhistory \
    && touch /commandhistory/.bash_history \
    && chown -R $USERNAME /commandhistory \
    && echo 'export HISTFILE=/commandhistory/.bash_history' >> /home/$USERNAME/.bashrc

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Fix ownership so $USERNAME can write to the npm global prefix (needed for auto-update)
RUN chown -R $USERNAME:$USERNAME "$(npm config get prefix)"

# Claude config dir (backed by the named volume from devcontainer.json)
RUN mkdir -p /home/$USERNAME/.claude && chown -R $USERNAME /home/$USERNAME/.claude

# Allow the firewall script to run with sudo, nothing else
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh \
    && echo "$USERNAME ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" >> /etc/sudoers.d/$USERNAME

USER $USERNAME
WORKDIR /workspace