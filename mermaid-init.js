// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

(() => {
    const darkThemes = ['ayu', 'navy', 'coal'];
    const lightThemes = ['light', 'rust'];

    const htmlEl = document.getElementsByTagName('html')[0];
    const classList = htmlEl ? htmlEl.classList : [];

    let lastThemeWasLight = true;
    for (const cssClass of classList) {
        if (darkThemes.includes(cssClass)) {
            lastThemeWasLight = false;
            break;
        }
    }

    const theme = lastThemeWasLight ? 'default' : 'dark';

    // Replace literal '\n' in raw mermaid syntax with '<br/>' so labels render multiline
    function preprocessMermaidSyntax() {
        const mermaidNodes = document.querySelectorAll('.mermaid');
        mermaidNodes.forEach((node) => {
            if (node.dataset.mermaidPreprocessed) return;
            // Only preprocess raw unrendered code blocks (before SVG is rendered)
            if (!node.querySelector('svg') && node.textContent.includes('\\n')) {
                node.innerHTML = node.innerHTML.replace(/\\n/g, '<br/>');
                node.dataset.mermaidPreprocessed = 'true';
            }
        });
    }

    // Run preprocessing before Mermaid initializes
    preprocessMermaidSyntax();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', preprocessMermaidSyntax);
    }

    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
            startOnLoad: true,
            theme,
            securityLevel: 'loose',
            fontSize: 16,
            flowchart: { useMaxWidth: false, htmlLabels: true },
            sequence: { useMaxWidth: false }
        });
    }

    // Safely add theme click handlers if theme buttons exist in DOM
    for (const darkTheme of darkThemes) {
        const btn = document.getElementById(darkTheme);
        if (btn) {
            btn.addEventListener('click', () => {
                if (lastThemeWasLight) {
                    window.location.reload();
                }
            });
        }
    }

    for (const lightTheme of lightThemes) {
        const btn = document.getElementById(lightTheme);
        if (btn) {
            btn.addEventListener('click', () => {
                if (!lastThemeWasLight) {
                    window.location.reload();
                }
            });
        }
    }
})();
