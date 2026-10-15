#!/usr/bin/env bash
# One-time setup of a new Ubuntu server (Azure VM) for KaziForce (docs/DEPLOYMENT.md, step 3).
# Installs Docker from Docker's own package source and adds 2 GB of swap (extra memory on disk,
# so building the app on a small server does not run out of memory).
# Run from the repository folder:  bash deploy/azure/setup.sh
set -euo pipefail

echo "== Installing Docker =="
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" |
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
# Lets this user run docker without sudo (takes effect after logging in again).
sudo usermod -aG docker "$USER"

echo "== Adding 2 GB of swap =="
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== Settings file =="
if [ ! -f deploy/azure/.env ]; then
  cp deploy/azure/.env.example deploy/azure/.env
  chmod 600 deploy/azure/.env
  echo "Created deploy/azure/.env — fill it in next: nano deploy/azure/.env"
fi

echo
echo "Done. Log out and back in (type: exit, then connect again) so docker works without sudo."
