# Soroban CI/CD Pipeline Documentation

## 🎯 Overview

This document describes the automated CI/CD pipeline for Soroban smart contracts. The pipeline ensures that every Pull Request is "Mainnet-Ready" by verifying code formatting, linting, building, and WASM size constraints.

## 🔧 Rust Toolchain Version

**Rust Version**: `1.79.0`  
**Soroban SDK**: `21.7.6`  
**Target**: `wasm32-unknown-unknown`

The toolchain version is pinned in `rust-toolchain.toml` to ensure consistency across all environments (local development, CI, and production).

## 📋 CI Pipeline Jobs

### 1. Rust Format & Lint (`rust-checks`)

Verifies code quality and formatting standards.

#### Checks Performed:
- **Formatting Check**: `cargo fmt --check`
  - Ensures all Rust code follows the project's formatting standards
  - Configuration: `rustfmt.toml`
  - Fails if any file needs formatting

- **Clippy Lints**: `cargo clippy -- -D warnings`
  - Runs Rust's official linter
  - Treats all warnings as errors (`-D warnings`)
  - Configuration: `clippy.toml`
  - Checks for common mistakes, performance issues, and style violations

- **Common Issues Check**:
  - Detects `println!` or `dbg!` macros (should use `soroban_sdk::log!`)
  - Warns about TODO/FIXME comments
  - Ensures production-ready code

#### Exit Criteria:
- ✅ All files properly formatted
- ✅ Zero Clippy warnings
- ✅ No forbidden macros in production code

### 2. Build & Validate WASM (`build-wasm`)

Builds the smart contract and validates WASM output.

#### Build Steps:
1. **Debug Build**: `cargo build --target wasm32-unknown-unknown`
   - Quick build for validation
   - Ensures code compiles without errors

2. **Release Build**: `cargo build --target wasm32-unknown-unknown --release`
   - Optimized build with `opt-level = "z"`
   - Produces production-ready WASM
   - Configuration in `Cargo.toml` profile

3. **Size Validation**:
   - Checks WASM file size against Soroban's 64KB limit
   - Calculates size percentage
   - Fails if size exceeds limit
   - Generates size report in job summary

#### Optimization Settings:
```toml
[profile.release]
opt-level = "z"           # Optimize for size
overflow-checks = true    # Keep safety checks
debug = 0                 # No debug info
strip = "symbols"         # Strip symbols
debug-assertions = false  # Disable debug assertions
panic = "abort"           # Smaller panic handler
codegen-units = 1         # Better optimization
lto = true                # Link-time optimization
```

#### Exit Criteria:
- ✅ Debug build succeeds
- ✅ Release build succeeds
- ✅ WASM size ≤ 64KB
- ✅ WASM artifact uploaded

### 3. Run Contract Tests (`run-tests`)

Executes all unit and integration tests.

#### Test Types:
- **Unit Tests**: Tests within `src/lib.rs` and modules
- **Integration Tests**: Tests in `tests/` directory
- **Test Output**: Captured with `--nocapture` for debugging

#### Test Coverage:
- Initialization tests
- Market creation tests
- Bet placement tests
- Market resolution tests
- Edge cases and error conditions

#### Exit Criteria:
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Test report generated

### 4. Security Audit (`security-audit`)

Performs security checks on dependencies and code.

#### Checks Performed:
- **Dependency Audit**: `cargo audit`
  - Checks for known security vulnerabilities
  - Scans all dependencies
  - Non-blocking (warnings only)

- **Unsafe Code Detection**:
  - Scans for `unsafe` blocks
  - Warns if unsafe code is found
  - Ensures code safety

#### Exit Criteria:
- ✅ Security audit completed
- ✅ Unsafe code documented (if any)

### 5. CI Summary (`ci-summary`)

Aggregates results from all jobs and generates final report.

#### Summary Includes:
- Overall status of all checks
- Rust toolchain version
- Soroban SDK version
- WASM size metrics
- Test results
- Deployment readiness

## 🚀 Triggering the Pipeline

### Automatic Triggers:

1. **Pull Requests** to `main`, `dev`, or `staging`:
   ```yaml
   on:
     pull_request:
       branches: [main, dev, staging]
       paths:
         - 'contracts/**'
         - '.github/workflows/soroban-ci.yml'
   ```

2. **Push to `main`** branch:
   ```yaml
   on:
     push:
       branches: [main]
       paths:
         - 'contracts/**'
   ```

### Path Filters:
Pipeline only runs when relevant files change:
- `contracts/**` - Any contract code
- `.github/workflows/soroban-ci.yml` - Workflow itself
- `clippy.toml` - Clippy configuration
- `rustfmt.toml` - Formatting configuration

## 📊 WASM Size Constraint

### Soroban Limit: 64KB

The Soroban blockchain enforces a strict 64KB limit on WASM contract size.

#### Size Check Process:
1. Build WASM in release mode with optimizations
2. Get file size: `stat -c%s prediction_market.wasm`
3. Convert to KB: `SIZE_KB = SIZE_BYTES / 1024`
4. Compare against limit: `SIZE_KB ≤ 64`
5. Calculate percentage: `(SIZE_KB / 64) * 100`

#### Size Report Example:
```
📦 WASM file size: 42 KB (43,008 bytes)
📊 Size limit: 64 KB
✅ WASM size is within limits (65% of maximum)
```

#### If Size Exceeds Limit:
```
❌ WASM file exceeds Soroban limit!
   Current: 68 KB
   Limit: 64 KB
   Exceeded by: 4 KB
```

