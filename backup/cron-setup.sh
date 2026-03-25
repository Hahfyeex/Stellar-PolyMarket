#!/bin/bash

# Cron Job Setup Script for Automated PostgreSQL Backups
# Sets up automated backup to run every 6 hours

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"
CRON_ENTRY="0 */6 * * * $BACKUP_SCRIPT >> $SCRIPT_DIR/logs/backup.log 2>&1"

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

# Check if backup script exists and is executable
if [[ ! -f "$BACKUP_SCRIPT" ]]; then
    error "Backup script not found: $BACKUP_SCRIPT"
    exit 1
fi

if [[ ! -x "$BACKUP_SCRIPT" ]]; then
    log "Making backup script executable..."
    chmod +x "$BACKUP_SCRIPT"
fi

# Create logs directory
LOGS_DIR="$SCRIPT_DIR/logs"
if [[ ! -d "$LOGS_DIR" ]]; then
    log "Creating logs directory: $LOGS_DIR"
    mkdir -p "$LOGS_DIR"
fi

# Check if cron entry already exists
log "Checking existing cron jobs..."
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    warn "Cron job for backup script already exists"
    echo "Current cron entry:"
    crontab -l 2>/dev/null | grep "$BACKUP_SCRIPT" || true
    echo ""
    echo "To remove existing cron job, run: $0 remove"
    echo "To update cron job, run: $0 update"
    exit 0
fi

# Add cron entry
log "Adding cron job for automated backups..."
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

if [[ $? -eq 0 ]]; then
    log "✅ Cron job added successfully!"
    log "📅 Schedule: Every 6 hours (at 00:00, 06:00, 12:00, 18:00)"
    log "📝 Log file: $LOGS_DIR/backup.log"
    log "🔧 Backup script: $BACKUP_SCRIPT"
    echo ""
    log "Next backup times:"
    for i in {0..3}; do
        NEXT_TIME=$(date -d "+$(($i * 6)) hours" "+%Y-%m-%d %H:%M:%S")
        log "  - $NEXT_TIME"
    done
    echo ""
    log "To view cron jobs: crontab -l"
    log "To remove cron job: $0 remove"
    log "To test backup manually: $BACKUP_SCRIPT"
else
    error "Failed to add cron job"
    exit 1
fi

# Optional: Test backup immediately
echo ""
read -p "Do you want to test the backup script now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "Running backup test..."
    "$BACKUP_SCRIPT"
fi
