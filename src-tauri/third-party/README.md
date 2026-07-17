# Locally patched Rust dependencies

This directory contains narrowly scoped source-level dependency overrides
required by Vetra.

These are not general Cargo-vendored dependencies. Each dependency is
connected through `[patch.crates-io]`, retains its upstream license, and
must include documented provenance and removal criteria.

## Tao 0.35.3

- Upstream project: `tauri-apps/tao`
- Package source: crates.io package resolved by the existing Vetra lockfile
- Version: `0.35.3`
- Original crates.io checksum: `d1c93047acf68669466a34690ac58cca7010bd1b201e1ec86f1fd0a75d3dd4a`
- Local path: `tao-0.35.3`
- Modified file: `src/platform_impl/windows/event_loop.rs`

### Vetra patch

The Windows `WM_NCCALCSIZE` handler must not clamp a maximized
undecorated window to `rcWork` while Tao borderless fullscreen is active.

Original condition:

```rust
if util::is_maximized(window).unwrap_or(false) {
```

Patched condition:

```rust
if !is_fullscreen && util::is_maximized(window).unwrap_or(false) {
```

### Removal criteria

Remove this local override after an official Tao release contains an
equivalent fix and Windows runtime verification confirms:

* restored → fullscreen → restored;
* maximized → fullscreen → maximized;
* fullscreen client area equals full monitor bounds;
* no taskbar-sized strip or native frame appears.
