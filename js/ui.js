/**
 * js/ui.js — Statistics Cards, Insights, Slider, Navbar, Downloads, Reveals,
 *             Particle Animation, Contact Form Validation
 * Tasks: 11.1, 11.2, 11.3, 11.4, 15.1, 15.2
 * Requirements: 4.1–4.5, 2.7, 8.1–8.6, 10.1–10.4, 11.1–11.5,
 *               14.2, 14.3, 14.5, 17.1–17.5, 18.1, 18.5, 18.6,
 *               19.2, 19.5, 20.1, 3.3
 */

import { EventBus } from './eventbus.js';
import { formatNumber, formatHa, animateCounter, clamp, debounce } from './utils.js';

// ─────────────────────────────────────────────────────────────
// MODULE-LEVEL STATE
// ─────────────────────────────────────────────────────────────

/** Cached references so renderStatCards can update values without full re-render */
const _cardValueEls = {};

/** Module-level stats reference set on init */
let _stats = null;

/** Module-level districtGeo reference set on init */
let _districtGeo = null;

/** Current slider position (0–100) */
let _sliderPct = 50;

/** Toast container element (created once) */
let _toastContainer = null;

// ─────────────────────────────────────────────────────────────
// TASK 11.1 — STATISTICS CARDS
// ─────────────────────────────────────────────────────────────

/**
 * Stat card metadata: key, icon, label, whether it updates per-year.
 */
const STAT_CARDS_META = [
  { key: 'forestCoverHa',        icon: 'fa-tree',        label: 'Total Forest Cover',         yearly: true,  format: 'ha' },
  { key: 'forestLossHa',         icon: 'fa-circle-minus',label: 'Annual Forest Loss',          yearly: true,  format: 'ha' },
  { key: 'forestGainHa',         icon: 'fa-circle-plus', label: 'Annual Forest Gain',          yearly: true,  format: 'ha' },
  { key: 'protectedAreasCount',  icon: 'fa-shield',      label: 'Protected Areas',             yearly: false, format: 'number' },
  { key: 'districtsCount',       icon: 'fa-map-location-dot', label: 'Districts Monitored',    yearly: false, format: 'number' },
  { key: 'satelliteImagesCount', icon: 'fa-satellite',   label: 'Satellite Images Processed',  yearly: false, format: 'number' },
  { key: 'predictionAccuracyPct',icon: 'fa-brain',       label: 'Prediction Accuracy (%)',     yearly: false, format: 'number' },
];

/**
 * Format a stat value for display.
 * @param {string} format 'ha' | 'number'
 * @param {number} value
 * @returns {string}
 */
function _formatStat(format, value) {
  return format === 'ha' ? formatHa(value) : formatNumber(value);
}

/**
 * Build a single `.stat-card` element.
 * @param {{key:string, icon:string, label:string, format:string}} meta
 * @param {number} value
 * @returns {HTMLElement}
 */
function _buildStatCard(meta, value) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  card.dataset.key = meta.key;

  const iconEl = document.createElement('i');
  iconEl.className = `fa-solid ${meta.icon}`;
  iconEl.setAttribute('aria-hidden', 'true');

  const valueEl = document.createElement('span');
  valueEl.className = 'stat-value';
  valueEl.textContent = _formatStat(meta.format, value);

  const labelEl = document.createElement('span');
  labelEl.className = 'stat-label';
  labelEl.textContent = meta.label;

  card.appendChild(iconEl);
  card.appendChild(valueEl);
  card.appendChild(labelEl);

  return { card, valueEl };
}

/**
 * Wire an IntersectionObserver on a value element so the counter animates
 * exactly once when the element scrolls into view (threshold 0.3).
 * @param {HTMLElement} el    The value element
 * @param {number}      target Numeric target
 */
function _wireCounterObserver(el, target) {
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(el, target, 2000);
          obs.disconnect();
        }
      });
    },
    { threshold: 0.3 }
  );
  observer.observe(el);
}

/**
 * Export: render skeleton cards immediately, then replace with real stat cards.
 * Also wires EventBus, counter animation, and calls initParticles + initSlider etc.
 * @param {Object} stats       Parsed statistics.json
 * @param {Object} districtGeo Parsed district.geojson (may be null)
 */
