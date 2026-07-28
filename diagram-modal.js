/**
 * Interactive Pan & Zoom Modal for mdBook Diagrams and Images
 */
(function () {
    let modal = null;
    let canvas = null;
    let contentWrapper = null;
    let scale = 1.0;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    function createModalHTML() {
        if (document.getElementById('diagram-modal')) return;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'diagram-modal';
        modalDiv.className = 'diagram-modal-hidden';
        modalDiv.setAttribute('role', 'dialog');
        modalDiv.setAttribute('aria-modal', 'true');
        modalDiv.setAttribute('aria-label', 'Diagram Zoom and Pan View');

        modalDiv.innerHTML = `
            <div class="diagram-modal-backdrop"></div>
            <div class="diagram-modal-toolbar">
                <span class="diagram-modal-hint"><kbd>Scroll</kbd> / Drag to Pan</span>
                <button class="diagram-modal-btn" id="dm-zoom-in" title="Zoom In (+)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
                <button class="diagram-modal-btn" id="dm-zoom-out" title="Zoom Out (-)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
                <button class="diagram-modal-btn" id="dm-reset" title="Reset View (Fit)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    <span>Fit</span>
                </button>
                <div class="diagram-modal-divider"></div>
                <button class="diagram-modal-btn diagram-modal-close" id="dm-close" title="Close (Esc)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="diagram-modal-body" id="diagram-modal-body">
                <div class="diagram-modal-canvas" id="diagram-modal-canvas"></div>
            </div>
        `;

        document.body.appendChild(modalDiv);

        modal = modalDiv;
        canvas = modalDiv.querySelector('#diagram-modal-canvas');
        contentWrapper = modalDiv.querySelector('#diagram-modal-body');

        // Event listeners for toolbar controls
        modalDiv.querySelector('#dm-zoom-in').addEventListener('click', () => zoomBy(1.25));
        modalDiv.querySelector('#dm-zoom-out').addEventListener('click', () => zoomBy(0.8));
        modalDiv.querySelector('#dm-reset').addEventListener('click', () => resetTransform());
        modalDiv.querySelector('#dm-close').addEventListener('click', closeModal);
        modalDiv.querySelector('.diagram-modal-backdrop').addEventListener('click', closeModal);

        // Pan and Wheel Zoom events
        contentWrapper.addEventListener('wheel', handleWheel, { passive: false });
        contentWrapper.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        // Touch event support
        let touchStartDist = 0;
        contentWrapper.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                startX = e.touches[0].clientX - translateX;
                startY = e.touches[0].clientY - translateY;
            } else if (e.touches.length === 2) {
                isDragging = false;
                touchStartDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        }, { passive: true });

        contentWrapper.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) {
                translateX = e.touches[0].clientX - startX;
                translateY = e.touches[0].clientY - startY;
                applyTransform();
            } else if (e.touches.length === 2 && touchStartDist > 0) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const factor = dist / touchStartDist;
                scale = Math.min(Math.max(0.2, scale * factor), 15);
                touchStartDist = dist;
                applyTransform();
            }
        }, { passive: true });

        contentWrapper.addEventListener('touchend', () => {
            isDragging = false;
            touchStartDist = 0;
        });

        // Keyboard escape & shortcuts
        window.addEventListener('keydown', (e) => {
            if (!modal || modal.classList.contains('diagram-modal-hidden')) return;

            if (e.key === 'Escape') {
                closeModal();
            } else if (e.key === '+' || e.key === '=') {
                zoomBy(1.25);
            } else if (e.key === '-' || e.key === '_') {
                zoomBy(0.8);
            } else if (e.key === '0') {
                resetTransform();
            }
        });
    }

    function applyTransform() {
        if (!canvas) return;
        canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    function resetTransform() {
        scale = 1.0;
        translateX = 0;
        translateY = 0;
        applyTransform();
    }

    function zoomBy(factor) {
        scale = Math.min(Math.max(0.2, scale * factor), 15);
        applyTransform();
    }

    function handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.15 : 0.85;
        const rect = contentWrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        const newScale = Math.min(Math.max(0.2, scale * delta), 15);
        const scaleChange = newScale - scale;

        translateX -= (mouseX - translateX) * (scaleChange / scale);
        translateY -= (mouseY - translateY) * (scaleChange / scale);
        scale = newScale;

        applyTransform();
    }

    function handleMouseDown(e) {
        if (e.button !== 0) return;
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        contentWrapper.style.cursor = 'grabbing';
    }

    function handleMouseMove(e) {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        applyTransform();
    }

    function handleMouseUp() {
        if (isDragging) {
            isDragging = false;
            if (contentWrapper) contentWrapper.style.cursor = 'grab';
        }
    }

    function openModal(elementToClone) {
        createModalHTML();

        canvas.innerHTML = '';
        const clone = elementToClone.cloneNode(true);

        if (clone.tagName.toLowerCase() === 'svg') {
            clone.removeAttribute('width');
            clone.removeAttribute('height');
            clone.style.maxWidth = '85vw';
            clone.style.maxHeight = '78vh';
            clone.style.width = 'auto';
            clone.style.height = 'auto';
        }

        canvas.appendChild(clone);
        resetTransform();

        modal.classList.remove('diagram-modal-hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if (modal) {
            modal.classList.add('diagram-modal-hidden');
            document.body.style.overflow = '';
        }
    }

    function attachDiagramClickHandlers() {
        // Target .mermaid elements and images
        const mermaidContainers = document.querySelectorAll('.mermaid');
        mermaidContainers.forEach((container) => {
            const svg = container.querySelector('svg');
            if (!svg) return;

            if (!container.dataset.diagramModalAttached) {
                container.dataset.diagramModalAttached = 'true';
                container.classList.add('diagram-zoomable');

                container.addEventListener('click', (e) => {
                    if (e.target.tagName.toLowerCase() === 'a' || e.target.closest('a')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const activeSvg = container.querySelector('svg');
                    if (activeSvg) openModal(activeSvg);
                });
            }
        });

        const images = document.querySelectorAll('main img, #content img, article img');
        images.forEach((img) => {
            if (!img.dataset.diagramModalAttached) {
                img.dataset.diagramModalAttached = 'true';
                img.classList.add('diagram-zoomable');

                img.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openModal(img);
                });
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        createModalHTML();
        attachDiagramClickHandlers();

        const observer = new MutationObserver(() => {
            attachDiagramClickHandlers();
        });

        const content = document.querySelector('main') || document.querySelector('#content') || document.body;
        if (content) {
            observer.observe(content, { childList: true, subtree: true });
        }

        window.addEventListener('load', attachDiagramClickHandlers);
    }
})();
