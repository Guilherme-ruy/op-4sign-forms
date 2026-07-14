# D4Sign API - Rubricas e Dimensões

Esta documentação foca no posicionamento de elementos visuais dentro de um documento já existente na plataforma da D4Sign, como Assinaturas, Rubricas e Selos. O processo geralmente envolve duas etapas: descobrir as dimensões das páginas do documento gerado e aplicar os *pins* nas posições calculadas.

> **Importante:** Não esqueça de enviar os parâmetros de autenticação `tokenAPI` e `cryptKey` nas URLs das requisições.

---

## 1. Verificar Dimensões de um Documento

Permite obter a largura e altura exatas (em pixels) de cada página de um documento específico. Isso é essencial para garantir o posicionamento preciso das rubricas, especialmente quando o número de páginas é dinâmico.

- **Método:** `GET`
- **Endpoint:** `/documents/{UUID-DOCUMENT}/dimensions`
- **Exemplo de URL:**
  `https://secure.d4sign.com.br/api/v1/documents/{UUID-DOCUMENT}/dimensions?tokenAPI={SEU-TOKEN}&cryptKey={SEU-CRYPT-KEY}`

### Parâmetros de Requisição (URL)
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `UUID-DOCUMENT` | String | **(obrigatório)** O UUID do documento cujas dimensões você deseja verificar. |

### Header Requerido
```json
{
    "Content-Type": "application/json"
}
```

### Resposta de Sucesso
Retorna um JSON contendo o array `dimensions` com os tamanhos de cada página.

```json
{
  "dimensions": [
    {
      "page": 1,
      "width": 794,
      "height": 1123
    },
    {
      "page": 2,
      "width": 794,
      "height": 1123
    }
  ]
}
```
*(As medidas 794x1123 equivalem tipicamente a uma folha A4 em formato retrato).*

---

## 2. Adicionar Rubrica / Assinatura (Pins)

Permite posicionar elementos visuais (assinaturas, rubricas, selos) nas páginas do documento.

- **Método:** `POST`
- **Endpoint:** `/documents/{UUID-MAIN-DOCUMENT}/addpins`
- **Exemplo de URL:**
  `https://secure.d4sign.com.br/api/v1/documents/{UUID-MAIN-DOCUMENT}/addpins?tokenAPI={SEU-TOKEN}&cryptKey={SEU-CRYPT-KEY}`

### Parâmetros de Requisição (URL)
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `UUID-MAIN-DOCUMENT` | String | **(obrigatório)** O UUID do documento principal ao qual a rubrica será adicionada. |

### Headers Requeridos
```json
{
    "Content-Type": "application/json",
    "Accept": "application/json"
}
```

### Body (Payload)
O body deve enviar um array `pins` contendo as configurações de cada selo ou rubrica.

```json
{
  "pins": [
    {
      "document": "uuid-do-documento",
      "email": "emaila@dominio.com.br",
      "page_width": 794,
      "page_height": 1123,
      "page": 1,
      "position_x": 397,
      "position_y": 560,
      "type": 1 
    }
  ]
}
```

#### Detalhamento dos Campos (`pins`)
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `document` | String | **(obrigatório)** UUID do documento principal (ou slave) onde o pin será adicionado. |
| `email` | String | **(obrigatório)** E-mail do signatário. Ele *já deve estar cadastrado* como signatário no documento. |
| `page_width` | Integer | **(obrigatório)** Largura da página em pixels. |
| `page_height` | Integer | **(obrigatório)** Altura da página em pixels. |
| `page` | Integer | **(obrigatório)** O número da página onde será posicionado. |
| `position_x` | Integer | **(obrigatório)** Posição X (horizontal) em pixels, da esquerda para a direita. |
| `position_y` | Integer | **(obrigatório)** Posição Y (vertical) em pixels, de cima para baixo. |
| `type` | Integer | `0` = Assinatura, `1` = Rubrica, `2` = Selo |
