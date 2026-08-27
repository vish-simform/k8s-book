# Contributing to "Kubernetes: From Zero to Production"

Thank you for your interest in improving this open-source book! We welcome contributions, whether they are fixing typos, improving explanations, adding troubleshooting tips, or reporting issues.

---

## 🛠️ Local Development & Building the Book

This book is built using [mdBook](https://rust-lang.github.io/mdBook/) and the [mdbook-mermaid](https://github.com/badboy/mdbook-mermaid) preprocessor.

### Prerequisites

1. Install Rust and Cargo:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
2. Install `mdbook` and `mdbook-mermaid`:
   ```bash
   cargo install mdbook
   cargo install mdbook-mermaid
   ```

### Building & Serving Locally

```bash
# Build the HTML output to the book/ directory
mdbook build

# Run local development server with live reload on port 3000
mdbook serve --open
```

---

## 📝 Content & Style Guidelines

To keep the book consistent, polished, and reader-friendly, please adhere to these conventions:

### 1. Section Structure

Every conceptual section should follow this flow:
- **Heading:** `# X.Y Section Title`
- **Metadata:** `⏱️ X min read · [Hands-on time] · [Badge: 🟢 Beginner / 🟡 Intermediate / 🔴 Advanced]`
- **TL;DR:** High-impact, 2–3 sentence executive summary inside a blockquote `> **TL;DR:** ...`
- **Micro-Objectives:** `> **After this section you will be able to:** ...`
- **Concepts & Diagrams:** Visual Mermaid diagrams where appropriate.
- **Runnable Examples:** Clear, copy-pasteable commands and YAML with pinned image tags.
- **Quick Check:** Collapsible `<details>` questions testing the section's core mental model.

### 2. Manifest & Code Quality

- **Indentation:** Exactly 2 spaces for all YAML manifests. **Never use tabs**.
- **Pinned Image Tags:** Always pin image versions (e.g., `nginx:1.25-alpine`, `busybox:1.36`, `nicolaka/netshoot:v0.13`). Never use `:latest` unless explicitly explaining image tag anti-patterns.
- **Resources:** Include `requests` and `limits` in deployment and pod examples where relevant.
- **Labels:** Follow standard Kubernetes recommended labels (`app`, `tier`, `version`).

### 3. Diagram Conventions

- Use Mermaid code blocks (` ```mermaid `).
- Use `<br/>` for line breaks inside node labels (avoid `\n`).
- Ensure all diagrams render cleanly on both desktop and mobile viewports.

---

## 🐛 Reporting Issues & Submitting PRs

1. **Typos & Minor Fixes:** Feel free to open a direct Pull Request with a clear description of the fix.
2. **Structural Changes / New Content:** Open an Issue first to discuss the proposed changes before spending time writing extensive content.
3. **Verification:** Always verify that `mdbook build` completes with **zero errors or broken links** before submitting a PR.