### Size Optimization Tips:
1. Use `opt-level = "z"` in release profile
2. Enable LTO (Link-Time Optimization)
3. Strip symbols and debug info
4. Minimize dependencies
5. Use `wasm-opt` for additional optimization
6. Avoid large data structures
7. Use references instead of cloning

## 🛠️ Local Development

### Using Just Commands

Install Just: `cargo install just`

#### Common Commands:

```bash
# Format code
just fmt

# Check formatting
just fmt-check

# Run Clippy
just clippy

# Run all lints
just lint

# Build WASM
just build-release

# Check WASM size
just check-size

# Run tests
just test

# Run all CI checks locally
just ci

# Fix auto-fixable issues
just fix
```

### Manual Commands:

```bash
# Format code
cd contracts/prediction_market
cargo fmt --all

# Check formatting
cargo fmt --all -- --check

# Run Clippy
cargo clippy --all-targets --all-features -- -D warnings

# Build WASM
cargo build --target wasm32-unknown-unknown --release

# Run tests
cargo test --lib -- --nocapture

# Check WASM size
stat -c%s target/wasm32-unknown-unknown/release/prediction_market.wasm
```

## 📝 PR Requirements

### Before Submitting a PR:

1. **Run Local Checks**:
   ```bash
   just ci
   ```

2. **Ensure All Checks Pass**:
   - ✅ Code is formatted (`just fmt`)
   - ✅ No Clippy warnings (`just clippy`)
   - ✅ Tests pass (`just test`)
   - ✅ WASM builds (`just build-release`)
   - ✅ WASM size ≤ 64KB (`just check-size`)

3. **Commit Changes**:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin your-branch
   ```

4. **Create PR**:
   - GitHub Actions will automatically run CI
   - All checks must pass before merge
   - Review the "Checks" tab for details

### PR Merge Requirements:

- ✅ All CI jobs must pass
- ✅ Code review approved
- ✅ No merge conflicts
- ✅ Branch up to date with base

## 🔍 Troubleshooting

### Formatting Failures

**Error**: `cargo fmt --check` fails

**Solution**:
```bash
just fmt
git add .
git commit -m "style: format code"
```

### Clippy Warnings

**Error**: Clippy finds warnings

**Solution**:
```bash
# See warnings
just clippy

# Auto-fix if possible
just fix

# Manual fixes required for some warnings
```

### WASM Size Exceeds Limit

**Error**: WASM file > 64KB

**Solutions**:
1. Review dependencies - remove unused crates
2. Optimize data structures
3. Use references instead of cloning
4. Enable all optimization flags
5. Use `wasm-opt` for additional optimization:
   ```bash
   just optimize
   ```

### Test Failures

**Error**: Tests fail

**Solution**:
```bash
# Run tests locally with output
just test

# Debug specific test
cd contracts/prediction_market
cargo test test_name -- --nocapture
```

### Build Failures

**Error**: Compilation errors

**Solution**:
1. Check Rust version: `rustc --version` (should be 1.79.0)
2. Update toolchain: `rustup update`
3. Clean and rebuild:
   ```bash
   just clean
   just build-release
   ```

## 📈 CI Performance

### Typical Run Times:

- **rust-checks**: ~2-3 minutes
- **build-wasm**: ~3-5 minutes
- **run-tests**: ~1-2 minutes
- **security-audit**: ~1-2 minutes
- **Total**: ~7-12 minutes

### Caching:

The pipeline uses multiple caching strategies:
- **Rust toolchain cache**: `actions-rust-lang/setup-rust-toolchain`
- **Cargo dependencies cache**: `Swatinem/rust-cache`
- **Cache on failure**: Enabled for faster retries

## 🔐 Security

### Security Measures:

1. **Dependency Auditing**: `cargo audit` checks for vulnerabilities
2. **Unsafe Code Detection**: Warns about unsafe blocks
3. **Clippy Security Lints**: Catches common security issues
4. **Pinned Toolchain**: Consistent Rust version
5. **Locked Dependencies**: `Cargo.lock` committed

### Security Best Practices:

- Keep dependencies up to date
- Review security advisories
- Minimize use of unsafe code
- Use Soroban SDK security features
- Follow Rust security guidelines

## 📚 Additional Resources

### Documentation:
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Clippy Lints](https://rust-lang.github.io/rust-clippy/master/)
- [Rustfmt Configuration](https://rust-lang.github.io/rustfmt/)

### Tools:
- [Just Command Runner](https://github.com/casey/just)
- [Cargo Audit](https://github.com/rustsec/rustsec)
- [Rust Analyzer](https://rust-analyzer.github.io/)

## 🎯 Success Criteria

A PR is ready to merge when:

- ✅ All CI jobs pass (green checkmarks)
- ✅ Code review approved
- ✅ WASM size within 64KB limit
- ✅ Zero Clippy warnings
- ✅ All tests passing
- ✅ Security audit clean
- ✅ Code properly formatted

## 📊 CI Status Badge

Add to README.md:

```markdown
[![Soroban CI](https://github.com/YOUR_USERNAME/Stellar-PolyMarket/actions/workflows/soroban-ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/Stellar-PolyMarket/actions/workflows/soroban-ci.yml)
```

---

**Pipeline Version**: 1.0.0  
**Last Updated**: 2026-03-24  
**Rust Toolchain**: 1.79.0  
**Soroban SDK**: 21.7.6
