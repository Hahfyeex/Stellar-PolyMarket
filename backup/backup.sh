#!/bin/bash

# PostgreSQL Automated Backup Script with S3 Integration
# Creates encrypted snapshots every 6 hours for 24-hour recovery plan

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
# Expected format: postgresql://user:password@host:port/database
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

# Backup configuration
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="stellar_polymarket_backup_${TIMESTAMP}.sql"
BACKUP_PATH="/tmp/$BACKUP_FILENAME"
COMPRESSED_BACKUP_PATH="${BACKUP_PATH}.gz"
S3_KEY="backups/postgresql/$BACKUP_FILENAME.gz"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Cleanup function
cleanup() {
    if [[ -f "$BACKUP_PATH" ]]; then
        rm -f "$BACKUP_PATH"
    fi
    if [[ -f "$COMPRESSED_BACKUP_PATH" ]]; then
        rm -f "$COMPRESSED_BACKUP_PATH"
    fi
}

# Set trap for cleanup
trap cleanup EXIT

log "Starting PostgreSQL backup process..."

# Check if pg_dump is available
if ! command -v pg_dump &> /dev/null; then
    log "Error: pg_dump is not installed or not in PATH"
    exit 1
fi

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    log "Error: AWS CLI is not installed or not in PATH"
    exit 1
fi

# Create database backup
log "Creating database backup: $BACKUP_FILENAME"
PGPASSWORD="$DB_PASSWORD" pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --verbose \
    --clean \
    --if-exists \
    --create \
    --format=plain \
    --no-owner \
    --no-privileges \
    > "$BACKUP_PATH"

if [[ $? -ne 0 ]]; then
    log "Error: pg_dump failed"
    exit 1
fi

# Compress the backup
log "Compressing backup file..."
gzip "$BACKUP_PATH"

if [[ $? -ne 0 ]]; then
    log "Error: Compression failed"
    exit 1
fi

# Verify compressed file exists
if [[ ! -f "$COMPRESSED_BACKUP_PATH" ]]; then
    log "Error: Compressed backup file not found"
    exit 1
fi

# Get file size for logging
FILE_SIZE=$(stat -c%s "$COMPRESSED_BACKUP_PATH")
log "Backup created successfully. Size: $FILE_SIZE bytes"

# Upload to S3 with server-side encryption
log "Uploading backup to S3: s3://$S3_BUCKET_NAME/$S3_KEY"
aws s3 cp "$COMPRESSED_BACKUP_PATH" "s3://$S3_BUCKET_NAME/$S3_KEY" \
    --region "$AWS_REGION" \
    --server-side-encryption AES256 \
    --metadata "backup-timestamp=$TIMESTAMP,database=$DB_NAME,source=stellar-polymarket"

if [[ $? -ne 0 ]]; then
    log "Error: S3 upload failed"
    exit 1
fi

# Verify upload
log "Verifying S3 upload..."
if aws s3 ls "s3://$S3_BUCKET_NAME/$S3_KEY" --region "$AWS_REGION" &> /dev/null; then
    log "✅ Backup successfully uploaded to S3"
    log "📁 S3 Path: s3://$S3_BUCKET_NAME/$S3_KEY"
    log "🕒 Timestamp: $TIMESTAMP"
    log "📊 Size: $FILE_SIZE bytes"
else
    log "Error: S3 upload verification failed"
    exit 1
fi

# Cleanup old backups (keep last 4 backups = 24 hours worth)
log "Cleaning up old backups (keeping last 4 backups)..."
OLD_BACKUPS=$(aws s3 ls "s3://$S3_BUCKET_NAME/backups/postgresql/" --region "$AWS_REGION" | \
    grep "stellar_polymarket_backup_" | \
    sort -r | \
    tail -n +5 | \
    awk '{print $4}')

if [[ -n "$OLD_BACKUPS" ]]; then
    for old_backup in $OLD_BACKUPS; do
        log "Deleting old backup: $old_backup"
        aws s3 rm "s3://$S3_BUCKET_NAME/backups/postgresql/$old_backup" --region "$AWS_REGION"
    done
else
    log "No old backups to clean up"
fi

log "🎉 Backup process completed successfully!"

# Optional: Send notification (you can customize this)
# log "Sending backup completion notification..."
# curl -X POST "your-webhook-url" -d "message=PostgreSQL backup completed: $TIMESTAMP"
