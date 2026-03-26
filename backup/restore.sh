#!/bin/bash

# PostgreSQL Restore Script from S3 Backup
# Restores database from encrypted S3 snapshot

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

# Load environment variables
if [[ -f "$ENV_FILE" ]]; then
    source "$ENV_FILE"
else
    echo "Error: .env file not found at $ENV_FILE"
    exit 1
fi

# Required environment variables
REQUIRED_VARS=("DATABASE_URL" "AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY" "S3_BUCKET_NAME" "AWS_REGION")

for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        echo "Error: Required environment variable $var is not set"
        exit 1
    fi
done

# Extract database connection details from DATABASE_URL
if [[ "$DATABASE_URL" =~ postgresql://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASSWORD="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
else
    echo "Error: Invalid DATABASE_URL format"
    exit 1
fi

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Cleanup function
cleanup() {
    if [[ -f "$RESTORE_PATH" ]]; then
        rm -f "$RESTORE_PATH"
    fi
    if [[ -f "$DECOMPRESSED_RESTORE_PATH" ]]; then
        rm -f "$DECOMPRESSED_RESTORE_PATH"
    fi
}

# Set trap for cleanup
trap cleanup EXIT

# Function to list available backups
list_backups() {
    log "Available backups in S3:"
    aws s3 ls "s3://$S3_BUCKET_NAME/backups/postgresql/" --region "$AWS_REGION" | \
        grep "stellar_polymarket_backup_" | \
        sort -r | \
        awk '{print NR ". " $4 " (Size: " $3 " bytes, Date: " $1 " " $2 ")"}'
}

# Function to restore from specific backup
restore_from_backup() {
    local backup_key="$1"
    local backup_filename=$(basename "$backup_key")
    local restore_path="/tmp/${backup_filename%.gz}"
    
    RESTORE_PATH="/tmp/$backup_filename"
    DECOMPRESSED_RESTORE_PATH="$restore_path"

    log "Starting restore process from: $backup_key"

    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        log "Error: psql is not installed or not in PATH"
        exit 1
    fi

    # Check if AWS CLI is available
    if ! command -v aws &> /dev/null; then
        log "Error: AWS CLI is not installed or not in PATH"
        exit 1
    fi

    # Download backup from S3
    log "Downloading backup from S3..."
    aws s3 cp "s3://$S3_BUCKET_NAME/$backup_key" "$RESTORE_PATH" --region "$AWS_REGION"

    if [[ $? -ne 0 ]]; then
        log "Error: Failed to download backup from S3"
        exit 1
    fi

    # Decompress the backup
    log "Decompressing backup file..."
    gunzip -c "$RESTORE_PATH" > "$DECOMPRESSED_RESTORE_PATH"

    if [[ $? -ne 0 ]]; then
        log "Error: Decompression failed"
        exit 1
    fi

    # Verify decompressed file exists and is not empty
    if [[ ! -s "$DECOMPRESSED_RESTORE_PATH" ]]; then
        log "Error: Decompressed backup file is empty or not found"
        exit 1
    fi

    # Create a backup of current database before restore (optional)
    log "Creating backup of current database before restore..."
    CURRENT_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    CURRENT_BACKUP="/tmp/current_db_backup_$CURRENT_TIMESTAMP.sql"
    
    PGPASSWORD="$DB_PASSWORD" pg_dump \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        --clean \
        --if-exists \
        --create \
        --format=plain \
        --no-owner \
        --no-privileges \
        > "$CURRENT_BACKUP" || true

    # Drop existing database and recreate
    log "Dropping and recreating database..."
    PGPASSWORD="$DB_PASSWORD" psql \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --username="$DB_USER" \
        --dbname=postgres \
        -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" \
        -c "CREATE DATABASE \"$DB_NAME\";"

    if [[ $? -ne 0 ]]; then
        log "Error: Failed to drop and recreate database"
        exit 1
    fi

    # Restore database from backup
    log "Restoring database from backup..."
    PGPASSWORD="$DB_PASSWORD" psql \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        < "$DECOMPRESSED_RESTORE_PATH"

    if [[ $? -ne 0 ]]; then
        log "Error: Database restore failed"
        log "Current database backup available at: $CURRENT_BACKUP"
        exit 1
    fi

    log "✅ Database restore completed successfully!"
    log "📁 Restored from: $backup_key"
    log "🕒 Restore timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    
    # Verify restore
    log "Verifying database restore..."
    TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')

    log "📊 Database contains $TABLE_COUNT tables"

    # Clean up current backup if restore was successful
    if [[ -f "$CURRENT_BACKUP" ]]; then
        rm -f "$CURRENT_BACKUP"
    fi
}

# Main execution
main() {
    log "PostgreSQL Restore Script"
    log "========================"

    # Check command line arguments
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 [backup-key|list]"
        echo ""
        echo "Options:"
        echo "  list                    - List available backups"
        echo "  backup-key              - Restore from specific backup (e.g., backups/postgresql/stellar_polymarket_backup_20240325_120000.sql.gz)"
        echo "  latest                  - Restore from the latest backup"
        echo ""
        exit 1
    fi

    case "$1" in
        "list")
            list_backups
            ;;
        "latest")
            log "Finding latest backup..."
            LATEST_BACKUP=$(aws s3 ls "s3://$S3_BUCKET_NAME/backups/postgresql/" --region "$AWS_REGION" | \
                grep "stellar_polymarket_backup_" | \
                sort -r | \
                head -n 1 | \
                awk '{print $4}')
            
            if [[ -z "$LATEST_BACKUP" ]]; then
                log "Error: No backups found"
                exit 1
            fi
            
            log "Latest backup found: $LATEST_BACKUP"
            restore_from_backup "backups/postgresql/$LATEST_BACKUP"
            ;;
        *)
            if [[ "$1" == backups/postgresql/* ]]; then
                restore_from_backup "$1"
            else
                log "Error: Invalid backup key format. Use 'backups/postgresql/filename.sql.gz'"
                exit 1
            fi
            ;;
    esac
}

# Run main function with all arguments
main "$@"
