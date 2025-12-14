// /js/core/ui.js
// UI helpers (modal + section switching) with SAFE nav highlighting
// Fix: avoid querySelector selectors that include quotes inside attribute values.

export function showModal({
  title = '提示',
  body = '',
  buttons = [{ text: '确定', action: 'close', primary: true }],
  closable = true,
} = {}) {
  let modal = document.getElementById('app-modal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'app-modal';
    modal.innerHTML = `
      <div class="modal-backdrop" data-modal-close="1"></div>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
        <div class="modal-header">
          <div id="app-modal-title" class="modal-title"></div>
          <button class="modal-close" type="button" aria-label="Close" data-modal-close="1">×</button>
        </div>
        <div class="modal-body" id="app-modal-body"></div>
        <div class="modal-footer" id="app-modal-footer"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      const close = e.target && e.target.getAttribute && e.target.getAttribute('data-modal-close') === '1';
      if (close) hideModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const isOpen = modal && modal.classList.contains('open');
        if (isOpen) hideModal();
      }
    });
  }

  const titleEl = modal.querySelector('#app-modal-title');
  const bodyEl = modal.querySelector('#app-modal-body');
  const footerEl = modal.querySelector('#app-modal-footer');
  const closeBtn = modal.querySelector('.modal-close');
  const backdrop = modal.querySelector('.modal-backdrop');

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = body;

  if (footerEl) {
    footerEl.innerHTML = '';
    (buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.text || '确定';
      btn.className = b.primary ? 'btn btn-primary' : 'btn';
      btn.addEventListener('click', async () => {
        try {
          if (typeof b.onClick === 'function') await b.onClick();
        } finally {
          if (b.action === 'close' || b.action === undefined) hideModal();
        }
      });
      footerEl.appendChild(btn);
    });
  }

  // closable
  if (closeBtn) closeBtn.style.display = closable ? '' : 'none';
  if (backdrop) backdrop.style.display = closable ? '' : 'none';

  modal.classList.add('open');
}

export function hideModal() {
  const modal = document.getElementById('app-modal');
  if (modal) modal.classList.remove('open');
}

// Compatibility export: some modules import closeModal()
export function closeModal() {
  hideModal();
}

/**
 * Safely set active state on nav buttons WITHOUT building CSS selectors
 * that contain nested quotes (which causes DOMException).
 */
function setActiveNav(sectionId) {
  const buttons = document.querySelectorAll('.nav button[data-click], .nav a[data-click]');

  const a1 = `showSection('${sectionId}')`;
  const a2 = `showSection("${sectionId}")`;
  const a3 = `goToSection('${sectionId}')`;
  const a4 = `goToSection("${sectionId}")`;

  buttons.forEach((btn) => {
    const v = btn.getAttribute('data-click') || '';
    const active = v === a1 || v === a2 || v === a3 || v === a4;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

/**
 * Show a section by id. Accepts:
 * - 'projects'  -> '#projects-section' (preferred)
 * - 'projects-section' -> exact match
 * - '#projects-section' -> exact match
 * Also hides other sections found on the page.
 */
export function showSection(sectionId) {
  if (!sectionId) return;

  const raw = String(sectionId).trim();
  const normalized = raw.replace(/^#/, '');
  const targetId = normalized;

  // Only switch top-level sections.
  // IMPORTANT: do NOT hide nested elements that might use data-section (e.g. finance sub-pages).
  const sections = document.querySelectorAll('#mainApp .section, .section');

  sections.forEach((el) => {
    // Only treat elements that are actual page-sections (they all have class "section" in this project).
    el.style.display = 'none';
    el.classList.remove('active');
  });

  const target = document.getElementById(targetId);
  if (target) {
    target.style.display = '';
    target.classList.add('active');
  }

  setActiveNav(targetId);
}


