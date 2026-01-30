#!/bin/bash

#############################################
# OpenFamily - Proxmox VM Deployment Script
# Automatically deploys OpenFamily in a Virtual Machine
#############################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
VM_NAME="openfamily"
DEFAULT_STORAGE="local-lvm"
DEFAULT_ISO_STORAGE="local"
DEFAULT_CORES=2
DEFAULT_MEMORY=2048
DEFAULT_DISK=20
DEFAULT_BRIDGE="vmbr0"
DEBIAN_ISO="debian-13.0.0-amd64-netinst.iso"

echo -e "${BLUE}"
echo "============================================="
echo "  OpenFamily - Proxmox VM Deployment"
echo "============================================="
echo -e "${NC}"

if ! command -v qm &> /dev/null; then
    echo -e "${RED}Error: This script must be run on a Proxmox VE server${NC}"
    exit 1
fi

# Configuration interactive
read -p "Enter VM name [openfamily]: " INPUT_NAME
VM_NAME="${INPUT_NAME:-$VM_NAME}"

read -p "Enter number of CPU cores [2]: " INPUT_CORES
CORES="${INPUT_CORES:-$DEFAULT_CORES}"

read -p "Enter memory in MB [2048]: " INPUT_MEMORY
MEMORY="${INPUT_MEMORY:-$DEFAULT_MEMORY}"

read -p "Enter disk size in GB [20]: " INPUT_DISK
DISK="${INPUT_DISK:-$DEFAULT_DISK}"

read -p "Enter storage pool [$DEFAULT_STORAGE]: " INPUT_STORAGE
STORAGE="${INPUT_STORAGE:-$DEFAULT_STORAGE}"

read -p "Enter network bridge [$DEFAULT_BRIDGE]: " INPUT_BRIDGE
BRIDGE="${INPUT_BRIDGE:-$DEFAULT_BRIDGE}"

# Find next available VM ID
VMID=$(pvesh get /cluster/nextid)
echo -e "${GREEN}Using VM ID: $VMID${NC}"

# Check for Debian ISO
echo -e "${YELLOW}Checking for Debian ISO...${NC}"
if ! pvesm list $DEFAULT_ISO_STORAGE --content iso | grep -q "$DEBIAN_ISO"; then
    echo -e "${RED}Debian ISO not found!${NC}"
    echo -e "${YELLOW}Please download Debian 13 ISO:${NC}"
    echo "  1. Go to Proxmox web interface"
    echo "  2. Select your node > $DEFAULT_ISO_STORAGE > ISO Images"
    echo "  3. Download or upload: $DEBIAN_ISO"
    echo ""
    echo "Or run:"
    echo "  cd /var/lib/vz/template/iso"
    echo "  wget https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.0.0-amd64-netinst.iso"
    exit 1
fi

# Create VM
echo -e "${YELLOW}Creating Virtual Machine...${NC}"

qm create $VMID \
    --name $VM_NAME \
    --cores $CORES \
    --memory $MEMORY \
    --net0 virtio,bridge=$BRIDGE \
    --scsihw virtio-scsi-pci \
    --scsi0 $STORAGE:$DISK \
    --ide2 $DEFAULT_ISO_STORAGE:iso/$DEBIAN_ISO,media=cdrom \
    --boot order=scsi0 \
    --ostype l26 \
    --agent 1 \
    --onboot 1

echo -e "${GREEN}VM created successfully!${NC}"
echo ""
echo -e "${YELLOW}=============================================="
echo "  Manual Installation Required"
echo "=============================================${NC}"
echo ""
echo "1. Start the VM from Proxmox web interface"
echo "2. Install Debian 13"
echo "3. After installation, run these commands:"
echo ""
echo -e "${BLUE}# Update system${NC}"
echo "sudo apt update && sudo apt upgrade -y"
echo ""
echo -e "${BLUE}# Install Docker${NC}"
echo "curl -fsSL https://get.docker.com | sh"
echo ""
echo -e "${BLUE}# Install Docker Compose${NC}"
echo "sudo curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose"
echo "sudo chmod +x /usr/local/bin/docker-compose"
echo ""
echo -e "${BLUE}# Clone and start OpenFamily${NC}"
echo "cd /opt"
echo "sudo git clone https://github.com/NexaFlowFrance/OpenFamily.git"
echo "cd OpenFamily"
echo "sudo docker compose up -d"
echo ""
echo -e "${GREEN}OpenFamily will be available at: http://VM_IP:3000${NC}"
