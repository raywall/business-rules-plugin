'use strict';

document.addEventListener('business-rules:step-select', event => {
  if (!el?.viewer || !el.viewer.contains(event.target)) return;
  el.viewer.querySelectorAll('.pe-step-card--selected').forEach(card => {
    card.classList.remove('pe-step-card--selected');
  });
  event.target?.closest?.('.pe-step-card')?.classList.add('pe-step-card--selected');
  Editor.scrollToStep(event.detail || {});
});

/* ================================================================
   PLUGIN BRIDGE
   Detecta a API exposta pelo process-plugin.js e fornece uma função
   única `pluginRender(container, yamlText)` para o Studio usar.

   O process-plugin.js pode expor a função de render com qualquer
   destes nomes. O Studio tenta todos em ordem até encontrar um
   que funcione. Quando nenhum é encontrado, exibe diagnóstico.
   ================================================================ */
const PluginBridge = {

  /**
   * Tenta renderizar o YAML dentro do container usando a API
   * do process-plugin.js. Retorna true se bem-sucedido.
   *
   * Estratégias tentadas:
   *  1. Funções globais diretas (nomes mais prováveis)
   *  2. Namespace window.ProcessPlugin / window.processPlugin
   *  3. Injetar bloco DOM e chamar re-scan do plugin
   *  4. Injetar bloco DOM e disparar CustomEvent de re-scan
   */
  async render(container, yamlText) {
    // ── Estratégia 1: função global direta ──
    const globalFns = [
      'renderProcess',
      'renderProcessBlock',
      'renderBusinessRule',
      'initProcessBlock',
    ];
    for (const fn of globalFns) {
      if (typeof window[fn] === 'function') {
        await window[fn](container, yamlText);
        return true;
      }
    }

    // ── Estratégia 2: namespace de objeto ──
    const namespaces = [
      window.ProcessPlugin,
      window.processPlugin,
      window.BusinessRulesPlugin,
      window.businessRulesPlugin,
    ];
    for (const ns of namespaces) {
      if (!ns) continue;
      const directMethod = ns.render || ns.renderProcess || ns.renderBlock;
      if (typeof directMethod === 'function') {
        await directMethod.call(ns, container, yamlText);
        return true;
      }
      if (typeof ns.init === 'function') {
        container.appendChild(this._createProcessBlock(yamlText));
        await ns.init();
        return true;
      }
    }

    // ── Estratégia 3: injetar bloco e chamar re-scan ──
    const block = this._createProcessBlock(yamlText);
    container.appendChild(block);

    const scanFns = [
      'initProcessBlocks',
      'scanProcessBlocks',
      'renderProcessBlocks',
      'processAllBlocks',
    ];
    for (const fn of scanFns) {
      if (typeof window[fn] === 'function') {
        await window[fn](container);
        return true;
      }
    }

    // ── Estratégia 4: CustomEvent de re-scan ──
    const events = ['process-init', 'rules-init', 'plugin-init'];
    for (const evt of events) {
      container.dispatchEvent(new CustomEvent(evt, { bubbles: true, detail: { container } }));
    }

    // Se o bloco foi processado pelo plugin via evento, o conteúdo
    // terá sido substituído. Verifica se ainda é um <pre> cru.
    if (container.querySelector('pre') && !container.querySelector('.process-block, .rule-block, [data-processed]')) {
      // Nenhuma estratégia funcionou — mostra diagnóstico
      container.innerHTML = '';
      container.appendChild(this._createDiagnostic());
      return false;
    }

    return true;
  },

  /** Cria o bloco DOM que o plugin espera para blocos `process` */
  _createProcessBlock(yamlText) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-process';
    code.textContent = yamlText;
    pre.appendChild(code);
    return pre;
  },

  /** UI de diagnóstico quando nenhuma API é encontrada */
  _createDiagnostic() {
    const div = document.createElement('div');
    div.className = 'preview-diagnostic';

    // Lista as APIs encontradas no window para ajudar no debug
    const found = Object.keys(window).filter(k =>
      /process|plugin|rules|render|block/i.test(k) &&
      typeof window[k] === 'function'
    ).slice(0, 12);

    div.innerHTML = `
      <div class="preview-diagnostic-icon">⚠</div>
      <h3>Plugin não conectado</h3>
      <p>
        O <code>process-plugin.js</code> está carregado, mas não expõe
        uma função de render reconhecida pelo Studio.
      </p>
      <p>
        Abra o console do navegador e execute <code>Object.keys(window)</code>
        para localizar a função correta, depois adicione-a à lista em
        <code>studio.preview.js → PluginBridge.render()</code>.
      </p>
      ${found.length ? `<p class="preview-diagnostic-hint">Possíveis candidatos encontrados: <code>${found.join(', ')}</code></p>` : ''}
    `;
    return div;
  }
};

