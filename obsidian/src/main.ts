import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  parseYaml,
  requestUrl,
} from 'obsidian';

interface RulesPluginSettings {
  serialNumber: string;
  cryptoKey?: string;
  theme: 'dark' | 'clear';
}

interface InputField {
  type?: 'string' | 'number' | 'boolean' | string;
  label?: string;
  description?: string;
  example?: unknown;
}

interface MockDef {
  source?: string;
  data?: Record<string, unknown>;
}

interface RuleProcess {
  name?: string;
  description?: string;
  input?: Record<string, InputField>;
  mocks?: Record<string, MockDef>;
  steps?: unknown[];
}

interface SimulationStep {
  name: string;
  status: string;
  description?: string;
  mock_source?: string;
  assigned_var?: string;
  assigned_data?: Record<string, unknown>;
  condition_expr?: string;
  condition_result?: boolean;
  computed_vars?: Record<string, unknown>;
  message?: string;
}

interface SimulationResult {
  process_name?: string;
  final_status: string;
  final_result?: Record<string, unknown>;
  steps: SimulationStep[];
}

const DEFAULT_SETTINGS: RulesPluginSettings = {
  serialNumber: '',
  theme: 'dark',
};

const ENGINE_URL = 'https://rules.raysouz.studio';
const STEP_DELAY_MS = 380;
const RESULT_DELAY_MS = 600;

const STATUS: Record<string, { label: string; icon: string; cls: string }> = {
  PASSED: { label: 'Passou', icon: '✓', cls: 'green' },
  FAILED: { label: 'Falhou', icon: '✗', cls: 'red' },
  ABORTED: { label: 'Abortado', icon: '⊘', cls: 'red' },
  SKIPPED: { label: 'Ignorado', icon: '⇢', cls: 'gray' },
  COMPUTED: { label: 'Calculado', icon: '⊞', cls: 'blue' },
  RESULT: { label: 'Resultado', icon: '⬟', cls: 'purple' },
  ERROR: { label: 'Erro', icon: '⚠', cls: 'orange' },
};

const FINAL_STATUS: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: 'Concluído', cls: 'green' },
  ABORTED: { label: 'Abortado', cls: 'red' },
  ERROR: { label: 'Erro', cls: 'orange' },
};

export default class BusinessRulesEmulatorPlugin extends Plugin {
  settings: RulesPluginSettings;
  private widgets = new Map<string, { yaml: string; proc: RuleProcess }>();

