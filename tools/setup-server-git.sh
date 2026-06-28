#!/bin/bash
set -e

mkdir -p ~/.ssh
chmod 700 ~/.ssh

if [ ! -f ~/.ssh/offrez_deploy ]; then
    ssh-keygen -t ed25519 -C "offrly-cm3588-deploy" -f ~/.ssh/offrez_deploy -N ""
fi

chmod 600 ~/.ssh/offrez_deploy
chmod 644 ~/.ssh/offrez_deploy.pub

if ! grep -q "Host github.com-offrez" ~/.ssh/config 2>/dev/null; then
    cat >> ~/.ssh/config <<'EOF'

Host github.com-offrez
  HostName github.com
  User git
  IdentityFile ~/.ssh/offrez_deploy
  IdentitiesOnly yes
EOF
fi
chmod 600 ~/.ssh/config

cd ~/offrly
git init
git config user.email "deploy@offrez.net"
git config user.name "OFFREZ Deploy"

if git remote | grep -q '^origin$'; then
    git remote set-url origin git@github.com-offrez:baltrados/offrez.net.git
else
    git remote add origin git@github.com-offrez:baltrados/offrez.net.git
fi

echo "--- DEPLOY_KEY_PUB ---"
cat ~/.ssh/offrez_deploy.pub
echo "--- GIT_REMOTE ---"
git remote -v