export function init(stats, districtGeo) {
  _stats = stats;
  _districtGeo = districtGeo;

  const grid = document.getElementById('stats-cards-grid');
  if (!grid) return;

  // 1. Render 7 skeleton cards immediately
  grid.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const skel = document.createElement('div');
    skel.className = 'skeleton-card';
    grid.appendChild(skel);
  }

  // 2. Replace with real cards synchronously (data already available)
  grid.innerHTML = '';
  STAT_CARDS_META.forEach(meta => {
    const value = stats[meta.key] ?? 0;
    const { card, valueEl } = _buildStatCard(meta, value);
    _cardValueEls[meta.key] = { el: valueEl, format: meta.format };
    grid.appendChild(card);
    _wireCounterObserver(valueEl, value);
  });

  // 3. Subscribe to year changes
  EventBus.on('year:changed', ({ year }) => renderStatCards(year));
  EventBus.on('year:changed', ({ year }) => renderInsights(year));

  // 4. Initialise sub-features
  _initNavbar();
  _initSectionReveal();
  _initSlider();
  initParticles();

  // 5. Render initial insights (no year filter on initial load)
  renderInsights(null);
}

/**
 * Export: update the 3 yearly stat card values for a given year.
 * @param {number} year
 */
export function renderStatCards(year) {
  if (!_stats) return;
  const entry = _stats.yearlyData && _stats.yearlyData.find(d => d.year === year);
  if (!entry) return;

  ['forestCoverHa', 'forestLossHa', 'forestGainHa'].forEach(key => {
    const ref = _cardValueEls[key];
    if (ref) {
      ref.el.textContent = _formatStat(ref.format, entry[key]);
    }
  });
}

/**
 * Export: show a dismissible error toast in the bottom-right corner.
 * Max 5 stacked; auto-dismisses after 8 s.
 * @param {string} message
 */
export function showErrorToast(message) {
  // Ensure container exists
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'toast-container';
    Object.assign(_toastContainer.style, {
      position:   'fixed',
      bottom:     '1.5rem',
      right:      '1.5rem',
      zIndex:     '9999',
      display:    'flex',
      flexDirection: 'column',
      gap:        '0.5rem',
      alignItems: 'flex-end',
      pointerEvents: 'none',
    });
    document.body.appendChild(_toastContainer);
  }

  // Enforce max 5 toasts
  while (_toastContainer.children.length >= 5) {
    _toastContainer.removeChild(_toastContainer.firstChild);
  }

  const toast = document.createElement('div');
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  Object.assign(toast.style, {
    background:   '#1f2937',
    color:        '#f9fafb',
    border:       '1px solid #ef4444',
    borderRadius: '0.5rem',
    padding:      '0.75rem 1rem',
    maxWidth:     '20rem',
    display:      'flex',
    alignItems:   'flex-start',
    gap:          '0.5rem',
    pointerEvents: 'auto',
    boxShadow:    '0 4px 12px rgba(0,0,0,0.4)',
    fontSize:     '0.875rem',
    lineHeight:   '1.4',
  });

  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  msgSpan.style.flex = '1';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  Object.assign(closeBtn.style, {
    background:  'transparent',
    border:      'none',
    color:       '#9ca3af',
    cursor:      'pointer',
    fontSize:    '1.1rem',
    lineHeight:  '1',
    padding:     '0',
    flexShrink:  '0',
  });

  const dismiss = () => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  };

  closeBtn.addEventListener('click', dismiss);
  const timer = setTimeout(dismiss, 8000);
  closeBtn.addEventListener('click', () => clearTimeout(timer));

  toast.appendChild(msgSpan);
  toast.appendChild(closeBtn);
  _toastContainer.appendChild(toast);
}

// ─────────────────────────────────────────────────────────────
// TASK 11.2 — ENVIRONMENTAL INSIGHTS
// ─────────────────────────────────────────────────────────────

/**
 * Build one insight card element.
 * @param {string} title
 * @param {string} value
 * @param {string} description
 * @param {'danger'|'success'|'info'} accent
 * @returns {HTMLElement}
 */
