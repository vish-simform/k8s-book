#!/bin/bash
set -e

# Download mdbook
echo "Downloading mdbook..."
curl -sSL https://github.com/rust-lang/mdBook/releases/download/v0.5.4/mdbook-v0.5.4-x86_64-unknown-linux-gnu.tar.gz | tar -xz

# Download mdbook-mermaid
echo "Downloading mdbook-mermaid..."
curl -sSL https://github.com/badboy/mdbook-mermaid/releases/download/v0.17.0/mdbook-mermaid-v0.17.0-x86_64-unknown-linux-gnu.tar.gz | tar -xz

# Add the current directory to PATH so mdbook can find mdbook-mermaid
export PATH=$PATH:$PWD

# Build the book
echo "Building mdbook..."
./mdbook build
