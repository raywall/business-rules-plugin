# business-rules-plugin

Frontend do Business Rules Emulator.

Este repositorio contem:

- plugin web para blocos Markdown `process`
- Business Rules Studio em `studio/`
- plugin Obsidian para blocos `rules`
- exemplos YAML em `studio/examples`

O backend Go, licencas, LocalStack e Terraform ficam no repositorio
`business-rules-emulator`.

## Studio

Execute localmente:

```bash
make run
```

Abra:

```text
http://localhost:5173/studio/
```

O studio permite:

- editar YAML em uma sidebar
- usar `Tab` no editor sem trocar foco
- validar estrutura basica do script
- alternar tema dark/light
- carregar e exportar YAML
- renderizar o script pelo rodape do editor
- abrir um arquivo do workspace e renderizar automaticamente
- interligar usecases entre microservicos com `links`
- renderizar a tela de simulacao no painel principal

Nenhum serial de teste fica publicado no studio. Configure o serial pelo botao
`Serial`, por query string ou por `sessionStorage`.

Exemplo com query string:

```text
http://localhost:5173/studio/?serial=SEU-UUID
```

Tambem e possivel configurar o backend:

```text
http://localhost:5173/studio/?engine=https://rules.raysouz.studio
```

Se nenhum backend for informado, o Studio usa `https://rules.raysouz.studio`.

## Plugin Web

Inclua os assets em uma pagina HTML ou site estatico:

```html
<script>
  window.PROCESS_ENGINE_URL = 'https://rules.raysouz.studio';
  window.PROCESS_ENGINE_SERIAL = 'uuid-da-assinatura';
</script>
<link rel="stylesheet" href="/plugin/process-plugin.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js"></script>
<script src="/plugin/process-plugin.js"></script>
```

Use YAML inline:

````markdown
```process
name: Meu Processo
steps:
  - name: Final
    result:
      - name: status
        expr: "'OK'"
```
````

Ou carregue de arquivo:

````markdown
```process
src: examples/ecommerce-order-review.yaml
```
````

## Links entre Usecases

No Studio, cada pasta do workspace representa um microservico e cada YAML
representa um usecase. Um usecase pode chamar outro microservico/usecase usando
`links`:

```yaml
links:
  - service: pagamentos
    usecase: autorizar-pagamento.yaml
    input:
      order_id: "result.order_id"
      amount: "result.amount"
```

Durante a simulacao, o Studio envia os YAMLs do workspace ao backend. O backend
descobre a origem da esteira, executa end-to-end e passa o `result` de um
usecase como input do proximo. Com isso, se `pedidos` chama `pagamentos` e
`pagamentos` chama `faturamento`, simular `pagamentos` executa
`pedidos -> pagamentos -> faturamento`.

No preview do Studio existem duas visualizacoes:

- `Detalhada`: renderiza a tela de simulacao e mostra a execucao etapa a etapa.
- `Macro`: monta um flowchart dos microservicos/usecases conectados por `links`.

Exemplos disponiveis:

- `studio/workspace/pedidos/criar-pedido.yaml`
- `studio/workspace/pagamentos/autorizar-pagamento.yaml`
- `studio/workspace/faturamento/emitir-recibo.yaml`

## Plugin Obsidian

Build e copia para o vault configurado:

```bash
make build
```

No Obsidian, configure:

- `Numero de serie`
- tema `Dark` ou `Clear`

O endpoint do backend no Obsidian e fixo em `https://rules.raysouz.studio`.

Use em uma nota:

````markdown
```rules
name: Meu Processo
input:
  customer_id:
    type: string
    label: "Cliente com um label longo"
    description: "Descricao exibida como tooltip ao passar o mouse sobre o label."
    example: "CUS-1001"
steps:
  - name: Final
    result:
      - name: status
        expr: "'OK'"
```
````

## GitHub Pages

O workflow `.github/workflows/docs.yml` publica o studio no GitHub Pages.
Ele roda automaticamente depois que o workflow `release` termina com sucesso,
e tambem pode ser executado manualmente.

Ele publica apenas:

- `index.html`
- `studio/`
- `plugin/`

Assim `studio/index.html` consegue carregar `../plugin/process-plugin.js` e
`../plugin/process-plugin.css` sem levar `node_modules` ou arquivos de build do
Obsidian para o Pages.

## Releases

O workflow `.github/workflows/release.yml` roda em push na branch `main` ou
manualmente pelo GitHub Actions.

Ele publica uma GitHub Release com:

- `process-plugin.js`
- `process-plugin.css`
- pacote `.zip` e `.tar.gz` do plugin web
- `main.js`, `manifest.json` e `styles.css` do plugin Obsidian
- pacote `.zip` e `.tar.gz` do plugin Obsidian

Quando executado manualmente, e possivel informar uma tag como `v1.0.0`. Se a
tag ficar vazia, o workflow gera uma tag automatica no formato
`vYYYY.MM.DD-NUMERO_DA_RUN`.