function _buildInsightCard(title, value, description, accent) {
  const accentColors = {
    danger:  { border: '#ef4444', badge: '#fef2f2', text: '#991b1b' },
    success: { border: '#22c55e', badge: '#f0fdf4', text: '#166534' },
    info:    { border: '#3b82f6', badge: '#eff6ff', text: '#1d4ed8' },
  };
  const colors = accentColors[accent] || accentColors.info;

  const card = document.createElement('article');
  card.className = 'insight-card';
  Object.assign(card.style, {
    border:       `2px solid ${colors.border}`,
    borderRadius: '0.75rem',
    padding:      '1.25rem',
    background:   '#1f2937',
    display:      'flex',
    flexDirection:'column',
    gap:          '0.5rem',
  });

  const titleEl = document.createElement('h3');
  titleEl.className = 'insight-title';
  titleEl.style.cssText = `color: ${colors.border}; font-size: 0.875rem; font-weight: 600; margin: 0;`;
  titleEl.textContent = title;

  const valueEl = document.createElement('p');
  valueEl.className = 'insight-value';
  valueEl.style.cssText = 'font-size: 1.5rem; font-weight: 700; color: #f9fafb; margin: 0;';
  valueEl.textContent = value;

  const descEl = document.createElement('p');
  descEl.className = 'insight-desc';
  descEl.style.cssText = 'font-size: 0.8rem; color: #9ca3af; margin: 0; line-height: 1.5;';
  descEl.textContent = description;

  card.appendChild(titleEl);
  card.appendChild(valueEl);
  card.appendChild(descEl);
  return card;
}

/**
 * Export: derive 6 environmental insight cards and populate #insights-grid.
 * Falls back gracefully when districtGeo is null.
 * @param {number|null} year  Current selected year (used for % change fallback)
 */
export function renderInsights(year) {
  const grid = document.getElementById('insights-grid');
  if (!grid) return;

  // ── Fallback when no geo data ──────────────────────────────
  if (!_districtGeo || !_districtGeo.features || _districtGeo.features.length === 0) {
    grid.innerHTML =
      '<p style="color:#9ca3af;grid-column:1/-1;text-align:center">Insight data unavailable.</p>';
    return;
  }

  const features = _districtGeo.features;
  const props = features.map(f => f.properties);

  // Insight 1 — district with max forestLossHa
  const maxLoss = props.reduce((a, b) => (b.forestLossHa > a.forestLossHa ? b : a));

  // Insight 2 — district with max forestGainHa
  const maxGain = props.reduce((a, b) => (b.forestGainHa > a.forestGainHa ? b : a));

  // Insight 3 — max |loss − gain| (greatest imbalance)
  const maxImbalance = props.reduce((a, b) =>
    Math.abs(b.forestLossHa - b.forestGainHa) > Math.abs(a.forestLossHa - a.forestGainHa) ? b : a);

  // Insight 4 — min |loss − gain| (most balanced)
  const minImbalance = props.reduce((a, b) =>
    Math.abs(b.forestLossHa - b.forestGainHa) < Math.abs(a.forestLossHa - a.forestGainHa) ? b : a);

  // Insight 5 — nationwide annual % change (from stats if available, else from geo)
  let pctChange = null;
  if (_stats && _stats.yearlyData && _stats.yearlyData.length >= 2) {
    const sorted = [..._stats.yearlyData].sort((a, b) => a.year - b.year);
    const latest = sorted[sorted.length - 1];
    const prev   = sorted[sorted.length - 2];
    pctChange = prev.forestCoverHa > 0
      ? ((latest.forestCoverHa - prev.forestCoverHa) / prev.forestCoverHa) * 100
      : 0;
  } else {
    const totalLoss = props.reduce((s, p) => s + (p.forestLossHa || 0), 0);
    const totalCover = props.reduce((s, p) => s + (p.forestCoverHa || 0), 0);
    pctChange = totalCover > 0 ? (-totalLoss / totalCover) * 100 : 0;
  }

  // Insight 6 — protected forest summary
  const protectedCount = _stats ? (_stats.protectedAreasCount || 0) : 0;
  const totalCoverHa   = _stats ? (_stats.forestCoverHa || 0) :
    props.reduce((s, p) => s + (p.forestCoverHa || 0), 0);

  // ── Build cards ────────────────────────────────────────────
  const cards = [
    _buildInsightCard(
      '⚠ Highest Forest Loss District',
      maxLoss.name || 'Unknown',
      `${maxLoss.name} recorded the highest annual forest loss at ${formatHa(maxLoss.forestLossHa)}, indicating severe deforestation pressure.`,
      'danger'
    ),
    _buildInsightCard(
      '✦ Highest Forest Gain District',
      maxGain.name || 'Unknown',
      `${maxGain.name} leads reforestation efforts with an annual forest gain of ${formatHa(maxGain.forestGainHa)}.`,
      'success'
    ),
    _buildInsightCard(
      '⚡ Greatest Loss–Gain Imbalance',
      maxImbalance.name || 'Unknown',
      `${maxImbalance.name} shows the largest net imbalance (${formatHa(Math.abs(maxImbalance.forestLossHa - maxImbalance.forestGainHa))}), requiring urgent intervention.`,
      'danger'
    ),
    _buildInsightCard(
      '⚖ Most Balanced District',
      minImbalance.name || 'Unknown',
      `${minImbalance.name} maintains the closest balance between forest loss and gain (${formatHa(Math.abs(minImbalance.forestLossHa - minImbalance.forestGainHa))} difference).`,
      'success'
    ),
    _buildInsightCard(
      '📈 Nationwide Annual Change',
      `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(3)}%`,
      `Nepal's total forest cover changed by ${pctChange.toFixed(3)}% in the most recent recorded year, reflecting ongoing land-use dynamics.`,
      'info'
    ),
    _buildInsightCard(
      '🛡 Protected Forest Areas',
      formatNumber(protectedCount),
      `Nepal has ${formatNumber(protectedCount)} protected areas safeguarding portions of the ${formatHa(totalCoverHa)} total forest cover.`,
      'info'
    ),
  ];

  grid.innerHTML = '';
  cards.forEach(c => grid.appendChild(c));
}

