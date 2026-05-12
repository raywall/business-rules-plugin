# Como construir scripts de cenários de decisão com o Business Rules?

Este documento descreve como montar scripts YAML usados pelo
Business Rules Studio e Business Rules Plugin for Obsidian.

O script define uma simulação de regras de negócio com:

- campos de entrada exibidos em formulário
- mocks de consultas externas
- passos sequenciais de validação, consulta, cálculo e resultado
- expressoes CEL para avaliar condições e calcular valores


## Onde usar

No Studio, cole o YAML diretamente no editor lateral.

No plugin web, use um bloco Markdown `process`:

```process
name: Minha Regra
steps:
  - name: Resultado
    result:
      - name: status
        expr: "'OK'"
```

No Obsidian, use um bloco Markdown `rules`:

```rules
name: Minha Regra
steps:
  - name: Resultado
    result:
      - name: status
        expr: "'OK'"
```

No plugin web também e possível carregar o YAML de um arquivo:

```process
src: studio/examples/ecommerce-order-review.yaml
```

## Workspaces no Studio

O Studio suporta **workspaces**: pastas locais abertas diretamente no
navegador via File System Access API. Isso permite organizar projetos com
múltiplos microserviços e usecases sem precisar carregar e exportar
arquivos manualmente a cada alteração.

> **Requisito:** Chrome 86+ ou Edge 86+. O Firefox não suporta a
> File System Access API nesta versão.

### Conceito de workspace

Um workspace representa um **projeto** — por exemplo, um sistema ou
domínio de negócio. Dentro dele, cada **subpasta** representa um
**microserviço** (como um ECS service, Lambda, ou qualquer unidade
de deploy independente). Cada **arquivo `.yaml`** dentro de uma subpasta
é um **usecase** daquele microserviço.

```
meu-projeto/                    ← workspace (pasta raiz)
├── order-service/              ← microserviço
│   ├── create-order.yaml       ← usecase
│   ├── cancel-order.yaml       ← usecase
│   └── update-status.yaml      ← usecase
├── payment-service/            ← microserviço
│   ├── process-payment.yaml    ← usecase
│   └── refund.yaml             ← usecase
└── notification-service/       ← microserviço
    └── send-email.yaml         ← usecase
```

### Abrindo um workspace

1. Clique no ícone de pasta (⬡) na barra do painel Workspace.
2. Selecione a pasta raiz do seu projeto.
3. O navegador pedirá permissão de leitura e escrita — confirme.
4. O Studio carrega automaticamente todos os microserviços e usecases.

O nome da pasta raiz aparece como título do workspace na barra superior.

### Navegando entre usecases

Clique em um microserviço para expandir ou recolher sua lista de usecases.
Clique em um usecase para carregá-lo no editor YAML.

O **breadcrumb** acima do editor mostra o caminho atual:
`workspace › microserviço › usecase`

O arquivo ativo fica destacado em azul na árvore.

### Salvando alterações

Use **Ctrl+S** (ou **Cmd+S** no Mac) para salvar o arquivo atual em disco.
O botão **Salvar** na barra do editor tem o mesmo efeito.

Arquivos com alterações não salvas exibem um ponto laranja (●) na árvore.
Ao tentar abrir outro arquivo com alterações pendentes, o Studio pergunta
se você deseja salvar antes de continuar.

### Criando microserviços e usecases

**Novo microserviço:**
Clique no ícone de pasta com `+` na barra do workspace. Digite o nome
(será convertido para kebab-case automaticamente). Uma nova pasta é criada
no disco dentro do workspace.

**Novo usecase:**
- Clique no ícone de arquivo com `+` na barra do workspace, ou
- Clique com o botão direito em um microserviço e escolha "+ Novo usecase".

O Studio cria o arquivo `.yaml` no disco com um template inicial e o
abre automaticamente no editor.

### Menu de contexto (clique com botão direito)

**Em um microserviço:**
- ＋ Novo usecase — cria um usecase dentro deste serviço
- ✕ Remover do workspace — remove o serviço da árvore (a pasta permanece no disco)

**Em um usecase:**
- ⇢ Interligar a outro usecase — adiciona um bloco `links` para chamar outro
  microserviço/usecase do workspace
- ✕ Remover do workspace — remove o arquivo da árvore (o arquivo permanece no disco)

> Remover do workspace não exclui arquivos ou pastas do disco. Para
> excluir permanentemente, use o explorador de arquivos do seu sistema.

### Atualizando o workspace

Clique no ícone de atualização (↺) na barra do workspace para reler a
estrutura de pastas e arquivos do disco. Use isso após criar, renomear ou
mover arquivos externamente.