/* ================================================================
   ACTIONS — preview domain
   ================================================================ */
Object.assign(Actions, {

  async render() {
    const yaml = Editor.get().trim();
    if (!yaml) return;

    let doc;
    try {
      doc = jsyaml.load(yaml);
    } catch (e) {
      alert('YAML inválido:\n' + e.message);
      return;
    }

    el.rulesTitle.textContent = doc?.name || 'Simulador';
    el.viewer.innerHTML = '';

    if (state.previewMode === 'macro') {
      await this.renderMacro(doc, yaml);
      return;
    }

    el.viewer.classList.remove('viewer--macro');
    await PluginBridge.render(el.viewer, yaml);
    this.applyPreviewTheme();
  },

  setPreviewMode(mode) {
    state.previewMode = mode === 'macro' ? 'macro' : 'detail';
    localStorage.setItem(STORAGE_KEYS.previewMode, state.previewMode);
    this.syncPreviewModeButtons();
    this.render();
  },

  syncPreviewModeButtons() {
    el.viewDetail?.classList.toggle('tool-button--active', state.previewMode === 'detail');
    el.viewMacro?.classList.toggle('tool-button--active', state.previewMode === 'macro');
  },

  async renderMacro(doc, yaml) {
    el.viewer.classList.add('viewer--macro');
    const graph = await Flowchart.build(doc);
    el.viewer.innerHTML = Flowchart.render(graph);
    initFlowchartInteraction(el.viewer.querySelector('.flowchart-canvas'));
  },

  toggleTheme() {
    const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = next;
    localStorage.setItem(STORAGE_KEYS.theme, next);
    el.toggleTheme.textContent = next === 'light' ? 'Dark' : 'Light';
    this.applyPreviewTheme();
  },

  applyPreviewTheme() {
    const isLight = document.body.dataset.theme === 'light';
    el.viewer.querySelectorAll('.pe-widget').forEach(widget => {
      widget.classList.toggle('pe-theme-clear', isLight);
    });
  },

  configureSerial() {
    const val = prompt('Serial de autenticação (UUID):', window.PROCESS_ENGINE_SERIAL || '');
    if (val === null) return;
    window.PROCESS_ENGINE_SERIAL = val;
    sessionStorage.setItem('PROCESS_ENGINE_SERIAL', val);
  },

  configureEngine() {
    const val = prompt('URL do backend:', window.PROCESS_ENGINE_URL || '');
    if (val === null) return;
    window.PROCESS_ENGINE_URL = val;
    localStorage.setItem('PROCESS_ENGINE_URL', val);
  },

  toggleWorkspacePanel() {
    const panel = el.workspacePanel;
    const nextCollapsed = !state.collapsed;
    if (nextCollapsed) {
      const currentHeight = panel.getBoundingClientRect().height;
      if (currentHeight > 36) {
        panel._savedHeight = currentHeight;
        localStorage.setItem(STORAGE_KEYS.workspaceHeight, String(Math.round(currentHeight)));
      }
    }

    state.collapsed = nextCollapsed;
    panel.classList.toggle('ws-panel--collapsed', state.collapsed);
    el.collapseWorkspaceBtn.textContent = state.collapsed ? '▸' : '▾';
    el.collapseWorkspaceBtn.title = state.collapsed ? 'Expandir workspace' : 'Recolher workspace';
    localStorage.setItem(STORAGE_KEYS.workspaceCollapsed, String(state.collapsed));
    if (!state.collapsed) {
      const savedHeight = Number.parseInt(localStorage.getItem(STORAGE_KEYS.workspaceHeight) || '', 10);
      const memoryHeight = Number.isFinite(panel._savedHeight) && panel._savedHeight > 36 ? panel._savedHeight : null;
      const persistedHeight = Number.isFinite(savedHeight) && savedHeight > 36 ? savedHeight : null;
      const restoreHeight = memoryHeight || persistedHeight || 260;
      panel.style.height = restoreHeight + 'px';
    }
  }
});

