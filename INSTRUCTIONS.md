# Instrucoes para Scripts Business Rules

Este documento descreve como montar scripts YAML usados pelo
`business-rules-plugin`, pelo Studio e pelo plugin Obsidian.

O script define uma simulacao de regras de negocio com:

- campos de entrada exibidos em formulario
- mocks de consultas externas
- passos sequenciais de validacao, consulta, calculo e resultado
- expressoes CEL para avaliar condicoes e calcular valores

## Onde Usar

No Studio, cole o YAML diretamente no editor lateral.

No plugin web, use um bloco Markdown `process`:

````markdown
```process
name: Minha Regra
steps:
  - name: Resultado
    result:
      - name: status
        expr: "'OK'"
```
````

No Obsidian, use um bloco Markdown `rules`:

````markdown
```rules
name: Minha Regra
steps:
  - name: Resultado
    result:
      - name: status
        expr: "'OK'"
```
````

No plugin web tambem e possivel carregar o YAML de um arquivo:

````markdown
```process
src: studio/examples/ecommerce-order-review.yaml
```
````

## Estrutura Geral

Um script completo segue esta estrutura:

```yaml
name: Nome do Processo
description: Descricao opcional do processo

input:
  campo:
    type: string
    label: "Campo"
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

- `name`: nome do processo. Obrigatorio.
- `description`: texto opcional exibido como apoio.
- `input`: campos que viram formulario de entrada.
- `mocks`: respostas simuladas de consultas externas.
- `steps`: lista ordenada de passos executados pelo backend. Obrigatorio.

## Input

`input` define os campos que o usuario pode preencher antes de simular.

```yaml
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
- `label`: nome exibido no formulario.
- `example`: valor inicial usado no formulario.

Os valores ficam disponiveis nas expressoes pelo objeto `input`.

Exemplos:

```yaml
condition: "input.customer_id != ''"
condition: "input.order_total > 0.0"
condition: "input.active == true"
```

## Mocks

`mocks` define dados simulados para consultas externas.

```yaml
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

- `source`: descricao visual da origem da consulta.
- `data`: objeto JSON/YAML retornado quando o mock for usado.

Durante a simulacao, o usuario pode alterar o JSON do mock na tela antes de
executar. O backend recebe esses overrides e usa os valores editados.

## Steps

`steps` e a lista de passos executados em ordem. Cada passo precisa ter `name`
e pelo menos uma acao relevante, como `condition`, `use_mock`, `compute` ou
`result`.

```yaml
steps:
  - name: Validar Entrada
    condition: "input.customer_id != ''"
    on_fail:
      action: ABORT
      message: "Cliente obrigatorio"
```

Campos de um passo:

- `name`: nome exibido no fluxo.
- `description`: descricao opcional.
- `use_mock`: nome de um mock definido em `mocks`.
- `assign`: nome da variavel onde o mock ou calculo sera armazenado.
- `condition`: expressao CEL que deve retornar `true` ou `false`.
- `on_fail`: comportamento quando `condition` retornar `false`.
- `compute`: lista de calculos intermediarios.
- `result`: lista de campos do resultado final.

## Usando Mocks em Steps

Para carregar um mock no contexto da execucao:

```yaml
- name: Buscar Cliente
  use_mock: customer
  assign: customer
```

Depois disso, os dados ficam disponiveis pelo nome definido em `assign`:

```yaml
- name: Validar Cliente
  condition: "customer.status == 'ACTIVE' && customer.email_verified == true"
  on_fail:
    action: ABORT
    message: "Cliente nao habilitado"
```

Se `assign` for omitido, o nome do proprio mock sera usado como variavel.

```yaml
- name: Buscar Cliente
  use_mock: customer
```

Neste caso, os dados tambem ficam em `customer`.

Um passo pode carregar mock e avaliar condicao ao mesmo tempo:

```yaml
- name: Verificar Estoque
  use_mock: inventory
  assign: inventory
  condition: "inventory.available == true && inventory.reserved_items > 0.0"
  on_fail:
    action: ABORT
    message: "Estoque indisponivel"
```

## Condicoes

`condition` usa CEL, uma linguagem de expressoes segura.

Exemplos comuns:

```yaml
condition: "input.order_total > 0.0"
condition: "customer.status == 'ACTIVE'"
condition: "customer.risk_score <= 70.0"
condition: "coupon.active == true && input.order_total >= coupon.min_order_total"
condition: "input.severity == 'HIGH' || input.impacted_users > 10.0"
```

Operadores comuns:

- igualdade: `==`, `!=`
- comparacao: `>`, `>=`, `<`, `<=`
- logica: `&&`, `||`, `!`
- aritmetica: `+`, `-`, `*`, `/`
- strings: use aspas simples dentro da expressao, como `'ACTIVE'`
- booleanos: use `true` ou `false`

Recomendacao: use numeros com decimal (`10.0`, `70.0`) para evitar diferencas
entre inteiros do YAML e numeros usados nas expressoes.

## on_fail

`on_fail` define o que acontece quando uma `condition` retorna `false`.

```yaml
on_fail:
  action: ABORT
  message: "Regra bloqueada"
```

Acoes suportadas:

- `ABORT`: interrompe o processo e marca os proximos passos como ignorados.
- `SKIP`: marca o passo como ignorado e continua a execucao.
- `CONTINUE`: registra falha no passo, mas continua a execucao.

Se `on_fail` for omitido, o passo fica como `FAILED` e a execucao continua.

A mensagem pode interpolar valores do contexto usando `{variavel.campo}`:

```yaml
message: "Cliente {customer.id} esta com status {customer.status}"
```

## Compute

`compute` cria valores intermediarios a partir de expressoes.

```yaml
- name: Calcular Totais
  assign: totals
  compute:
    - name: discount_value
      expr: "input.order_total * coupon.discount_percent / 100.0"
    - name: final_total
      expr: "input.order_total - (input.order_total * coupon.discount_percent / 100.0)"
```

O resultado do `compute` e armazenado como objeto no nome definido por `assign`.

No exemplo acima:

```text
totals.discount_value
totals.final_total
```

Se `assign` for omitido, o resultado fica em `computed`.

## Result

`result` monta o resultado final da simulacao.

```yaml
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
- `expr`: expressao CEL que calcula o valor.

Quando um passo tem `result`, ele aparece como resultado final na tela.

## Exemplo Completo

```yaml
name: Revisao de Pedido
description: Avalia cliente, estoque e valor final antes de aprovar o pedido.

input:
  customer_id:
    type: string
    label: "Cliente"
    example: "CUS-1001"
  order_id:
    type: string
    label: "Pedido"
    example: "ORD-9001"
  order_total:
    type: number
    label: "Valor do Pedido"
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
4. Monte `steps` na ordem real da decisao.
5. Use `condition` para validacoes.
6. Use `use_mock` e `assign` para carregar dados simulados.
7. Use `compute` para valores intermediarios.
8. Finalize com um step `result`.
9. Teste no Studio e ajuste mocks/input ate o fluxo representar bem o caso.

## Boas Praticas

- Prefira nomes de variaveis simples: `customer`, `order`, `ticket`, `totals`.
- Use `assign` sempre que quiser deixar claro onde os dados serao armazenados.
- Mantenha `result` no ultimo passo para facilitar a leitura do fluxo.
- Escreva mensagens de `on_fail` como decisoes de negocio, nao como erros tecnicos.
- Evite colocar dados sensiveis reais nos mocks.
- Use exemplos pequenos o suficiente para serem lidos na tela, mas completos o
  bastante para testar decisoes importantes.