### Recolhendo o painel workspace

Clique na seta (▾) no canto direito da barra do workspace para recolher
o painel e ganhar mais espaço vertical para o editor. Clique novamente
(▸) para expandir.

### Atalhos de teclado

| Atalho        | Ação                        |
|---------------|-----------------------------|
| Ctrl+S / Cmd+S | Salvar arquivo atual        |
| Tab           | Inserir 2 espaços no editor |

### Limitações do workspace

- **Renomear** arquivos e pastas não é suportado pela File System Access
  API. Faça isso no explorador de arquivos e clique em Atualizar (↺).
- **Excluir** do disco também não é suportado; use o explorador de arquivos.
- O workspace não é persistido entre sessões. Ao reabrir o Studio,
  abra a pasta novamente.
- A File System Access API requer HTTPS ou `localhost`. Não funciona
  em páginas servidas por `file://`.


## Estrutura geral do script

Um script completo segue esta estrutura:

```
id: "00000000-0000-4000-a000-000000000001"
name: Nome do processo
description: Descricao opcional do processo

input:
  campo:
    type: string
    label: "Campo"
    description: "Texto de ajuda exibido como tooltip no label"
    example: "valor inicial"

mocks:
  consulta:
    source: "GET /recurso/{input.campo}"
    data:
      chave: "valor"

steps:
  - name: Nome do Passo
    description: Descricao opcional
    condition: "input.campo != ''"
    on_fail:
      action: ABORT
      message: "Campo obrigatorio"
```

Campos principais:

- `id`: identificador unico global do script. **Obrigatorio** para catalogacao
  no backend e para nomear o arquivo versionado no S3.
- `name`: nome do processo. **Obrigatorio**.
- `description`: texto opcional exibido como apoio.
- `input`: campos que viram formulário de entrada.
- `mocks`: respostas simuladas de consultas externas.
- `steps`: lista ordenada de passos executados pelo backend. **Obrigatorio**.


## Input

`input` define os campos que o usuário pode preencher antes de simular.

```
input:
  customer_id:
    type: string
    label: "Cliente"
    example: "CUS-1001"
  order_total:
    type: number
    label: "Valor do Pedido"
    example: 849.90
  active:
    type: boolean
    label: "Ativo"
    example: true
```

Cada campo possui:

- `type`: `string`, `number` ou `boolean`.
- `label`: nome exibido no formulário.
- `description`: texto opcional exibido como tooltip ao passar o mouse sobre o label.
- `example`: valor inicial usado no formulário.


Labels muito longos sao cortados visualmente com `...` para preservar o layout.
Use `description` para explicar o campo com mais liberdade sem aumentar o
tamanho da tela.

Os valores ficam disponíveis nas expressoes pelo objeto `input`.

Exemplos:

```
condition: "input.customer_id != ''"
condition: "input.order_total > 0.0"
condition: "input.active == true"
```

## Mocks

`mocks` define dados simulados para consultas externas.

```
mocks:
  customer:
    source: "GET /customers/{input.customer_id}"
    data:
      id: "CUS-1001"
      status: "ACTIVE"
      risk_score: 18.0
      email_verified: true
```

Cada mock possui:

- `source`: descrição visual da origem da consulta.
- `data`: objeto JSON/YAML retornado quando o mock for usado.


Durante a simulação, o usuário pode alterar o JSON do mock na tela antes de
executar. O backend recebe esses overrides e usa os valores editados.

## Steps

`steps` e a lista de passos executados em ordem. Cada passo precisa ter `name` e pelo menos uma acao relevante, como `condition`, `use_mock`, `compute` ou `result`.

```
steps:
  - name: Validar Entrada
    condition: "input.customer_id != ''"
    on_fail:
      action: ABORT
      message: "Cliente obrigatorio"
```

Campos de um passo:

- `name`: nome exibido no fluxo.
- `description`: descrição opcional.
- `use_mock`: nome de um mock definido em `mocks`.
- `assign`: nome da variável onde o mock ou calculo sera armazenado.
- `condition`: expressão CEL que deve retornar `true` ou `false`.
- `on_fail`: comportamento quando `condition` retornar `false`.
- `compute`: lista de cálculos intermediários.
- `result`: lista de campos do resultado final.


## Usando mocks em steps

Para carregar um mock no contexto da execucao:

```
- name: Buscar Cliente
  use_mock: customer
  assign: customer
```

Depois disso, os dados ficam disponíveis pelo nome definido em `assign`:

