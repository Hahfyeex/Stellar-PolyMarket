# Justfile for Stellar PolyMarket
# Install just: https://github.com/casey/just

# Default recipe to display help
default:
    @just --list

# Format all Rust code
fmt:
    @echo "🎨 Formatting Rust code..."
    cd contracts/prediction_market && cargo fmt --all
    @echo "✅ Formatting complete"

# Check formatting without making changes
fmt-check:
    @echo "🔍 Checking Rust formatting..."
    cd contracts/prediction_market && cargo fmt --all -- --check
    @echo "✅ Formatting check complete"

# Run Clippy lints
clippy:
    @echo "🔍 Running Clippy lints..."
    cd contracts/prediction_market && cargo clippy --all-targets --all-features -- -D warnings
    @echo "✅ Clippy check complete"

# Run all lints (format + clippy)
lint: fmt-check clippy
    @echo "✅ All lints passed"

# Build WASM in debug mode
build:
    @echo "🔨 Building WASM (debug)..."
    cd contracts/prediction_market && cargo build --target wasm32-unknown-unknown
    @echo "✅ Debug build complete"

# Build WASM in release mode
build-release:
    @echo "🔨 Building WASM (release)..."
    cd contracts/prediction_market && cargo build --target wasm32-unknown-unknown --release
    @echo "✅ Release build complete"

# Check WASM size
check-size: build-release
    @echo "📏 Checking WASM size..."
    @SIZE_BYTES=$$(stat -c%s contracts/prediction_market/target/wasm32-unknown-unknown/release/prediction_market.wasm 2>/dev/null || stat -f%z contracts/prediction_market/target/wasm32-unknown-unknown/release/prediction_market.wasm); \
    SIZE_KB=$$((SIZE_BYTES / 1024)); \
    echo "📦 WASM size: $${SIZE_KB} KB ($${SIZE_BYTES} bytes)"; \
    if [ $$SIZE_KB -gt 64 ]; then \
        echo "❌ WASM exceeds 64KB limit!"; \
        exit 1; \
    else \
        PERCENTAGE=$$((SIZE_KB * 100 / 64)); \
        echo "✅ Within 64KB limit ($${PERCENTAGE}% used)"; \
    fi

# Run unit tests
test:
    @echo "🧪 Running unit tests..."
    cd contracts/prediction_market && cargo test --lib -- --nocapture
    @echo "✅ Tests complete"

# Run tests with coverage
test-coverage:
    @echo "🧪 Running tests with coverage..."
    cd contracts/prediction_market && cargo tarpaulin --out Html --output-dir coverage
    @echo "✅ Coverage report generated in contracts/prediction_market/coverage/"

# Run security audit
audit:
    @echo "🔒 Running security audit..."
    cd contracts/prediction_market && cargo audit
    @echo "✅ Security audit complete"

# Clean build artifacts
clean:
    @echo "🧹 Cleaning build artifacts..."
    cd contracts/prediction_market && cargo clean
    @echo "✅ Clean complete"

# Run all CI checks locally
ci: lint test build-release check-size
    @echo "✅ All CI checks passed locally"

# Fix all auto-fixable issues
fix:
    @echo "🔧 Fixing auto-fixable issues..."
    cd contracts/prediction_market && cargo fmt --all
    cd contracts/prediction_market && cargo clippy --all-targets --all-features --fix --allow-dirty --allow-staged
    @echo "✅ Auto-fix complete"

# Install development dependencies
install-deps:
    @echo "📦 Installing development dependencies..."
    cargo install cargo-audit@0.21.1
    cargo install cargo-tarpaulin
    cargo install just
    @echo "✅ Dependencies installed"

# Optimize WASM build
optimize: build-release
    @echo "⚡ Optimizing WASM..."
    @if command -v wasm-opt >/dev/null 2>&1; then \
        wasm-opt -Oz contracts/prediction_market/target/wasm32-unknown-unknown/release/prediction_market.wasm \
            -o contracts/prediction_market/target/wasm32-unknown-unknown/release/prediction_market_optimized.wasm; \
        echo "✅ Optimization complete"; \
        SIZE_BEFORE=$$(stat -c%s contracts/prediction_market/target/wasm32-unknown-unknown/release/prediction_market.wasm 2>/dev/null || stat -f%z contracts/prediction_market/target/wasm32-unknown-unknown/release/prediction_market.wasm); \
        SIZE_AFTER=$$(stat -c%s contracts/prediction_market/target/wasm32-unknown-unknown/release/prediction_market_optimized.wasm 2>/dev/null || stat -f%z contracts/prediction_market/target/wasm32-unknown-unknown/release/prediction_market_optimized.wasm); \
        SAVED=$$((SIZE_BEFORE - SIZE_AFTER)); \
        echo "📊 Saved $${SAVED} bytes"; \
    else \
        echo "⚠️  wasm-opt not found. Install binaryen for optimization."; \
    fi

# Watch for changes and run tests
watch:
    @echo "👀 Watching for changes..."
    cd contracts/prediction_market && cargo watch -x test

# Generate documentation
docs:
    @echo "📚 Generating documentation..."
    cd contracts/prediction_market && cargo doc --no-deps --open
    @echo "✅ Documentation generated"

# Check for outdated dependencies
outdated:
    @echo "🔍 Checking for outdated dependencies..."
    cd contracts/prediction_market && cargo outdated
    @echo "✅ Check complete"

# Update dependencies
update:
    @echo "⬆️  Updating dependencies..."
    cd contracts/prediction_market && cargo update
    @echo "✅ Dependencies updated"
