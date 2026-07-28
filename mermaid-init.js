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
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: true, theme, fontSize: 16, flowchart: { useMaxWidth: false }, sequence: { useMaxWidth: false } });
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