```
- name: Validar Cliente
  condition: "customer.status == 'ACTIVE' && customer.email_verified == true"
  on_fail:
    action: ABORT
    message: "Cliente nao habilitado"
```

Se `assign` for omitido, o nome do próprio mock sera usado como variável.

```
- name: Buscar Cliente
  use_mock: customer
```

Neste caso, os dados tambem ficam em `customer`.

Um passo pode carregar mock e avaliar condição ao mesmo tempo:

```
- name: Verificar Estoque
  use_mock: inventory
  assign: inventory
  condition: "inventory.available == true && inventory.reserved_items > 0.0"
  on_fail:
    action: ABORT
    message: "Estoque indisponivel"
```

## Condicoes

`condition` usa CEL, uma linguagem de expressões segura.

Exemplos comuns:

```
condition: "input.order_total > 0.0"
condition: "customer.status == 'ACTIVE'"
condition: "customer.risk_score <= 70.0"
condition: "coupon.active == true && input.order_total >= coupon.min_order_total"
condition: "input.severity == 'HIGH' || input.impacted_users > 10.0"
```

Operadores comuns:

- igualdade: `==`, `!=`
- comparação: `>`, `>=`, `<`, `<=`
- lógica: `&&`, `||`, `!`
- aritmética: `+`, `-`, `*`, `/`
- strings: use aspas simples dentro da expressao, como `'ACTIVE'`
- booleanos: use `true` ou `false`


Recomendação: use números com decimal (`10.0`, `70.0`) para evitar diferenças
entre inteiros do YAML e numeros usados nas expressões.

## on_fail

`on_fail` define o que acontece quando uma `condition` retorna `false`.

```
on_fail:
  action: ABORT
  message: "Regra bloqueada"
```

Acoes suportadas:

- `ABORT`: interrompe o processo e marca os próximos passos como ignorados.
- `SKIP`: marca o passo como ignorado e continua a execução.
- `CONTINUE`: registra falha no passo, mas continua a execução.


Se `on_fail` for omitido, o passo fica como `FAILED` e a execução continua.

A mensagem pode interpolar valores do contexto usando `{variavel.campo}`:

```
message: "Cliente {customer.id} esta com status {customer.status}"
```

## Compute

`compute` cria valores intermediários a partir de expressões.

```
- name: Calcular Totais
  assign: totals
  compute:
    - name: discount_value
      expr: "input.order_total * coupon.discount_percent / 100.0"
    - name: final_total
      expr: "input.order_total - (input.order_total * coupon.discount_percent / 100.0)"
```

O resultado do `compute` é armazenado como objeto no nome definido por `assign`.

No exemplo acima:

```
totals.discount_value
totals.final_total

```

Se `assign` for omitido, o resultado fica em `computed`.

## Result

`result` monta o resultado final da simulação.

```
- name: Aprovar Pedido
  result:
    - name: status
      expr: "'APPROVED'"
    - name: order_id
      expr: "input.order_id"
    - name: final_total
      expr: "totals.final_total"
```

Cada item de `result` possui:

- `name`: nome do campo no JSON final.
- `expr`: expressão CEL que calcula o valor.


Quando um passo tem `result`, ele aparece como resultado final na tela.

## Links entre Microserviços e Usecases

Use `links` para conectar o output de um usecase ao input de outro usecase.
No Studio, a pasta representa o microserviço e o arquivo YAML representa o
usecase.

```yaml
links:
  - service: pagamentos
    usecase: autorizar-pagamento.yaml
    input:
      order_id: "result.order_id"
      customer_id: "result.customer_id"
      amount: "result.amount"
```

Campos do link:

- `service`: nome da pasta/microserviço no workspace.
- `usecase`: nome do arquivo YAML de destino. A extensao `.yaml` e opcional.
- `input`: mapa opcional de campos que serao enviados ao usecase de destino.

As expressoes de `input` sao avaliadas com CEL e recebem:

- `result`: resultado final do usecase anterior.
- `output`: alias de `result`.
- `previous`: alias de `result`.
- `input`: input original recebido pelo usecase atual.

Se `input` for omitido ou estiver vazio, o backend envia todo o `result` do
usecase anterior como input do proximo.

Ao simular um arquivo no Studio, o workspace completo e enviado ao backend. Se o
arquivo selecionado estiver no meio da esteira, o backend procura usecases
anteriores que apontam para ele, inicia pela origem e continua ate o ultimo
link. Por exemplo: simular `pagamentos/autorizar-pagamento.yaml` em uma esteira
`pedidos -> pagamentos -> faturamento` executa os tres usecases nessa ordem.