// ─────────────────────────────────────────────────────────────
// TASK 11.3 — BEFORE/AFTER SLIDER
// ─────────────────────────────────────────────────────────────

/**
 * Update the slider position and ARIA attribute.
 * The HTML already contains the slider structure from index.html;
 * this function just drives the visual state.
 * @param {number} pct  0–100
 */
function updateSlider(pct) {
  _sliderPct = clamp(pct, 0, 100);

  const container = document.getElementById('comparison-slider');
  if (!container) return;

  const afterEl  = container.querySelector('.slider-after');
  const handleEl = container.querySelector('.slider-handle');

  if (afterEl)  afterEl.style.clipPath  = `inset(0 ${100 - _sliderPct}% 0 0)`;
  if (handleEl) {
    handleEl.style.left = `${_sliderPct}%`;
    handleEl.setAttribute('aria-valuenow', String(Math.round(_sliderPct)));
  }
}

/**
 * Initialise the before/after comparison slider.
 * Uses the HTML structure already present in index.html.
 */
function _initSlider() {
  const container = document.getElementById('comparison-slider');
  if (!container) return;

  // Keep the slider structure intact, but do not synthesize a fallback graphic
  // when the comparison image assets cannot be loaded.

  // Set initial visual state
  updateSlider(50);

  const handleEl = container.querySelector('.slider-handle');
  if (!handleEl) return;

  // ── Pointer events (drag) ──────────────────────────────────
  let isDragging = false;

  container.addEventListener('pointerdown', e => {
    isDragging = true;
    container.setPointerCapture(e.pointerId);
    _moveSplider(e, container);
  });

  container.addEventListener('pointermove', e => {
    if (!isDragging) return;
    _moveSplider(e, container);
  });

  container.addEventListener('pointerup', e => {
    isDragging = false;
    container.releasePointerCapture(e.pointerId);
  });

  container.addEventListener('pointercancel', e => {
    isDragging = false;
    if (container.hasPointerCapture(e.pointerId)) {
      container.releasePointerCapture(e.pointerId);
    }
  });

  // ── Keyboard (Arrow keys on handle) ───────────────────────
  handleEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); updateSlider(_sliderPct - 2); }
    if (e.key === 'ArrowRight') { e.preventDefault(); updateSlider(_sliderPct + 2); }
  });
}

