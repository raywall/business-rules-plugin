/**
 * process-plugin.js  — GitHub Pages / marked.js plugin for ```process blocks
 *
 * Usage (add to your Jekyll _layouts/default.html or any HTML page):
 *
 *   <script>window.PROCESS_ENGINE_URL = 'https://rules.raysouz.studio';</script>
 *   <script>window.PROCESS_ENGINE_SERIAL = 'uuid-da-assinatura';</script>
 *   <link  rel="stylesheet" href="/assets/process-plugin.css">
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js"></script>
 *   <script src="/assets/process-plugin.js"></script>
 *
 * Blocks can contain the full YAML or reference a YAML file:
 *
 *   ```process
 *   src: examples/order-review.yaml
 *   ```
 */
(function () {
  'use strict';

  /* ── Configuration ─────────────────────────────────────────────────────── */
  const LAMBDA_URL = normalizeEngineUrl(window.PROCESS_ENGINE_URL || 'https://rules.raysouz.studio');
  const STEP_DELAY_MS = 380;   // delay between step card reveals
  const RESULT_DELAY_MS = 600; // extra delay before final result card

  /* ── Block registry ────────────────────────────────────────────────────── */
  const _blocks = {};

  /* ── Status display config ─────────────────────────────────────────────── */
  const STATUS = {
    PASSED: { label: 'Passou', icon: '✓', cls: 'green' },
    FAILED: { label: 'Falhou', icon: '✗', cls: 'red' },
    ABORTED: { label: 'Abortado', icon: '⊘', cls: 'red' },
    SKIPPED: { label: 'Ignorado', icon: '⇢', cls: 'gray' },
    COMPUTED: { label: 'Calculado', icon: '⊞', cls: 'blue' },
    RESULT: { label: 'Resultado', icon: '⬟', cls: 'purple' },
    ERROR: { label: 'Erro', icon: '⚠', cls: 'orange' },
  };

  const FINAL_STATUS = {
    COMPLETED: { label: 'Concluído', cls: 'green' },
    ABORTED: { label: 'Abortado', cls: 'red' },
    ERROR: { label: 'Erro', cls: 'orange' },
  };

  /* ════════════════════════════════════════════════════════════════════════
     DOM SCANNING — find code.language-process (Jekyll/kramdown output)
     and replace each with the interactive widget.
  ════════════════════════════════════════════════════════════════════════ */
  function init() {
    // Cover the different HTML structures GitHub Pages / kramdown may produce
    const candidates = [
      ...document.querySelectorAll('code.language-process'),
      ...document.querySelectorAll('.language-process code'),
      ...document.querySelectorAll('pre code[class*="language-process"]'),
    ];

    // Deduplicate (some selectors may match the same element)
    const seen = new Set();
    candidates.forEach(code => {
      if (seen.has(code)) return;
      seen.add(code);
      mountWidget(code);
    });
  }

  async function mountWidget(codeEl) {
    let yaml = codeEl.textContent.trim();
    const target = codeEl.closest('pre') || codeEl;
    let proc;
    try {
      proc = parseProcessBlock(yaml);
    } catch (e) {
      target.replaceWith(errorBox('process parse error: ' + e.message));
      return;
    }

    if (proc && typeof proc.src === 'string' && proc.src.trim()) {
      const loading = el('div', { class: 'pe-loading' });
      loading.textContent = 'Carregando regras de ' + proc.src + '...';
      target.replaceWith(loading);

      try {
        yaml = await fetchYaml(proc.src);
        proc = jsyaml.load(yaml);
      } catch (e) {
        loading.replaceWith(errorBox('process src load error: ' + e.message));
        return;
      }

      mountResolvedWidget(loading, yaml, proc);
      return;
    }

    mountResolvedWidget(target, yaml, proc);
  }

  function parseProcessBlock(yaml) {
    const trimmed = yaml.trim();
    if (/^[^\n\r:]+\.ya?ml(?:[?#].*)?$/i.test(trimmed)) {
      return { src: trimmed };
    }
    return jsyaml.load(trimmed);
  }

  async function fetchYaml(src) {
    const url = new URL(src, document.baseURI).toString();
    const res = await fetch(url, { headers: { 'Accept': 'application/x-yaml,text/yaml,text/plain,*/*' } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao carregar ${src}`);
    }
    return res.text();
  }

  function mountResolvedWidget(target, yaml, proc) {
    const id = 'pe-' + Math.random().toString(36).slice(2, 10);
    _blocks[id] = { yaml, proc };

    const widget = buildWidget(id, proc);
    target.replaceWith(widget);
  }

  function render(container, yamlText) {
    if (!container) return;
    container.innerHTML = '';

    const pre = el('pre');
    const code = el('code', { class: 'language-process' });
    code.textContent = yamlText;
    pre.appendChild(code);
    container.appendChild(pre);

    return mountWidget(code);
  }

  function errorBox(message) {
    const err = document.createElement('div');
    err.className = 'pe-parse-error';
    err.textContent = '⚠ ' + message;
    return err;
  }

  /* ════════════════════════════════════════════════════════════════════════
     WIDGET BUILDER
  ════════════════════════════════════════════════════════════════════════ */
  function buildWidget(id, proc) {
    const wrap = el('div', { class: 'pe-widget', id });

    /* Header ── */
    const header = el('div', { class: 'pe-header' });
    header.innerHTML = `
      <div class="pe-title">
        <span class="pe-title-icon">
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 2L3 6v8l7 4 7-4V6l-7-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M3 6l7 4m0 0l7-4m-7 4v8" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </span>
        <span class="pe-process-name">${esc(proc.name || 'Process')}</span>
        <span class="pe-badge-steps">${(proc.steps || []).length} steps</span>
      </div>
      ${proc.description ? `<p class="pe-desc">${esc(proc.description)}</p>` : ''}
    `;
    wrap.appendChild(header);

    /* Body: inputs + mocks ── */
    const body = el('div', { class: 'pe-body' });

    /* — Input fields — */
    if (proc.input && Object.keys(proc.input).length > 0) {
      const section = el('div', { class: 'pe-section' });
      section.innerHTML = `<h4 class="pe-section-title"><span>↳</span> Dados de Entrada</h4>`;
      const grid = el('div', { class: 'pe-inputs-grid' });
      for (const [key, field] of Object.entries(proc.input)) {
        const wrap2 = el('div', { class: 'pe-field' });
        const labelText = field.label || key;
        const label = el('label', {
          class: 'pe-label',
          for: `${id}-in-${key}`,
          title: field.description || labelText,
        });
        const labelContent = el('span', { class: 'pe-label-text' });
        labelContent.textContent = labelText;
        const badge = el('span', { class: `pe-type-badge pe-type-${field.type || 'string'}` });
        badge.textContent = field.type || 'string';
        label.appendChild(labelContent);
        label.appendChild(badge);
        const input = el('input', {
          class: 'pe-input',
          id: `${id}-in-${key}`,
          type: field.type === 'number' ? 'number' : 'text',
          placeholder: String(field.example ?? ''),
          value: String(field.example ?? ''),
          'data-field': key,
          'data-type': field.type || 'string',
        });
        wrap2.appendChild(label);
        wrap2.appendChild(input);
        grid.appendChild(wrap2);
      }
      section.appendChild(grid);
      body.appendChild(section);
    }

    /* — Mock editors — */
    if (proc.mocks && Object.keys(proc.mocks).length > 0) {
      const section = el('div', { class: 'pe-section' });
      section.innerHTML = `<h4 class="pe-section-title"><span>⇄</span> Mocks</h4>`;
      for (const [key, mock] of Object.entries(proc.mocks)) {
        const mockWrap = el('div', { class: 'pe-mock' });
        const mockHead = el('button', { class: 'pe-mock-head', type: 'button' });
        mockHead.innerHTML = `
          <span class="pe-mock-key">${esc(key)}</span>
          <span class="pe-mock-source">${esc(mock.source || '')}</span>
          <span class="pe-mock-chevron">▸</span>
        `;
        const mockBody = el('div', { class: 'pe-mock-body' });
        const textarea = el('textarea', {
          class: 'pe-mock-editor',
          id: `${id}-mock-${key}`,
          spellcheck: 'false',
        });
        textarea.textContent = JSON.stringify(mock.data || {}, null, 2);
        mockBody.appendChild(textarea);
        mockHead.addEventListener('click', () => {
          mockBody.classList.toggle('pe-mock-open');
          mockHead.querySelector('.pe-mock-chevron').textContent =
            mockBody.classList.contains('pe-mock-open') ? '▾' : '▸';
        });
        mockWrap.appendChild(mockHead);
        mockWrap.appendChild(mockBody);
        section.appendChild(mockWrap);
      }
      body.appendChild(section);
    }

    wrap.appendChild(body);

    /* Footer: run button ── */
    const footer = el('div', { class: 'pe-footer' });
    const btn = el('button', { class: 'pe-btn-run', id: `${id}-btn`, type: 'button' });
    btn.innerHTML = `<span class="pe-btn-icon">▶</span><span class="pe-btn-label">Simular</span>`;
    const statusText = el('span', { class: 'pe-run-status', id: `${id}-run-status` });
    footer.appendChild(btn);
    footer.appendChild(statusText);
    wrap.appendChild(footer);

    /* Result container ── */
    const resultContainer = el('div', { class: 'pe-result', id: `${id}-result` });
    wrap.appendChild(resultContainer);

    /* Wire up the simulate button */
    btn.addEventListener('click', () => simulate(id));

    return wrap;
  }

  /* ════════════════════════════════════════════════════════════════════════
     SIMULATE
  ════════════════════════════════════════════════════════════════════════ */
  async function simulate(id) {
    const { yaml, proc } = _blocks[id];
    const btn = document.getElementById(`${id}-btn`);
    const statusEl = document.getElementById(`${id}-run-status`);
    const resultEl = document.getElementById(`${id}-result`);
    const serialNumber = getSerialNumber();

    if (!serialNumber) {
      setStatus(statusEl, '✗ Número de série não configurado', 'error');
      return;
    }

    /* Gather input values */
    const inputData = {};
    if (proc.input) {
      for (const [key, field] of Object.entries(proc.input)) {
        const inputEl = document.getElementById(`${id}-in-${key}`);
        if (!inputEl) continue;
        const raw = inputEl.value.trim();
        if (field.type === 'number') {
          inputData[key] = raw === '' ? null : parseFloat(raw);
        } else if (field.type === 'boolean') {
          inputData[key] = raw === 'true' || raw === '1';
        } else {
          inputData[key] = raw;
        }
      }
    }

    /* Gather mock overrides */
    const mockOverrides = {};
    if (proc.mocks) {
      for (const key of Object.keys(proc.mocks)) {
        const ta = document.getElementById(`${id}-mock-${key}`);
        if (!ta) continue;
        try {
          mockOverrides[key] = JSON.parse(ta.value);
        } catch (_) {
          setStatus(statusEl, '⚠ JSON inválido no mock "' + key + '"', 'error');
          return;
        }
      }
    }

    /* UI: loading state */
    btn.disabled = true;
    btn.classList.add('pe-btn-loading');
    btn.querySelector('.pe-btn-label').textContent = 'Executando…';
    setStatus(statusEl, '', '');
    resultEl.innerHTML = '';
    resultEl.style.display = 'none';

    try {
      const res = await fetch(`${LAMBDA_URL}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial_number: serialNumber,
          yaml,
          input: inputData,
          mock_overrides: mockOverrides,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const result = await res.json();
      await renderTrace(id, result);
      setStatus(statusEl, '', '');
    } catch (e) {
      setStatus(statusEl, '✗ ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('pe-btn-loading');
      btn.querySelector('.pe-btn-label').textContent = 'Simular';
    }
  }

  function getSerialNumber() {
    let serial = String(window.PROCESS_ENGINE_SERIAL || sessionStorage.getItem('PROCESS_ENGINE_SERIAL') || '').trim();
    if (!serial && window.PROCESS_ENGINE_PROMPT_SERIAL) {
      serial = String(window.prompt('Número de série') || '').trim();
      if (serial) {
        window.PROCESS_ENGINE_SERIAL = serial;
        sessionStorage.setItem('PROCESS_ENGINE_SERIAL', serial);
      }
    }
    return serial;
  }

  function normalizeEngineUrl(url) {
    return String(url || '')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/simulate$/, '');
  }

  /* ════════════════════════════════════════════════════════════════════════
     TRACE RENDERER — animated step-by-step flow
  ════════════════════════════════════════════════════════════════════════ */
  async function renderTrace(id, result) {
    const container = document.getElementById(`${id}-result`);
    container.style.display = 'block';

    const finalCfg = FINAL_STATUS[result.final_status] || { label: result.final_status, cls: 'gray' };

    /* Scaffold */
    container.innerHTML = `
      <div class="pe-trace">
        <div class="pe-trace-header">
          <span class="pe-trace-title">Execução</span>
          <span class="pe-final-badge pe-badge-${finalCfg.cls} pe-badge-pending" id="${id}-final-badge">
            ${finalCfg.label}
          </span>
        </div>
        <div class="pe-flow" id="${id}-flow"></div>
        <div class="pe-final-result" id="${id}-final-result" style="opacity:0;transform:translateY(12px)"></div>
      </div>
    `;

    const flowEl = document.getElementById(`${id}-flow`);

    /* Animate steps */
    for (let i = 0; i < result.steps.length; i++) {
      await sleep(STEP_DELAY_MS);
      appendStepCard(flowEl, result.steps[i], i, result.steps.length);
    }

    /* Reveal final badge */
    await sleep(250);
    const badge = document.getElementById(`${id}-final-badge`);
    if (badge) badge.classList.remove('pe-badge-pending');

    /* Show final result */
    if (result.final_result && Object.keys(result.final_result).length > 0) {
      await sleep(RESULT_DELAY_MS);
      showFinalResult(`${id}-final-result`, result.final_result, result.final_status);
    }
  }

  function appendStepCard(container, step, index, total) {
    const cfg = STATUS[step.status] || { label: step.status, icon: '?', cls: 'gray' };
    const isLast = index === total - 1;

    /* Connector arrow */
    if (index > 0) {
      const arrow = el('div', { class: `pe-connector pe-connector-${cfg.cls}` });
      arrow.innerHTML = `<span class="pe-connector-line"></span><span class="pe-connector-arrow">▼</span>`;
      container.appendChild(arrow);
    }

    const card = el('div', { class: `pe-step-card pe-step-${cfg.cls} pe-entering` });

    /* Card header row */
    let headerHTML = `
      <div class="pe-step-header">
        <span class="pe-step-num">${index + 1}</span>
        <span class="pe-step-icon pe-icon-${cfg.cls}">${cfg.icon}</span>
        <span class="pe-step-name">${esc(step.name)}</span>
        <span class="pe-step-badge pe-badge-${cfg.cls}">${cfg.label}</span>
      </div>
    `;

    /* Description */
    if (step.description) {
      headerHTML += `<p class="pe-step-desc">${esc(step.description)}</p>`;
    }

    /* Mock source */
    if (step.mock_source) {
      const assignLabel = step.assigned_var ? ` → <code>${esc(step.assigned_var)}</code>` : '';
      headerHTML += `
        <div class="pe-step-mock-row">
          <span class="pe-mock-pill">mock</span>
          <span class="pe-mock-src">${esc(step.mock_source)}</span>
          ${assignLabel ? `<span class="pe-assign-label">${assignLabel}</span>` : ''}
        </div>
      `;
    }

    /* Condition */
    if (step.condition_expr) {
      const condResult = step.condition_result;
      const condIcon = condResult === true ? '✓ true' : condResult === false ? '✗ false' : '—';
      const condCls = condResult === true ? 'pe-cond-true' : condResult === false ? 'pe-cond-false' : '';
      headerHTML += `
        <div class="pe-step-condition">
          <span class="pe-cond-label">condição</span>
          <code class="pe-cond-expr">${esc(step.condition_expr)}</code>
          <span class="pe-cond-result ${condCls}">${condIcon}</span>
        </div>
      `;
    }

    /* Computed / result vars */
    if (step.computed_vars && Object.keys(step.computed_vars).length > 0) {
      headerHTML += `
        <details class="pe-step-vars" ${step.status === 'RESULT' ? 'open' : ''}>
          <summary class="pe-vars-summary">
            ${step.status === 'RESULT' ? '⬟ resultado final' : '⊞ variáveis calculadas'}
          </summary>
          <pre class="pe-vars-pre">${esc(JSON.stringify(step.computed_vars, null, 2))}</pre>
        </details>
      `;
    }

    /* Assigned mock data (collapsed by default) */
    if (step.assigned_data && Object.keys(step.assigned_data).length > 0 && step.status !== 'ERROR') {
      headerHTML += `
        <details class="pe-step-vars pe-step-mock-data">
          <summary class="pe-vars-summary">⇄ dados do mock (${esc(step.assigned_var || '')})</summary>
          <pre class="pe-vars-pre">${esc(JSON.stringify(step.assigned_data, null, 2))}</pre>
        </details>
      `;
    }

    /* Message */
    if (step.message) {
      headerHTML += `<div class="pe-step-msg pe-msg-${cfg.cls}">${esc(step.message)}</div>`;
    }

    card.innerHTML = headerHTML;
    container.appendChild(card);

    /* Trigger CSS entrance animation on next frame */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.classList.remove('pe-entering');
        card.classList.add('pe-entered');
      });
    });
  }

  function showFinalResult(elId, data, status) {
    const el2 = document.getElementById(elId);
    if (!el2) return;
    const cfg = FINAL_STATUS[status] || { label: status, cls: 'gray' };
    el2.className = `pe-final-result pe-final-${cfg.cls}`;
    el2.innerHTML = `
      <div class="pe-final-header">
        <span class="pe-final-icon">${status === 'COMPLETED' ? '✦' : status === 'ABORTED' ? '⊘' : '⚠'}</span>
        <span class="pe-final-title">Resultado Final</span>
        <span class="pe-final-status-label">${cfg.label}</span>
      </div>
      <pre class="pe-final-json">${esc(JSON.stringify(data, null, 2))}</pre>
    `;
    /* Animate in */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el2.style.opacity = '1';
        el2.style.transform = 'translateY(0)';
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     UTILITIES
  ════════════════════════════════════════════════════════════════════════ */
  function el(tag, attrs) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        e.setAttribute(k, v);
      }
    }
    return e;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function setStatus(el2, msg, type) {
    if (!el2) return;
    el2.textContent = msg;
    el2.className = 'pe-run-status' + (type ? ' pe-run-status-' + type : '');
  }

  /* ════════════════════════════════════════════════════════════════════════
     INIT — run after DOM is ready
  ════════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Expose for manual re-init (e.g. after dynamic content loads) */
  window.ProcessPlugin = { init, render, simulate };
}());