Exemplo end-to-end:

```yaml
name: Criar Pedido
input:
  order_id:
    type: string
    label: "Pedido"
    example: "ORD-1001"
  amount:
    type: number
    label: "Valor"
    example: 349.90

steps:
  - name: Resultado do Pedido
    result:
      - name: order_id
        expr: "input.order_id"
      - name: amount
        expr: "input.amount"

links:
  - service: pagamentos
    usecase: autorizar-pagamento.yaml
    input:
      order_id: "result.order_id"
      amount: "result.amount"
```

O Studio inclui tres exemplos prontos:

```text
studio/workspace/pedidos/criar-pedido.yaml
studio/workspace/pagamentos/autorizar-pagamento.yaml
studio/workspace/faturamento/emitir-recibo.yaml
```

No preview do Studio, use a visualizacao `Detalhada` para simular a regra etapa
a etapa. Use a visualizacao `Macro` para inspecionar o flowchart dos
microservicos conectados. Para o exemplo acima, o Studio monta uma relacao como:

```mermaid
flowchart LR
  pedidos["Criar pedido"]
  pagamentos["Autorizar Pagamento"]
  faturamento["Emitir recibo"]
  pedidos --> pagamentos
  pagamentos --> faturamento
```

## Exemplo Completo

```
name: Revisao de Pedido
description: Avalia cliente, estoque e valor final antes de aprovar o pedido.

input:
  customer_id:
    type: string
    label: "Cliente"
    description: "Identificador usado para buscar status e risco do cliente."
    example: "CUS-1001"
  order_id:
    type: string
    label: "Pedido"
    description: "Identificador usado para consultar estoque e rastrear a decisao."
    example: "ORD-9001"
  order_total:
    type: number
    label: "Valor do Pedido"
    description: "Valor bruto do pedido antes de taxas e descontos."
    example: 849.90

mocks:
  customer:
    source: "GET /customers/{input.customer_id}"
    data:
      id: "CUS-1001"
      status: "ACTIVE"
      risk_score: 18.0

  inventory:
    source: "GET /inventory/{input.order_id}"
    data:
      available: true
      warehouse: "SP-01"

steps:
  - name: Validar Entrada
    condition: "input.customer_id != '' && input.order_id != '' && input.order_total > 0.0"
    on_fail:
      action: ABORT
      message: "Pedido sem dados obrigatorios"

  - name: Buscar Cliente
    use_mock: customer
    assign: customer

  - name: Avaliar Cliente
    condition: "customer.status == 'ACTIVE' && customer.risk_score <= 70.0"
    on_fail:
      action: ABORT
      message: "Cliente bloqueado para aprovacao automatica"

  - name: Verificar Estoque
    use_mock: inventory
    assign: inventory
    condition: "inventory.available == true"
    on_fail:
      action: ABORT
      message: "Estoque indisponivel"

  - name: Calcular Totais
    assign: totals
    compute:
      - name: fee
        expr: "input.order_total * 0.05"
      - name: final_total
        expr: "input.order_total + (input.order_total * 0.05)"

  - name: Resultado Final
    result:
      - name: status
        expr: "'APPROVED'"
      - name: order_id
        expr: "input.order_id"
      - name: warehouse
        expr: "inventory.warehouse"
      - name: final_total
        expr: "totals.final_total"
```

## Checklist para Criar um Script

1. Defina `name` e, se ajudar, `description`.
2. Liste em `input` todos os dados que o usuario precisa informar.
3. Crie em `mocks` as consultas externas que quer simular.
4. Monte `steps` na ordem real da decisão.
5. Use `condition` para validações.
6. Use `use_mock` e `assign` para carregar dados simulados.
7. Use `compute` para valores intermediários.
8. Finalize com um step `result`.
9. Teste no Studio e ajuste mocks/input até o fluxo representar bem o caso.


## Boas Praticas

- Prefira nomes de variaveis simples: `customer`, `order`, `ticket`, `totals`.
- Use `assign` sempre que quiser deixar claro onde os dados serão armazenados.
- Mantenha `result` no último passo para facilitar a leitura do fluxo.
- Escreva mensagens de `on_fail` como decisões de negócio, nao como erros técnicos.
- Evite colocar dados sensíveis reais nos mocks.
- Use exemplos pequenos o suficiente para serem lidos na tela, mas completos o
bastante para testar decisoes importantes.
- Em um workspace, nomeie as pastas de microserviço com o nome real do serviço
no repositório (ex: `order-service`, `payment-api`). Isso facilita rastrear qual
script corresponde a qual deploy.