/**
 * Compute slider percentage from a pointer event and call updateSlider.
 * @param {PointerEvent} e
 * @param {HTMLElement}  container
 */
function _moveSplider(e, container) {
  const rect = container.getBoundingClientRect();
  const pct  = ((e.clientX - rect.left) / rect.width) * 100;
  updateSlider(pct);
}

// ─────────────────────────────────────────────────────────────
// TASK 11.4 — NAVBAR, DOWNLOAD CENTER, SECTION REVEAL
// ─────────────────────────────────────────────────────────────

/**
 * Wire navbar scroll-shrink, active-link tracking, and hamburger toggle.
 */
function _initNavbar() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger-btn');
  const navLinks  = document.getElementById('nav-links');

  // ── Scroll → .navbar--scrolled ────────────────────────────
  if (navbar) {
    const onScroll = debounce(() => {
      if (window.scrollY > 80) {
        navbar.classList.add('navbar--scrolled');
      } else {
        navbar.classList.remove('navbar--scrolled');
      }
    }, 50);
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ── Active nav-link via IntersectionObserver ──────────────
  const sections = document.querySelectorAll('main section[id]');
  if (sections.length) {
    const sectionObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            document.querySelectorAll('.nav-link').forEach(link => {
              link.classList.remove('nav-link--active');
              if (link.getAttribute('href') === `#${id}`) {
                link.classList.add('nav-link--active');
              }
            });
          }
        });
      },
      { threshold: 0.5 }
    );
    sections.forEach(sec => sectionObserver.observe(sec));
  }

  // ── Hamburger ─────────────────────────────────────────────
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('nav-menu--open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // ── Back to Top ───────────────────────────────────────────
  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    backToTop.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }
}

/**
 * Wire IntersectionObserver (threshold 0.1) on section-hidden sections.
 * When a hidden section scrolls into view, removes section-hidden and adds revealed.
 * Skips when prefers-reduced-motion is set.
 */
function _initSectionReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Ensure everything is visible if reduced-motion is preferred
    document.querySelectorAll('section').forEach(s => {
      s.classList.remove('section-hidden');
      s.classList.add('revealed');
    });
    return;
  }

  const hiddenSections = document.querySelectorAll('section.section-hidden');
  if (!hiddenSections.length) return;

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('section-hidden');
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  hiddenSections.forEach(sec => observer.observe(sec));
}

// ─────────────────────────────────────────────────────────────
// TASK 15.1 — HERO PARTICLE ANIMATION
// ─────────────────────────────────────────────────────────────

/**
 * Export: initialise the hero canvas particle animation.
 * Skips entirely if prefers-reduced-motion is active.
 */
export function initParticles() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  /** @type {Array<{x:number, y:number, vx:number, vy:number, r:number, alpha:number}>} */
  const particles = [];
  const COUNT = 60;

  /** Resize canvas to match the hero section dimensions */
  function resizeCanvas() {
    const hero = document.getElementById('hero');
    if (hero) {
      canvas.width  = hero.offsetWidth;
      canvas.height = hero.offsetHeight;
    } else {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }

  /** Spawn a particle at a random position */
  function spawnParticle() {
    return {
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height,
      vx:    (Math.random() - 0.5) * 0.6,
      vy:    (Math.random() - 0.5) * 0.6,
      r:     Math.random() * 2.5 + 0.5,
      alpha: Math.random() * 0.5 + 0.2,
    };
  }

  // Initialise particles
  resizeCanvas();
  for (let i = 0; i < COUNT; i++) {
    particles.push(spawnParticle());
  }

  // Debounced resize handler
  const onResize = debounce(() => {
    resizeCanvas();
    // Re-clamp positions that now fall outside the canvas
    particles.forEach(p => {
      p.x = clamp(p.x, 0, canvas.width);
      p.y = clamp(p.y, 0, canvas.height);
    });
  }, 200);
  window.addEventListener('resize', onResize, { passive: true });

  // Animation loop
  let rafId = null;

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      // Move
      p.x += p.vx;
      p.y += p.vy;

      // Wrap at canvas edges
      if (p.x < -p.r)              p.x = canvas.width  + p.r;
      if (p.x > canvas.width  + p.r) p.x = -p.r;
      if (p.y < -p.r)              p.y = canvas.height + p.r;
      if (p.y > canvas.height + p.r) p.y = -p.r;

      // Draw dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(34, 197, 94, ${p.alpha})`; // green-500
      ctx.fill();
    });

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);

  // Clean up if the hero section is removed from DOM (SPA-style)
  // (optional guard — harmless for static page)
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
  };
}