  async onload() {
    await this.loadSettings();
    void this.getCryptoSecret().catch(() => {});
    this.addSettingTab(new RulesSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor('rules', async (source, el) => {
      this.mountRulesBlock(source, el);
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private mountRulesBlock(source: string, container: HTMLElement) {
    const yaml = source.trim();
    let proc: RuleProcess;

    try {
      proc = parseYaml(yaml) as RuleProcess;
    } catch (error) {
      container.empty();
      container
        .createDiv({ cls: 'pe-parse-error' })
        .setText(`rules parse error: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const id = `pe-${Math.random().toString(36).slice(2, 10)}`;
    this.widgets.set(id, { yaml, proc });

    container.empty();
    container.appendChild(this.buildWidget(id, proc));
  }

  private buildWidget(id: string, proc: RuleProcess): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = `pe-widget pe-theme-${this.settings.theme}`;
    wrap.id = id;

    const header = wrap.createDiv({ cls: 'pe-header' });
    const title = header.createDiv({ cls: 'pe-title' });
    const icon = title.createSpan({ cls: 'pe-title-icon' });
    icon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2L3 6v8l7 4 7-4V6l-7-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 6l7 4m0 0l7-4m-7 4v8" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    title.createSpan({ cls: 'pe-process-name', text: proc.name || 'Rules' });
    title.createSpan({ cls: 'pe-badge-steps', text: `${(proc.steps || []).length} steps` });

    if (proc.description) {
      header.createEl('p', { cls: 'pe-desc', text: proc.description });
    }

    const body = wrap.createDiv({ cls: 'pe-body' });
    this.appendInputs(id, proc, body);
    this.appendMocks(id, proc, body);

    const footer = wrap.createDiv({ cls: 'pe-footer' });
    const btn = footer.createEl('button', {
      cls: 'pe-btn-run',
      attr: { id: `${id}-btn`, type: 'button' },
    });
    btn.createSpan({ cls: 'pe-btn-icon', text: '▶' });
    btn.createSpan({ cls: 'pe-btn-label', text: 'Simular' });
    footer.createSpan({ cls: 'pe-run-status', attr: { id: `${id}-run-status` } });

    wrap.createDiv({ cls: 'pe-result', attr: { id: `${id}-result` } });
    btn.addEventListener('click', () => this.simulate(id));

    return wrap;
  }

  private appendInputs(id: string, proc: RuleProcess, body: HTMLElement) {
    if (!proc.input || Object.keys(proc.input).length === 0) return;

    const section = body.createDiv({ cls: 'pe-section' });
    const title = section.createEl('h4', { cls: 'pe-section-title' });
    title.createSpan({ text: '↳' });
    title.appendText(' Dados de Entrada');

    const grid = section.createDiv({ cls: 'pe-inputs-grid' });
    Object.entries(proc.input).forEach(([key, field]) => {
      const fieldWrap = grid.createDiv({ cls: 'pe-field' });
      const labelText = field.label || key;
      const label = fieldWrap.createEl('label', {
        cls: 'pe-label',
        attr: {
          for: `${id}-in-${key}`,
          title: field.description || labelText,
        },
      });
      label.createSpan({
        cls: 'pe-label-text',
        text: labelText,
      });
      label.createSpan({
        cls: `pe-type-badge pe-type-${field.type || 'string'}`,
        text: field.type || 'string',
      });

      fieldWrap.createEl('input', {
        cls: 'pe-input',
        attr: {
          id: `${id}-in-${key}`,
          type: field.type === 'number' ? 'number' : 'text',
          placeholder: String(field.example ?? ''),
          value: String(field.example ?? ''),
          'data-field': key,
          'data-type': field.type || 'string',
        },
      });
    });
  }

  private appendMocks(id: string, proc: RuleProcess, body: HTMLElement) {
    if (!proc.mocks || Object.keys(proc.mocks).length === 0) return;

    const section = body.createDiv({ cls: 'pe-section' });
    const title = section.createEl('h4', { cls: 'pe-section-title' });
    title.createSpan({ text: '⇄' });
    title.appendText(' Mocks');

    Object.entries(proc.mocks).forEach(([key, mock]) => {
      const mockWrap = section.createDiv({ cls: 'pe-mock' });
      const head = mockWrap.createEl('button', {
        cls: 'pe-mock-head',
        attr: { type: 'button' },
      });
      head.createSpan({ cls: 'pe-mock-key', text: key });
      head.createSpan({ cls: 'pe-mock-source', text: mock.source || '' });
      const chevron = head.createSpan({ cls: 'pe-mock-chevron', text: '▸' });

      const mockBody = mockWrap.createDiv({ cls: 'pe-mock-body' });
      const textarea = mockBody.createEl('textarea', {
        cls: 'pe-mock-editor',
        attr: {
          id: `${id}-mock-${key}`,
          spellcheck: 'false',
        },
      });
      textarea.value = JSON.stringify(mock.data || {}, null, 2);

      head.addEventListener('click', () => {
        mockBody.classList.toggle('pe-mock-open');
        chevron.setText(mockBody.classList.contains('pe-mock-open') ? '▾' : '▸');
      });
    });
  }

  private async simulate(id: string) {
    const widget = this.widgets.get(id);
    if (!widget) return;

    const { yaml, proc } = widget;
    const btn = document.getElementById(`${id}-btn`) as HTMLButtonElement | null;
    const statusEl = document.getElementById(`${id}-run-status`);
    const resultEl = document.getElementById(`${id}-result`);
    if (!btn || !statusEl || !resultEl) return;

    const inputData: Record<string, unknown> = {};
    if (proc.input) {
      Object.entries(proc.input).forEach(([key, field]) => {
        const inputEl = document.getElementById(`${id}-in-${key}`) as HTMLInputElement | null;
        if (!inputEl) return;
        const raw = inputEl.value.trim();
        if (field.type === 'number') inputData[key] = raw === '' ? null : Number.parseFloat(raw);
        else if (field.type === 'boolean') inputData[key] = raw === 'true' || raw === '1';
        else inputData[key] = raw;
      });
    }

    const mockOverrides: Record<string, unknown> = {};
    if (proc.mocks) {
      for (const key of Object.keys(proc.mocks)) {
        const textarea = document.getElementById(`${id}-mock-${key}`) as HTMLTextAreaElement | null;
        if (!textarea) continue;
        try {
          mockOverrides[key] = JSON.parse(textarea.value);
        } catch {
          this.setStatus(statusEl, `JSON inválido no mock "${key}"`, 'error');
          return;
        }
      }
    }

    btn.disabled = true;
    btn.classList.add('pe-btn-loading');
    btn.querySelector('.pe-btn-label')?.setText('Executando...');
    this.setStatus(statusEl, '', '');
    resultEl.empty();
    resultEl.style.display = 'none';

    try {
      const cryptoSecret = await this.getCryptoSecret();
      const payload = await encryptJSON(cryptoSecret, {
        yaml,
        input: inputData,
        mock_overrides: mockOverrides,
      });
      const response = await requestUrl({
        url: `${this.engineBaseUrl()}/simulate`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial_number: this.settings.serialNumber.trim(),
          encrypted: true,
          payload,
        }),
      });

      const result = await decryptResponse(cryptoSecret, response.text) as SimulationResult;
      if (response.status < 200 || response.status >= 300) {
        const errorResult = result as unknown as { error?: string };
        throw new Error(`HTTP ${response.status}: ${errorResult.error || response.text}`);
      }
      await this.renderTrace(id, result);
      this.setStatus(statusEl, '', '');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(statusEl, message, 'error');
      new Notice(`Rules simulation failed: ${message}`);
    } finally {
      btn.disabled = false;
      btn.classList.remove('pe-btn-loading');
      btn.querySelector('.pe-btn-label')?.setText('Simular');
    }
  }

  private async renderTrace(id: string, result: SimulationResult) {
    const container = document.getElementById(`${id}-result`);
    if (!container) return;

    container.style.display = 'block';
    const finalCfg = FINAL_STATUS[result.final_status] || { label: result.final_status, cls: 'gray' };

    container.empty();
    const trace = container.createDiv({ cls: 'pe-trace' });
    const traceHeader = trace.createDiv({ cls: 'pe-trace-header' });
    traceHeader.createSpan({ cls: 'pe-trace-title', text: 'Execução' });
    traceHeader.createSpan({
      cls: `pe-final-badge pe-badge-${finalCfg.cls} pe-badge-pending`,
      text: finalCfg.label,
      attr: { id: `${id}-final-badge` },
    });

    const flowEl = trace.createDiv({ cls: 'pe-flow', attr: { id: `${id}-flow` } });
    trace.createDiv({
      cls: 'pe-final-result',
      attr: {
        id: `${id}-final-result`,
        style: 'opacity:0;transform:translateY(12px)',
      },
    });

    for (let i = 0; i < result.steps.length; i++) {
      await sleep(STEP_DELAY_MS);
      this.appendStepCard(flowEl, result.steps[i], i, result.steps.length);
    }

    await sleep(250);
    document.getElementById(`${id}-final-badge`)?.classList.remove('pe-badge-pending');

    if (result.final_result && Object.keys(result.final_result).length > 0) {
      await sleep(RESULT_DELAY_MS);
      this.showFinalResult(`${id}-final-result`, result.final_result, result.final_status);
    }
  }

  private appendStepCard(container: HTMLElement, step: SimulationStep, index: number, total: number) {
    const cfg = STATUS[step.status] || { label: step.status, icon: '?', cls: 'gray' };

    if (index > 0) {
      const arrow = container.createDiv({ cls: `pe-connector pe-connector-${cfg.cls}` });
      arrow.createSpan({ cls: 'pe-connector-line' });
      arrow.createSpan({ cls: 'pe-connector-arrow', text: '▼' });
    }

    const card = container.createDiv({ cls: `pe-step-card pe-step-${cfg.cls} pe-entering` });
    const header = card.createDiv({ cls: 'pe-step-header' });
    header.createSpan({ cls: 'pe-step-num', text: String(index + 1) });
    header.createSpan({ cls: `pe-step-icon pe-icon-${cfg.cls}`, text: cfg.icon });
    header.createSpan({ cls: 'pe-step-name', text: step.name });
    header.createSpan({ cls: `pe-step-badge pe-badge-${cfg.cls}`, text: cfg.label });

    if (step.description) card.createEl('p', { cls: 'pe-step-desc', text: step.description });

    if (step.mock_source) {
      const row = card.createDiv({ cls: 'pe-step-mock-row' });
      row.createSpan({ cls: 'pe-mock-pill', text: 'mock' });
      row.createSpan({ cls: 'pe-mock-src', text: step.mock_source });
      if (step.assigned_var) {
        const assign = row.createSpan({ cls: 'pe-assign-label' });
        assign.appendText('→ ');
        assign.createEl('code', { text: step.assigned_var });
      }
    }

    if (step.condition_expr) {
      const row = card.createDiv({ cls: 'pe-step-condition' });
      row.createSpan({ cls: 'pe-cond-label', text: 'condição' });
      row.createEl('code', { cls: 'pe-cond-expr', text: step.condition_expr });
      const condResult = step.condition_result;
      row.createSpan({
        cls: `pe-cond-result ${condResult === true ? 'pe-cond-true' : condResult === false ? 'pe-cond-false' : ''}`,
        text: condResult === true ? '✓ true' : condResult === false ? '✗ false' : '—',
      });
    }

    if (step.computed_vars && Object.keys(step.computed_vars).length > 0) {
      this.appendJsonDetails(
        card,
        step.status === 'RESULT' ? '⬟ resultado final' : '⊞ variáveis calculadas',
        step.computed_vars,
        step.status === 'RESULT'
      );
    }

    if (step.assigned_data && Object.keys(step.assigned_data).length > 0 && step.status !== 'ERROR') {
      this.appendJsonDetails(card, `⇄ dados do mock (${step.assigned_var || ''})`, step.assigned_data, false, true);
    }

    if (step.message) card.createDiv({ cls: `pe-step-msg pe-msg-${cfg.cls}`, text: step.message });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.classList.remove('pe-entering');
        card.classList.add('pe-entered');
      });
    });
  }

  private appendJsonDetails(
    card: HTMLElement,
    summaryText: string,
    data: Record<string, unknown>,
    open: boolean,
    mockData = false
  ) {
    const details = card.createEl('details', {
      cls: `pe-step-vars${mockData ? ' pe-step-mock-data' : ''}`,
    });
    if (open) details.open = true;
    details.createEl('summary', { cls: 'pe-vars-summary', text: summaryText });
    details.createEl('pre', { cls: 'pe-vars-pre', text: JSON.stringify(data, null, 2) });
  }

  private showFinalResult(elId: string, data: Record<string, unknown>, status: string) {
    const el = document.getElementById(elId);
    if (!el) return;

    const cfg = FINAL_STATUS[status] || { label: status, cls: 'gray' };
    el.className = `pe-final-result pe-final-${cfg.cls}`;
    el.empty();

    const header = el.createDiv({ cls: 'pe-final-header' });
    header.createSpan({ cls: 'pe-final-icon', text: status === 'COMPLETED' ? '✦' : status === 'ABORTED' ? '⊘' : '⚠' });
    header.createSpan({ cls: 'pe-final-title', text: 'Resultado Final' });
    header.createSpan({ cls: 'pe-final-status-label', text: cfg.label });
    el.createEl('pre', { cls: 'pe-final-json', text: JSON.stringify(data, null, 2) });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    });
  }

  private setStatus(el: HTMLElement, msg: string, type: string) {
    el.setText(msg);
    el.className = `pe-run-status${type ? ` pe-run-status-${type}` : ''}`;
  }

  private engineBaseUrl(): string {
    return ENGINE_URL;
  }

  private async getCryptoSecret(): Promise<string> {
    const cached = String(this.settings.cryptoKey || '').trim();
    if (cached) return cached;

    const response = await requestUrl({
      url: `${this.engineBaseUrl()}/crypto-key`,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    const body = JSON.parse(response.text) as { key?: string; error?: string };
    if (response.status < 200 || response.status >= 300 || !body.key) {
      throw new Error(body.error || 'Chave de criptografia indisponível');
    }
    this.settings.cryptoKey = body.key.trim();
    await this.saveSettings();
    return this.settings.cryptoKey;
  }
}

class RulesSettingTab extends PluginSettingTab {
  plugin: BusinessRulesEmulatorPlugin;

  constructor(app: App, plugin: BusinessRulesEmulatorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Business Rules Emulator' });

    new Setting(containerEl)
      .setName('Número de série')
      .setDesc('Serial ativo da assinatura usado para autorizar chamadas ao backend.')
      .addText((text) =>
        text
          .setPlaceholder('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx')
          .setValue(this.plugin.settings.serialNumber)
          .onChange(async (value) => {
            this.plugin.settings.serialNumber = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Estilo')
      .setDesc('Tema visual usado nos simuladores renderizados nas notas.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('dark', 'Dark')
          .addOption('clear', 'Clear')
          .setValue(this.plugin.settings.theme)
          .onChange(async (value: 'dark' | 'clear') => {
            this.plugin.settings.theme = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function decryptResponse(secret: string, text: string): Promise<unknown> {
  const body = JSON.parse(text);
  if (!body?.encrypted) return body;
  return decryptJSON(secret, body.payload);
}

async function encryptJSON(secret: string, value: unknown): Promise<{ iv: string; data: string }> {
  if (!secret) throw new Error('Chave de criptografia indisponível');
  const key = await cryptoKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}

async function decryptJSON(secret: string, payload: { iv: string; data: string }): Promise<unknown> {
  if (!secret) throw new Error('Chave de criptografia indisponível');
  const key = await cryptoKey(secret);
  const iv = base64ToBytes(payload.iv) as unknown as BufferSource;
  const data = base64ToBytes(payload.data) as unknown as BufferSource;
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

async function cryptoKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
