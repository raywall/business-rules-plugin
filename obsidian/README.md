# Business Rules Emulator for Obsidian

Plugin do Obsidian que renderiza blocos Markdown `rules` como uma tela interativa de simulacao usando o mesmo backend `/simulate` do projeto principal.

## Instalar no vault

Copie estes arquivos para uma pasta do seu vault:

```text
.obsidian/plugins/business-rules-emulator/
  main.js
  manifest.json
  styles.css
```

Depois habilite o plugin em `Settings > Community plugins`.

## Configurar

Em `Settings > Business Rules Emulator`, configure:

- `Numero de serie` com um serial ativo da assinatura.
- `Estilo` como `Dark` ou `Clear`.

O endpoint do backend e fixo em `https://rules.raysouz.studio`. O bloco, inputs
e mocks sao enviados diretamente como JSON para `POST /simulate`.
Em redes governadas que bloqueiam upload, o plugin tenta fallback via
`GET /simulate?request=...` quando o payload cabe na URL.

Para uso no navegador em ambiente governado, prefira o Studio same-origin em
`https://rules.raysouz.studio/studio/`.

## Usar em uma nota

Crie um bloco:

````markdown
```rules
id: "00000000-0000-4000-a000-000000000001"
name: Roteamento de Ticket
description: Decide prioridade e fila de atendimento.

input:
  ticket_id:
    type: string
    label: "Ticket de suporte com label longo"
    description: "Identificador do ticket aberto pelo cliente."
    example: "TCK-7001"
  impacted_users:
    type: number
    label: "Usuarios Impactados"
    description: "Quantidade estimada de usuarios afetados."
    example: 45.0

mocks:
  ticket:
    source: "GET /support/tickets/{input.ticket_id}"
    data:
      category: "API"
      has_logs: true

steps:
  - name: Buscar Ticket
    use_mock: ticket
    assign: ticket

  - name: Conferir Logs
    condition: "ticket.has_logs == true"
    on_fail:
      action: ABORT
      message: "Ticket sem logs"

  - name: Roteamento Final
    result:
      - name: status
        expr: "'ROUTED'"
      - name: queue
        expr: "ticket.category"
```
````

O plugin monta o formulario, permite editar mocks em JSON e envia a simulacao
para `POST /simulate`.