// (EventBus subscriptions are registered inside init() above)

/* ─────────────────────────────────────────────────────────────────────────
 * Contact Form — Web3Forms integration
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Initialise the contact form with client-side validation and
 * Web3Forms submission (https://web3forms.com).
 * Called once from main.js after DOMContentLoaded.
 */
export function initContactForm() {
  const form       = document.getElementById('contact-form');
  const submitBtn  = document.getElementById('contact-submit');
  const submitText = document.getElementById('contact-submit-text');
  const successEl  = document.getElementById('contact-success');
  const errorEl    = document.getElementById('contact-error');

  if (!form) return;

  // Field descriptors for validation
  const fields = [
    { id: 'contact-name',    errorId: 'contact-name-error',    label: 'Name' },
    { id: 'contact-email',   errorId: 'contact-email-error',   label: 'Email' },
    { id: 'contact-message', errorId: 'contact-message-error', label: 'Message' },
  ];

  /** Show an inline error message for a field */
  function setFieldError(errorId, msg) {
    const el = document.getElementById(errorId);
    if (el) { el.textContent = msg; }
  }

  /** Clear all inline errors */
  function clearErrors() {
    fields.forEach(f => setFieldError(f.errorId, ''));
    successEl.hidden = true;
    errorEl.hidden   = true;
  }

  /** Validate all fields; return true if form is valid */
  function validate() {
    let valid = true;

    fields.forEach(({ id, errorId, label }) => {
      const el = document.getElementById(id);
      if (!el) return;

      const val = el.value.trim();

      if (!val) {
        setFieldError(errorId, `${label} is required.`);
        valid = false;
        return;
      }

      // Email format check
      if (id === 'contact-email') {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRe.test(val)) {
          setFieldError(errorId, 'Please enter a valid email address.');
          valid = false;
        }
      }
    });

    return valid;
  }

  /** Set the button into loading / normal state */
  function setLoading(loading) {
    submitBtn.disabled = loading;
    if (submitText) {
      submitText.textContent = loading ? 'Sending…' : 'Send Message';
    }
    const icon = submitBtn.querySelector('i');
    if (icon) {
      icon.className = loading
        ? 'fa-solid fa-spinner fa-spin'
        : 'fa-solid fa-paper-plane';
      icon.setAttribute('aria-hidden', 'true');
    }
  }

  /** Show only one banner at a time and auto-dismiss after 5 s */
  function showBanner(el, html) {
    // Hide both first
    successEl.hidden = true;
    errorEl.hidden   = true;

    el.innerHTML = html;
    el.hidden    = false;

    // Auto-hide after 5 seconds
    clearTimeout(el._dismissTimer);
    el._dismissTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    if (!validate()) {
      showBanner(
        errorEl,
        '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Please fill in all required fields correctly.'
      );
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData(form);
      const object   = Object.fromEntries(formData.entries());
      const json     = JSON.stringify(object);

      const res = await fetch('https://api.web3forms.com/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    json,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showBanner(
          successEl,
          '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Message sent successfully. We\'ll be in touch soon.'
        );
        form.reset();
      } else {
        showBanner(
          errorEl,
          '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Something went wrong. Please try again later.'
        );
        console.error('Web3Forms error:', data);
      }
    } catch (err) {
      showBanner(
        errorEl,
        '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Something went wrong. Please try again later.'
      );
      console.error('Network error:', err);
    } finally {
      setLoading(false);
    }
  });
}
