# D4Sign API - Base de Conhecimento (Documentos)

Este documento compila as especificações de uso da API D4Sign com foco na obtenção de dados e status de documentos no cofre.

> **Importante:** Todas as requisições requerem a passagem dos parâmetros de autenticação `tokenAPI` e `cryptKey` na URL da requisição.
> Exemplo Base: `https://secure.d4sign.com.br/api/v1/...` (em produção) ou `https://sandbox.d4sign.com.br/api/v1/...` (em ambiente de testes).

---

## 1. Listar um Documento Específico

Permite recuperar os detalhes de um único documento, usando seu identificador exclusivo (UUID). Este endpoint retornará apenas o documento solicitado, com todas as suas informações detalhadas.

- **Método:** `GET`
- **Endpoint:** `/documents/{UUID-DOCUMENTO}`
- **Exemplo de URL:**
  `https://secure.d4sign.com.br/api/v1/documents/{UUID-DOCUMENTO}?tokenAPI={SEU-TOKEN}&cryptKey={SEU-CRYPT-KEY}`

### Parâmetros de Requisição (URL)
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `UUID-DOCUMENTO` | String | **(obrigatório)** O UUID do documento específico que você deseja listar. |

### Header Requerido
```json
{
    "Content-Type": "application/json"
}
```

### Resposta de Sucesso
Em caso de sucesso, a resposta será um objeto JSON contendo as informações do documento (e não um Array).

```json
{
    "uuidDoc": "9f08bf18-bf4b-410f-9701-c286e5b1cad1",
    "nameDoc": "teste.pdf",
    "type": "application/pdf",
    "size": "118990",
    "pages": "6",
    "uuidSafe": "06b3ddb1-abc9-4ab8-b944-0d7c940486af",
    "safeName": "Atendimento",
    "statusId": "3",
    "statusName": "Aguardando Assinaturas",
    "statusComment": "Comentário sobre cancelamento",
    "whoCanceled": "E-mail de quem cancelou o documento"
}
```

---

## 2. Listar Todos os Documentos

Permite obter uma lista completa de todos os documentos da sua conta, facilitando o gerenciamento e o acompanhamento do status de cada um.

- **Método:** `GET`
- **Endpoint:** `/documents`
- **Exemplo de URL:**
  `https://secure.d4sign.com.br/api/v1/documents?tokenAPI={SEU-TOKEN}&cryptKey={SEU-CRYPT-KEY}&pg=1`

### Parâmetros de Requisição (URL)
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `pg` | Integer | Parâmetro de paginação. O resultado possui 500 documentos por página. O primeiro bloco do resultado exibirá o total de páginas disponíveis. |

### Header Requerido
```json
{
    "Content-Type": "application/json"
}
```

### Resposta de Sucesso
A resposta será um array de objetos, onde cada objeto representa um documento:

```json
[
    {
        "uuidDoc": "9f08bf18-bf4b-410f-9701-c286e5b1cad1",
        "nameDoc": "teste.pdf",
        "type": "application/pdf",
        "size": "118990",
        "pages": "6",
        "uuidSafe": "06b3ddb1-abc9-4ab8-b944-0d7c940486af",
        "safeName": "Atendimento",
        "statusId": "3",
        "statusName": "Aguardando Assinaturas",
        "statusComment": "",
        "whoCanceled": ""
    }
]
```

---

## 3. Listar Documentos por Fase (Status)

Filtra e visualiza todos os documentos que estão em uma fase específica do fluxo de trabalho (ex: "Aguardando Assinaturas" ou "Finalizado").

- **Método:** `GET`
- **Endpoint:** `/documents/{ID-FASE}/status`
- **Exemplo de URL:**
  `https://secure.d4sign.com.br/api/v1/documents/{ID-FASE}/status?tokenAPI={SEU-TOKEN}&cryptKey={SEU-CRYPT-KEY}&pg=1`

### Parâmetros de Requisição (URL)
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `ID-FASE` | Integer | **(obrigatório)** O ID da fase (status) que você quer listar. (Veja a tabela de IDs de Fase abaixo). |
| `pg` | Integer | Parâmetro de paginação (até 500 documentos por página). |

#### Tabela de IDs de Fase (`statusId`)
| ID | Fase / Status |
| :--- | :--- |
| `1` | Processando |
| `2` | Aguardando Signatários |
| `3` | Aguardando Assinaturas |
| `4` | Finalizado / Assinado |
| `5` | Arquivado |
| `6` | Cancelado |
| `7` | Editando |

### Header Requerido
```json
{
    "Content-Type": "application/json"
}
```

### Resposta de Sucesso
Retorna um array com os documentos que estão na referida fase:

```json
[
    {
        "uuidDoc": "9f08bf18-bf4b-410f-9701-c286e5b1cad1",
        "nameDoc": "teste.pdf",
        "type": "application/pdf",
        "size": "118990",
        "pages": "6",
        "uuidSafe": "06b3ddb1-abc9-4ab8-b944-0d7c940486af",
        "safeName": "Atendimento",
        "statusId": "3",
        "statusName": "Aguardando Assinaturas",
        "statusComment": "",
        "whoCanceled": ""
    }
]
```
