# Soroban CI Quick Reference

## 🚀 Quick Start

### Install Just
```bash
cargo install just
```

### Run All CI Checks Locally
```bash
just ci
```

## 📋 Common Commands

### Formatting
```bash
just fmt          # Format all code
just fmt-check    # Check formatting without changes
```

### Linting
```bash
just clippy       # Run Clippy lints
just lint         # Run all lints (format + clippy)
```

### Building
```bash
just build         # Build debug WASM
just build-release # Build release WASM
just check-size    # Build and check WASM size
```

### Testing
```bash
just test          # Run unit tests
just test-coverage # Run tests with coverage
```

### Fixing Issues
```bash
just fix           # Auto-fix formatting and clippy issues
```

### Other
```bash
just clean         # Clean build artifacts
just audit         # Run security audit
just docs          # Generate documentation
```

## 🔧 Rust Toolchain

**Version**: 1.79.0  
**Components**: rustfmt, clippy  
**Target**: wasm32-unknown-unknown

### Check Version
```bash
rustc --version
# Should output: rustc 1.79.0
```

### Update Toolchain
```bash
rustup update
```

## ✅ Pre-PR Checklist

Before submitting a PR, run:

```bash
# 1. Format code
just fmt

# 2. Run all checks
just ci

# 3. Commit if all pass
git add .
git commit -m "your message"
git push
```

## 🔍 CI Jobs

| Job | Purpose | Duration |
|-----|---------|----------|
| rust-checks | Format & lint | ~2-3 min |
| build-wasm | Build & size check | ~3-5 min |
| run-tests | Unit tests | ~1-2 min |
| security-audit | Security scan | ~1-2 min |
| ci-summary | Aggregate results | ~30 sec |

## 📊 WASM Size Limit

**Maximum**: 64 KB  
**Check**: `just check-size`

### If Size Exceeds:
1. Review dependencies
2. Optimize data structures
3. Use references instead of cloning
4. Run `just optimize`

## 🐛 Troubleshooting

### Formatting Failure
```bash
just fmt
git add .
git commit -m "style: format code"
```

### Clippy Warnings
```bash
just fix  # Auto-fix if possible
# Manual fixes for remaining warnings
```

### Test Failures
```bash
just test  # See detailed output
```

### Build Failures
```bash
just clean
just build-release
```

## 📝 Manual Commands

If you don't have Just installed:

### Format
```bash
cd contracts/prediction_market
cargo fmt --all
```

### Lint
```bash
cd contracts/prediction_market
cargo clippy --all-targets --all-features -- -D warnings
```

### Build
```bash
cd contracts/prediction_market
cargo build --target wasm32-unknown-unknown --release
```

### Test
```bash
cd contracts/prediction_market
cargo test --lib -- --nocapture
```

### Check Size
```bash
cd contracts/prediction_market
stat -c%s target/wasm32-unknown-unknown/release/prediction_market.wasm
```

## 🎯 CI Status

### View CI Results
1. Go to your PR on GitHub
2. Click "Checks" tab
3. View job details and summaries

### Download WASM Artifact
1. Go to Actions tab
2. Click on workflow run
3. Download "prediction-market-wasm" artifact

## 🔐 Security

### Run Security Audit
```bash
just audit
```

### Check for Unsafe Code
```bash
grep -r "unsafe" contracts/prediction_market/src/
```

## 📚 Documentation

### Generate Docs
```bash
just docs
```

### View Docs
Opens in browser automatically after generation.

## ⚡ Performance Tips

### Speed Up Local Checks
```bash
# Use cargo-watch for continuous testing
cargo install cargo-watch
just watch
```

### Speed Up Builds
```bash
# Use sccache for caching
cargo install sccache
export RUSTC_WRAPPER=sccache
```

## 🎨 Code Style

### Formatting Rules
- Max width: 100 characters
- Tab spaces: 4
- Trailing comma: Vertical
- Edition: 2021

### Clippy Rules
- MSRV: 1.70.0
- All warnings as errors
- No `println!` or `dbg!` in production

## 📦 Dependencies

### Check Outdated
```bash
just outdated
```

### Update Dependencies
```bash
just update
```

## 🔄 Workflow

### Development Flow
```
1. Write code
2. Run `just ci`
3. Fix issues
4. Commit & push
5. CI runs automatically
6. Review PR checks
7. Merge when green
```

## 🆘 Getting Help

### Resources
- [Soroban Docs](https://soroban.stellar.org/docs)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Clippy Lints](https://rust-lang.github.io/rust-clippy/)

### Common Errors

**Error**: `cargo fmt --check` fails  
**Fix**: Run `just fmt`

**Error**: Clippy warnings  
**Fix**: Run `just fix` or fix manually

**Error**: WASM > 64KB  
**Fix**: Optimize code, run `just optimize`

**Error**: Tests fail  
**Fix**: Debug with `just test`

## 📊 CI Metrics

### Typical Sizes
- Debug WASM: ~80-100 KB
- Release WASM: ~40-50 KB
- Optimized WASM: ~35-45 KB

### Typical Times
- Format check: ~10 sec
- Clippy: ~30-60 sec
- Build: ~2-3 min
- Tests: ~30-60 sec

## 🎯 Success Indicators

✅ All checks pass  
✅ WASM < 64KB  
✅ Zero warnings  
✅ All tests pass  
✅ Green checkmarks on PR

---

**Quick Help**: Run `just` to see all available commands  
**Full Docs**: See `SOROBAN_CI_README.md`  
**Rust Version**: 1.79.0
