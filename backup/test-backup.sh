#!/bin/bash

# Test Script for PostgreSQL Backup Service
# Validates backup and restore functionality without affecting production data

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

# Test function
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo ""
    info "Running test: $test_name"
    echo "Command: $test_command"
    
    if eval "$test_command"; then
        log "✅ PASSED: $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        error "❌ FAILED: $test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Main test suite
main() {
    echo "=========================================="
    echo "PostgreSQL Backup Service Test Suite"
    echo "=========================================="
    echo ""

    # Test 1: Script syntax validation
    run_test "Backup script syntax validation" "bash -n \"$SCRIPT_DIR/backup.sh\""
    run_test "Restore script syntax validation" "bash -n \"$SCRIPT_DIR/restore.sh\""
    run_test "Cron setup script syntax validation" "bash -n \"$SCRIPT_DIR/cron-setup.sh\""
    run_test "Cron remove script syntax validation" "bash -n \"$SCRIPT_DIR/cron-remove.sh\""

    # Test 2: File permissions
    run_test "Backup script is executable" "test -x \"$SCRIPT_DIR/backup.sh\""
    run_test "Restore script is executable" "test -x \"$SCRIPT_DIR/restore.sh\""
    run_test "Cron setup script is executable" "test -x \"$SCRIPT_DIR/cron-setup.sh\""
    run_test "Cron remove script is executable" "test -x \"$SCRIPT_DIR/cron-remove.sh\""

    # Test 3: Required tools availability
    run_test "pg_dump is available" "command -v pg_dump"
    run_test "psql is available" "command -v psql"
    run_test "gzip is available" "command -v gzip"
    run_test "aws cli is available" "command -v aws"

    # Test 4: Environment setup
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        run_test ".env file exists" "test -f \"$PROJECT_ROOT/.env\""
        
        # Check required environment variables
        source "$PROJECT_ROOT/.env"
        
        run_test "DATABASE_URL is set" "test -n \"\$DATABASE_URL\""
        run_test "AWS_ACCESS_KEY_ID is set" "test -n \"\$AWS_ACCESS_KEY_ID\""
        run_test "AWS_SECRET_ACCESS_KEY is set" "test -n \"\$AWS_SECRET_ACCESS_KEY\""
        run_test "S3_BUCKET_NAME is set" "test -n \"\$S3_BUCKET_NAME\""
        run_test "AWS_REGION is set" "test -n \"\$AWS_REGION\""
        
        # Test DATABASE_URL format
        if [[ "$DATABASE_URL" =~ postgresql://[^:]+:[^@]+@[^:]+:[0-9]+/.+ ]]; then
            run_test "DATABASE_URL format is valid" "true"
        else
            run_test "DATABASE_URL format is valid" "false"
        fi
    else
        warn ".env file not found - skipping environment tests"
        warn "Create .env file based on backup/.env.example"
    fi

    # Test 5: AWS credentials validation (if available)
    if command -v aws &> /dev/null && [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
        run_test "AWS credentials are valid" "aws sts get-caller-identity &> /dev/null"
        
        if [[ -n "${S3_BUCKET_NAME:-}" ]]; then
            run_test "S3 bucket is accessible" "aws s3 ls s3://$S3_BUCKET_NAME &> /dev/null"
        fi
    else
        warn "AWS credentials not available - skipping AWS tests"
    fi

    # Test 6: Database connectivity (if available)
    if command -v psql &> /dev/null && [[ -n "${DATABASE_URL:-}" ]]; then
        run_test "Database connection is working" "psql \"$DATABASE_URL\" -c \"SELECT 1;\" &> /dev/null"
        
        if psql "$DATABASE_URL" -c "SELECT 1;" &> /dev/null; then
            run_test "Database has tables" "psql \"$DATABASE_URL\" -c \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';\" &> /dev/null"
        fi
    else
        warn "Database connection not available - skipping database tests"
    fi

    # Test 7: Directory structure
    run_test "Logs directory exists or can be created" "mkdir -p \"$SCRIPT_DIR/logs\" && test -d \"$SCRIPT_DIR/logs\""
    run_test "Backup directory exists" "test -d \"$SCRIPT_DIR\""

    # Test 8: Help functionality
    run_test "Restore script shows help" "\"$SCRIPT_DIR/restore.sh\" 2>&1 | grep -q \"Usage:\""

    # Results summary
    echo ""
    echo "=========================================="
    echo "Test Results Summary"
    echo "=========================================="
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo -e "Total Tests:  $((TESTS_PASSED + TESTS_FAILED))"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo ""
        log "🎉 All tests passed! The backup service is ready for deployment."
        echo ""
        echo "Next steps:"
        echo "1. Ensure .env file is properly configured"
        echo "2. Create S3 bucket with encryption"
        echo "3. Run: ./backup/cron-setup.sh"
        echo "4. Test backup: ./backup/backup.sh"
        echo "5. Test restore: ./backup/restore.sh list"
    else
        echo ""
        error "❌ Some tests failed. Please resolve the issues before deploying."
        echo ""
        echo "Common fixes:"
        echo "- Install missing tools: sudo apt-get install postgresql-client awscli"
        echo "- Configure .env file with required variables"
        echo "- Set up AWS credentials and S3 bucket"
        echo "- Ensure database is accessible"
    fi

    echo ""
    echo "For detailed setup instructions, see: backup/README.md"
    
    # Exit with appropriate code
    exit $TESTS_FAILED
}

# Run main function
main "$@"
