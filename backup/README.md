# PostgreSQL Automated Backup Service

## Overview

This service provides automated PostgreSQL database backups with encrypted S3 storage for the Stellar PolyMarket application. It creates point-in-time snapshots every 6 hours and maintains a 24-hour recovery window (4 backups).

## Features

- ✅ Automated backups every 6 hours via cron
- ✅ PostgreSQL metadata snapshots using `pg_dump`
- ✅ AES256 encrypted S3 storage
- ✅ Automatic cleanup of old backups (keeps last 4)
- ✅ Comprehensive logging and error handling
- ✅ One-click restore functionality
- ✅ Backup verification and integrity checks

## Quick Setup

### 1. Prerequisites

```bash
# Install required tools
sudo apt-get update
sudo apt-get install -y postgresql-client awscli cron

# Verify installations
pg_dump --version
aws --version
```

### 2. Environment Configuration

Add these variables to your `.env` file:

```bash
# Database Configuration (already exists)
DATABASE_URL=postgresql://user:password@localhost:5432/stella_polymarket

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
S3_BUCKET_NAME=your_backup_bucket_name
AWS_REGION=us-east-1  # or your preferred region
```

### 3. S3 Bucket Setup

```bash
# Create S3 bucket with encryption
aws s3 mb s3://your_backup_bucket_name --region your_region
aws s3api put-bucket-encryption \
    --bucket your_backup_bucket_name \
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Create backups folder
aws s3api put-object --bucket your_backup_bucket_name --key backups/postgresql/ --region your_region
```

### 4. Enable Automated Backups

```bash
# Make scripts executable
chmod +x backup/*.sh

# Set up cron job (runs every 6 hours)
./backup/cron-setup.sh
```

## Step-by-Step Recovery Guide

### 🚨 Emergency Recovery Procedure

#### Scenario: Database Crash - Market Descriptions & Social Data Lost

**Recovery Time: < 15 minutes**

#### Step 1: Assess the Situation
```bash
# Check database status
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

# List available backups
./backup/restore.sh list
```

#### Step 2: Choose Recovery Point
```bash
# Option A: Restore from latest backup (recommended)
./backup/restore.sh latest

# Option B: Restore from specific backup
./backup/restore.sh backups/postgresql/stellar_polymarket_backup_20240325_120000.sql.gz
```

#### Step 3: Verify Recovery
```bash
# Check table count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

# Check critical tables
psql $DATABASE_URL -c "\dt"  # List all tables
psql $DATABASE_URL -c "SELECT COUNT(*) FROM market_descriptions;"  # Verify market data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM social_data;"  # Verify social data
```

#### Step 4: Restart Application
```bash
# Restart backend services
npm run dev  # or your production start command

# Verify application functionality
curl http://localhost:4000/health  # Check API health
```

### 📋 Detailed Recovery Commands

#### Manual Backup Creation (Before Restore)
```bash
# Create emergency backup of current state
./backup/backup.sh
```

#### Specific Point-in-Time Recovery
```bash
# List all available backups with timestamps
./backup/restore.sh list

# Restore from specific timestamp
./backup/restore.sh backups/postgresql/stellar_polymarket_backup_20240325_060000.sql.gz
```

#### Verification Checklist
- [ ] Database connection restored
- [ ] Market Descriptions table populated
- [ ] Social Data table populated
- [ ] Application API responding
- [ ] Frontend can access data
- [ ] No data corruption detected

## Manual Operations

### Run Backup Manually
```bash
./backup/backup.sh
```

### List Available Backups
```bash
./backup/restore.sh list
```

### Restore from Latest Backup
```bash
./backup/restore.sh latest
```

### Disable Automated Backups
```bash
./backup/cron-remove.sh
```

### View Backup Logs
```bash
tail -f backup/logs/backup.log
```

## Backup Schedule

| Time (UTC) | Backup Retention | Purpose |
|------------|------------------|---------|
| 00:00      | 24 hours         | Midnight snapshot |
| 06:00      | 24 hours         | Morning snapshot |
| 12:00      | 24 hours         | Midday snapshot |
| 18:00      | 24 hours         | Evening snapshot |

## File Structure

```
backup/
├── backup.sh          # Main backup script
├── restore.sh         # Database restore script
├── cron-setup.sh      # Automated backup setup
├── cron-remove.sh     # Automated backup removal
├── logs/
│   └── backup.log     # Backup execution logs
└── README.md          # This documentation
```

## Security Features

- 🔐 AES256 server-side encryption on S3
- 🔐 AWS credentials stored in environment variables
- 🔐 Backup files compressed and encrypted in transit
- 🔐 Automatic cleanup prevents data accumulation
- 🔐 Detailed logging for audit trails

## Troubleshooting

### Common Issues

#### 1. "pg_dump: command not found"
```bash
sudo apt-get install postgresql-client
```

#### 2. "AWS CLI not found"
```bash
sudo apt-get install awscli
```

#### 3. "Permission denied" on S3 upload
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify bucket permissions
aws s3 ls s3://your_bucket_name
```

#### 4. "Database connection failed"
```bash
# Test database connection
psql $DATABASE_URL -c "SELECT version();"
```

### Log Analysis

```bash
# View recent backup logs
tail -n 50 backup/logs/backup.log

# Search for errors
grep -i error backup/logs/backup.log

# Monitor backup success rate
grep -c "successfully" backup/logs/backup.log
```

## Monitoring & Alerts

### Backup Success Indicators
- ✅ Log entry: "Backup process completed successfully!"
- ✅ S3 object visible in bucket
- ✅ File size > 0 bytes
- ✅ Log file updated with timestamp

### Backup Failure Indicators
- ❌ Log entry: "Error:"
- ❌ No S3 object created
- ❌ Missing log entries
- ❌ Cron job not running

### Manual Health Check
```bash
# Check last backup
aws s3 ls s3://your_bucket_name/backups/postgresql/ --recursive | tail -1

# Check cron job status
crontab -l | grep backup

# Check log file age
ls -la backup/logs/backup.log
```

## Emergency Contacts

- **Database Administrator**: [Contact Info]
- **DevOps Team**: [Contact Info]
- **AWS Support**: [Contact Info]

## Version History

- **v1.0** - Initial implementation with 6-hour automated backups
- **v1.1** - Added encryption and cleanup features
- **v1.2** - Enhanced restore script with verification

---

**⚠️ Important**: Test this recovery procedure in a staging environment before relying on it for production recovery.
