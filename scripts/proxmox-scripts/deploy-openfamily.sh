#!/bin/bash

#############################################
# OpenFamily - Proxmox Deployment Script
# Automatically deploys OpenFamily in a LXC container
#############################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="openfamily"
CONTAINER_HOSTNAME="openfamily"
DEFAULT_STORAGE="local-lvm"
DEFAULT_TEMPLATE="debian-13"
DEFAULT_CORES=2
DEFAULT_MEMORY=2048
DEFAULT_DISK=10
DEFAULT_BRIDGE="vmbr0"

echo -e "${BLUE}"
echo "============================================="
echo "  OpenFamily - Proxmox Deployment Script"
echo "============================================="
echo -e "${NC}"

# Check if running on Proxmox
if ! command -v pct &> /dev/null; then
    echo -e "${RED}Error: This script must be run on a Proxmox VE server${NC}"
    exit 1
fi

# Interactive configuration
read -p "Enter container name [openfamily]: " INPUT_NAME
CONTAINER_NAME="${INPUT_NAME:-$CONTAINER_NAME}"

read -p "Enter number of CPU cores [2]: " INPUT_CORES
CORES="${INPUT_CORES:-$DEFAULT_CORES}"

read -p "Enter memory in MB [2048]: " INPUT_MEMORY
MEMORY="${INPUT_MEMORY:-$DEFAULT_MEMORY}"

read -p "Enter disk size in GB [10]: " INPUT_DISK
DISK="${INPUT_DISK:-$DEFAULT_DISK}"

read -p "Enter storage pool [$DEFAULT_STORAGE]: " INPUT_STORAGE
STORAGE="${INPUT_STORAGE:-$DEFAULT_STORAGE}"

read -p "Enter network bridge [$DEFAULT_BRIDGE]: " INPUT_BRIDGE
BRIDGE="${INPUT_BRIDGE:-$DEFAULT_BRIDGE}"

read -p "Use DHCP for IP? [Y/n]: " USE_DHCP
USE_DHCP="${USE_DHCP:-Y}"

if [[ ! "$USE_DHCP" =~ ^[Yy]$ ]]; then
    read -p "Enter static IP (CIDR format, e.g., 192.168.1.100/24): " STATIC_IP
    read -p "Enter gateway IP: " GATEWAY_IP
fi

# Find next available CT ID
CTID=$(pvesh get /cluster/nextid)
echo -e "${GREEN}Using Container ID: $CTID${NC}"

# Download Debian template if not exists
echo -e "${YELLOW}Checking Debian template...${NC}"
if ! pveam list $STORAGE 2>/dev/null | grep -q "debian-13"; then
    echo -e "${YELLOW}Downloading Debian 13 template...${NC}"
    pveam download $STORAGE debian-13-standard_13.0-1_amd64.tar.zst 2>/dev/null || {
        echo -e "${YELLOW}Template download failed, trying alternative method...${NC}"
        pveam update
        pveam download $STORAGE debian-13-standard_13.0-1_amd64.tar.zst
    }
fi

TEMPLATE=$(pveam list $STORAGE 2>/dev/null | grep -E "debian.*13" | awk '{print $1}' | head -n1)

# If no Debian 13 template found, use any available Debian template
if [ -z "$TEMPLATE" ]; then
    echo -e "${YELLOW}Debian 13 not found, checking for other Debian versions...${NC}"
    TEMPLATE=$(pveam list $STORAGE 2>/dev/null | grep "debian" | awk '{print $1}' | head -n1)
fi

if [ -z "$TEMPLATE" ]; then
    echo -e "${RED}No Debian template found in $STORAGE!${NC}"
    echo -e "${YELLOW}Available templates:${NC}"
    pveam list $STORAGE
    exit 1
fi

echo -e "${GREEN}Using template: $TEMPLATE${NC}"

# Create LXC container
echo -e "${YELLOW}Creating LXC container...${NC}"

if [[ "$USE_DHCP" =~ ^[Yy]$ ]]; then
    pct create $CTID $TEMPLATE \
        --hostname $CONTAINER_HOSTNAME \
        --cores $CORES \
        --memory $MEMORY \
        --swap 512 \
        --storage $STORAGE \
        --rootfs $STORAGE:$DISK \
        --net0 name=eth0,bridge=$BRIDGE,ip=dhcp \
        --features nesting=1 \
        --unprivileged 1 \
        --onboot 1
else
    pct create $CTID $TEMPLATE \
        --hostname $CONTAINER_HOSTNAME \
        --cores $CORES \
        --memory $MEMORY \
        --swap 512 \
        --storage $STORAGE \
        --rootfs $STORAGE:$DISK \
        --net0 name=eth0,bridge=$BRIDGE,ip=$STATIC_IP,gw=$GATEWAY_IP \
        --features nesting=1 \
        --unprivileged 1 \
        --onboot 1
fi

echo -e "${GREEN}Container created successfully!${NC}"

# Start container
echo -e "${YELLOW}Starting container...${NC}"
pct start $CTID

# Wait for container to be ready
echo -e "${YELLOW}Waiting for container to start...${NC}"
sleep 10

# Execute setup commands inside container
echo -e "${YELLOW}Installing dependencies...${NC}"
pct exec $CTID -- bash -c "
    set -e
    
    # Update system
    apt-get update
    apt-get upgrade -y
    
    # Install required packages
    apt-get install -y curl git ca-certificates gnupg lsb-release
    
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    
    # Install Docker Compose
    curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m) -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    # Enable Docker service
    systemctl enable docker
    systemctl start docker
    
    # Clone OpenFamily repository
    cd /opt
    git clone https://github.com/NexaFlowFrance/OpenFamily.git
    cd OpenFamily
    
    # Start services
    docker compose up -d
    
    echo ''
    echo '=============================================='
    echo '  OpenFamily Installation Complete!'
    echo '=============================================='
    echo ''
"

# Get container IP
sleep 5
CONTAINER_IP=$(pct exec $CTID -- hostname -I | awk '{print $1}')

# Get generated database password
DB_PASSWORD=$(pct exec $CTID -- cat /opt/OpenFamily/shared/.db_password 2>/dev/null || echo "Check /opt/OpenFamily/shared/.db_password")

echo -e "${GREEN}"
echo "=============================================="
echo "  Installation Complete!"
echo "=============================================="
echo -e "${NC}"
echo -e "Container ID: ${BLUE}$CTID${NC}"
echo -e "Container Name: ${BLUE}$CONTAINER_NAME${NC}"
echo -e "IP Address: ${BLUE}$CONTAINER_IP${NC}"
echo ""
echo -e "OpenFamily URL: ${GREEN}http://$CONTAINER_IP:3000${NC}"
echo -e "Database Password: ${YELLOW}$DB_PASSWORD${NC}"
echo ""
echo -e "${YELLOW}Save this password in a secure location!${NC}"
echo ""
echo "Useful commands:"
echo -e "  ${BLUE}pct enter $CTID${NC}          - Enter container"
echo -e "  ${BLUE}pct stop $CTID${NC}           - Stop container"
echo -e "  ${BLUE}pct start $CTID${NC}          - Start container"
echo -e "  ${BLUE}pct destroy $CTID${NC}        - Delete container"
echo ""
echo "Inside container:"
echo -e "  ${BLUE}cd /opt/OpenFamily && docker compose logs${NC}       - View logs"
echo -e "  ${BLUE}cd /opt/OpenFamily && docker compose restart${NC}    - Restart services"
echo ""
echo -e "${GREEN}Enjoy OpenFamily! 🎉${NC}"