const Flowchart = {
  async build(rootDoc) {
    const nodes = [];
    const edges = [];
    const visited = new Set();
    const rootService = state.current.serviceName || 'script';
    const rootUsecase = state.current.fileName || 'atual.yaml';
    const rootKey = `${rootService}/${rootUsecase}`;

    async function visit(doc, service, usecase, depth, sourceKey = null) {
      const key = `${service}/${usecase}`;
      let node = nodes.find(item => item.key === key);
      if (!node) {
        node = {
          key,
          service,
          usecase,
          label: doc?.name || stripYamlExtension(usecase),
          description: doc?.description || '',
          depth,
          missing: false,
        };
        nodes.push(node);
      } else {
        node.depth = Math.min(node.depth, depth);
      }

      if (sourceKey) edges.push({ from: sourceKey, to: key });
      if (visited.has(key)) return;
      visited.add(key);

      if (!doc || !Array.isArray(doc.links)) return;
      for (const link of doc.links) {
        if (!link || !link.service || !link.usecase) continue;
        const targetService = String(link.service);
        const targetUsecase = normalizeUsecaseName(link.usecase);
        const targetKey = `${targetService}/${targetUsecase}`;
        const file = findWorkspaceFile(targetService, targetUsecase);
        if (!file) {
          if (!nodes.find(item => item.key === targetKey)) {
            nodes.push({
              key: targetKey,
              service: targetService,
              usecase: targetUsecase,
              label: stripYamlExtension(targetUsecase),
              description: 'Usecase nao encontrado no workspace.',
              depth: depth + 1,
              missing: true,
            });
          }
          edges.push({ from: key, to: targetKey });
          continue;
        }

        const yaml = await FS.readFile(file.handle);
        let targetDoc = null;
        try {
          targetDoc = jsyaml.load(yaml);
        } catch (_) {
          targetDoc = { name: stripYamlExtension(targetUsecase), description: 'YAML invalido.' };
        }
        await visit(targetDoc, targetService, targetUsecase, depth + 1, key);
      }
    }

    await visit(rootDoc, rootService, rootUsecase, 0);
    return { rootKey, nodes, edges: dedupeEdges(edges) };
  },

  render(graph) {
    const levels = groupByDepth(graph.nodes);
    const nodeWidth = 250;
    const nodeHeight = Math.max(104, 70 + maxWrappedLabelLines(graph.nodes, 26) * 17);
    const xGap = 330;
    const yGap = 150;
    const margin = 48;
    const positions = new Map();
    const maxDepth = Math.max(0, ...graph.nodes.map(node => node.depth));
    let maxRows = 1;

    levels.forEach((levelNodes, depth) => {
      maxRows = Math.max(maxRows, levelNodes.length);
      levelNodes.forEach((node, index) => {
        positions.set(node.key, {
          x: margin + depth * xGap,
          y: margin + index * yGap,
        });
      });
    });

    const width = margin * 2 + nodeWidth + maxDepth * xGap;
    const height = margin * 2 + nodeHeight + (maxRows - 1) * yGap;
    const edgeMarkup = graph.edges.map(edge => renderEdge(edge, positions, nodeWidth, nodeHeight)).join('');
    const nodeMarkup = graph.nodes.map(node => renderNode(node, positions.get(node.key), nodeWidth, nodeHeight)).join('');
    const hasLinks = graph.edges.length > 0;

    return `
      <section class="flowchart-view" aria-label="Visualizacao macro dos microservicos">
        <div class="flowchart-canvas">
          <div class="flowchart-controls" aria-label="Controles do flowchart">
            <button type="button" data-flow-zoom="in" title="Aproximar">+</button>
            <button type="button" data-flow-zoom="out" title="Afastar">-</button>
            <button type="button" data-flow-zoom="reset" title="Resetar visão">1:1</button>
          </div>
          <svg class="flowchart-svg" viewBox="0 0 ${width} ${height}" data-viewbox="0 0 ${width} ${height}" role="img" aria-label="Microservicos interligados">
            <defs>
              <marker id="flowArrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L9,3 z" class="flowchart-arrow" />
              </marker>
            </defs>
            ${edgeMarkup}
            ${nodeMarkup}
          </svg>
        </div>
      </section>
    `;
  },
};

function groupByDepth(nodes) {
  const levels = [];
  [...nodes].sort((a, b) => a.depth - b.depth || a.service.localeCompare(b.service) || a.usecase.localeCompare(b.usecase))
    .forEach(node => {
      if (!levels[node.depth]) levels[node.depth] = [];
      levels[node.depth].push(node);
    });
  return levels;
}

