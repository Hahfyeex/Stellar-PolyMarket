# Security Scanning – PR Summary

## What was added

| File | Purpose |
|---|---|
| `.github/workflows/security-scanning.yml` | CI workflow — runs Semgrep, gitleaks, and cargo-audit on every PR |
| `.semgrep/soroban.yml` | Custom Semgrep rule-set for Soroban-specific security anti-patterns |

---

## How it works

The `security-scanning` workflow runs four jobs in parallel on every PR targeting `Default`, `main`, `dev`, or `staging`:

**1. Semgrep Static Analysis**
Scans all source files against:
- `p/secrets` — hardcoded API keys, tokens, private keys
- `p/javascript` + `p/nodejs` — JS/TS and Express anti-patterns
- `p/rust` — Rust memory-safety issues
- `p/owasp-top-ten` — OWASP Top 10 coverage
- `.semgrep/soroban.yml` — custom Soroban rules (see below)

Results are uploaded as a SARIF file to the GitHub Security tab and summarised in the PR checks panel.

**2. Secret Scanning (gitleaks)**
Scans the full git commit history for leaked credentials. Catches secrets accidentally committed and then "deleted" — they're still in the history.

**3. Cargo Dependency Audit**
Runs `cargo audit` against the Rust advisory database to catch known CVEs in Soroban contract dependencies.

**4. Security Gate**
Aggregates all three jobs. If Semgrep or gitleaks fails, the gate exits 1 — **blocking the merge**.

---

## Anti-Pattern this check prevents: Auth Bypass via Missing `require_auth()`

### The anti-pattern

```rust
// ❌ DANGEROUS — any caller can resolve any market
pub fn resolve_market(env: Env, market_id: u64, winning_outcome: u32) {
    let mut market = env.storage().persistent().get(&DataKey::Market(market_id)).unwrap();
    market.resolved = true;
    market.winning_outcome = winning_outcome;
    env.storage().persistent().set(&DataKey::Market(market_id), &market);
}
```

Without `require_auth()`, any wallet on the Stellar network can call `resolve_market` and declare any outcome the winner — draining the entire prize pool to themselves.

### How Semgrep catches it

The custom rule `soroban-missing-require-auth` in `.semgrep/soroban.yml` pattern-matches any `pub fn` that calls `env.storage().<type>().set(...)` without a preceding `<address>.require_auth()`. It fires with severity `ERROR`, which causes the Security Gate to exit 1 and block the merge.

### The fix

```rust
// ✅ SAFE — only the registered admin can resolve
pub fn resolve_market(env: Env, market_id: u64, winning_outcome: u32) {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    admin.require_auth(); // ← gate added
    ...
}
```

---

## Setup steps for reviewers

### 1. Enable GitHub Secret Scanning (free for public repos)
- Repo → **Settings** → **Security** → **Secret scanning** → Enable

### 2. (Optional) Semgrep App dashboard
- Sign up at [semgrep.dev](https://semgrep.dev) → create an org → copy the token
- Repo → **Settings** → **Secrets and variables** → **Actions** → add `SEMGREP_APP_TOKEN`
- Without this token the workflow still runs; you just won't see results in the Semgrep dashboard

### 3. Attach the Semgrep Security Report to the PR
- After the workflow runs, go to **Actions** → the workflow run → **Semgrep Static Analysis** job
- Scroll to the **Generate Semgrep Security Report Summary** step — screenshot that table and attach it to the PR description

---

## Screenshot placeholder

> _(Attach screenshot of the Semgrep Security Report summary from the CI run here before requesting review)_