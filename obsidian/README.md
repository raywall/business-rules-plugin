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

## Configurar a Lambda

Em `Settings > Business Rules Emulator`, configure:

- `Engine URL` com a URL publica da Lambda, sem o caminho `/simulate`.
- `Numero de serie` com um serial ativo da assinatura.
- `Estilo` como `Dark` ou `Clear`.

Exemplo:

```text
https://XXXX.lambda-url.us-east-1.on.aws
```

Para desenvolvimento local, use:

```text
http://localhost:8080
```

## Usar em uma nota

Crie um bloco:

````markdown
```rules
name: Processamento de Parcela CLT
description: Fluxo de desconto em folha do credito do trabalhador

input:
  matricula:
    type: string
    label: "Matricula do Funcionario"
    example: "12345"
  valor_parcela:
    type: number
    label: "Valor da Parcela"
    example: 500.00

mocks:
  funcionario:
    source: "GET /api/v1/rh/funcionarios/{input.matricula}"
    data:
      nome: "Joao Silva"
      situacao: "ATIVO"
      vinculo: "CLT"
      margem_disponivel: 1500.00

steps:
  - name: Buscar Funcionario
    use_mock: funcionario
    assign: func

  - name: Verificar Elegibilidade
    condition: "func.situacao == 'ATIVO' && func.vinculo == 'CLT'"
    on_fail:
      action: ABORT
      message: "Funcionario inelegivel"

  - name: Aprovar
    result:
      - name: status
        expr: "'APROVADO'"
```
````

O plugin monta o formulario, permite editar mocks em JSON e envia:

```json
{
  "yaml": "...",
  "input": {},
  "mock_overrides": {}
}
```

para `POST /simulate`.