function renderEdge(edge, positions, nodeWidth, nodeHeight) {
  const from = positions.get(edge.from);
  const to = positions.get(edge.to);
  if (!from || !to) return '';
  const startX = from.x + nodeWidth;
  const startY = from.y + nodeHeight / 2;
  const endX = to.x;
  const endY = to.y + nodeHeight / 2;
  const midX = startX + Math.max(40, (endX - startX) / 2);
  const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX - 10} ${endY}`;
  return `<path class="flowchart-edge" d="${path}" marker-end="url(#flowArrow)" />`;
}

function renderNode(node, position, nodeWidth, nodeHeight) {
  if (!position) return '';
  const labelLines = wrapSvgText(node.label, 26);
  const classes = ['flowchart-node'];
  if (node.missing) classes.push('flowchart-node--missing');

  return `
    <g class="${classes.join(' ')}" transform="translate(${position.x} ${position.y})">
      <title>${esc(node.description || `${node.service}/${node.usecase}`)}</title>
      <rect width="${nodeWidth}" height="${nodeHeight}" rx="8" />
      <text class="flowchart-service" x="14" y="22">${esc(node.service)}</text>
      <text class="flowchart-label" x="14" y="43">
        ${labelLines.map((line, index) => `<tspan x="14" dy="${index === 0 ? 0 : 17}">${esc(line)}</tspan>`).join('')}
      </text>
      <text class="flowchart-file" x="14" y="${nodeHeight - 18}">${esc(node.usecase)}</text>
    </g>
  `;
}

function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter(edge => {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripYamlExtension(fileName) {
  return String(fileName).replace(/\.(yaml|yml)$/i, '');
}

function wrapSvgText(value, maxChars) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = '';

  words.forEach(word => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines;
}

function maxWrappedLabelLines(nodes, maxChars) {
  return Math.max(1, ...nodes.map(node => wrapSvgText(node.label, maxChars).length));
}

function initFlowchartInteraction(canvas) {
  if (!canvas) return;
  const svg = canvas.querySelector('.flowchart-svg');
  if (!svg) return;

  const initial = svg.dataset.viewbox.split(' ').map(Number);
  let viewBox = [...initial];
  let dragging = false;
  let start = null;
  let startViewBox = null;

  const apply = () => svg.setAttribute('viewBox', viewBox.join(' '));
  const zoom = (factor, centerX = viewBox[0] + viewBox[2] / 2, centerY = viewBox[1] + viewBox[3] / 2) => {
    const nextW = Math.max(initial[2] * 0.35, Math.min(initial[2] * 3, viewBox[2] * factor));
    const nextH = Math.max(initial[3] * 0.35, Math.min(initial[3] * 3, viewBox[3] * factor));
    const rx = (centerX - viewBox[0]) / viewBox[2];
    const ry = (centerY - viewBox[1]) / viewBox[3];
    viewBox = [centerX - nextW * rx, centerY - nextH * ry, nextW, nextH];
    apply();
  };

  canvas.querySelector('[data-flow-zoom="in"]')?.addEventListener('click', () => zoom(0.82));
  canvas.querySelector('[data-flow-zoom="out"]')?.addEventListener('click', () => zoom(1.18));
  canvas.querySelector('[data-flow-zoom="reset"]')?.addEventListener('click', () => {
    viewBox = [...initial];
    apply();
  });

  svg.addEventListener('wheel', event => {
    event.preventDefault();
    const point = svgPoint(svg, event.clientX, event.clientY);
    zoom(event.deltaY < 0 ? 0.9 : 1.1, point.x, point.y);
  }, { passive: false });

  svg.addEventListener('pointerdown', event => {
    dragging = true;
    start = { x: event.clientX, y: event.clientY };
    startViewBox = [...viewBox];
    svg.setPointerCapture?.(event.pointerId);
    canvas.classList.add('flowchart-canvas--dragging');
  });

  svg.addEventListener('pointermove', event => {
    if (!dragging) return;
    const dx = (event.clientX - start.x) * (viewBox[2] / svg.clientWidth);
    const dy = (event.clientY - start.y) * (viewBox[3] / svg.clientHeight);
    viewBox = [startViewBox[0] - dx, startViewBox[1] - dy, startViewBox[2], startViewBox[3]];
    apply();
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
    svg.addEventListener(type, event => {
      if (!dragging) return;
      dragging = false;
      svg.releasePointerCapture?.(event.pointerId);
      canvas.classList.remove('flowchart-canvas--dragging');
    });
  });
}

function svgPoint(svg, clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

window.PROCESS_ENGINE_GET_CURRENT_SCRIPT = function getCurrentWorkspaceScript() {
  if (!state.current.serviceName || !state.current.fileName) return null;
  return {
    service: state.current.serviceName,
    usecase: state.current.fileName,
  };
};

window.PROCESS_ENGINE_RESOLVE_LINKS = async function resolveWorkspaceLinks() {
  const resolved = [];
  if (!state.workspace.tree.length) return resolved;

  for (const service of state.workspace.tree) {
    for (const file of service.children) {
      const yaml = await FS.readFile(file.handle);
      resolved.push({
        service: service.name,
        usecase: file.name,
        yaml,
      });
    }
  }
  return resolved;
};

function normalizeUsecaseName(usecase) {
  const name = String(usecase).trim();
  return /\.(yaml|yml)$/i.test(name) ? name : `${name}.yaml`;
}

function findWorkspaceFile(serviceName, usecaseName) {
  const service = state.workspace.tree.find(item => item.name === serviceName);
  if (!service) return null;
  return service.children.find(file => file.name === usecaseName) || null;
}
