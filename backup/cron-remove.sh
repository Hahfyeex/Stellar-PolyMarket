#!/bin/bash

# Cron Job Removal Script for PostgreSQL Backups
# Removes automated backup cron job

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# Check if cron entry exists
log "Checking for existing backup cron jobs..."
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    log "Found existing cron job(s):"
    crontab -l 2>/dev/null | grep "$BACKUP_SCRIPT" || true
    echo ""
    
    # Remove cron entry
    log "Removing cron job..."
    crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" | crontab -
    
    if [[ $? -eq 0 ]]; then
        log "✅ Cron job removed successfully!"
        log "📅 Automated backups have been disabled"
    else
        error "Failed to remove cron job"
        exit 1
    fi
else
    warn "No cron job found for backup script"
    exit 0
fi

# Show remaining cron jobs (if any)
if crontab -l 2>/dev/null | grep -q .; then
    echo ""
    log "Remaining cron jobs:"
    crontab -l 2>/dev/null || true
else
    echo ""
    log "No remaining cron jobs"
fi

echo ""
log "To re-enable automated backups, run: ./cron-setup.sh"
