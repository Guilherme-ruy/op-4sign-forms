# D4Sign API - Download de Documento

Esta seção da API D4Sign permite gerar uma URL temporária para fazer o download de um documento finalizado (ou parcialmente assinado). Você pode escolher entre baixar o arquivo em PDF, um ZIP contendo o documento e as evidências, e até mesmo as fotos de documentos dos signatários.

> **Importante:** Inclua seu `tokenAPI` e `cryptKey` diretamente na URL da requisição.

---

## Download de um Documento

Este endpoint cria uma URL temporária e única que você pode usar para baixar o documento especificado.

- **Método:** `POST`
- **Endpoint:** `/documents/{UUID-DOCUMENT}/download`
- **Exemplo de URL:**
  `https://secure.d4sign.com.br/api/v1/documents/{UUID-DOCUMENT}/download?tokenAPI={SEU-TOKEN}&cryptKey={SEU-CRYPT-KEY}`

### Parâmetros de Requisição (URL)
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `UUID-DOCUMENT` | String | **(obrigatório)** O UUID do documento que você deseja baixar. |

### Header Requerido
```json
{
    "Content-Type": "application/json"
}
```

### Body (Payload)
O corpo da requisição permite que você personalize o tipo de arquivo e a inclusão de fotos de autenticação.

```json
{
    "type": "ZIP",
    "language": "pt",
    "document": "true" 
}
```

#### Detalhes e Opções do Body
| Parâmetro | Descrição |
| :--- | :--- |
| `type` *(opcional)* | Para realizar o download do arquivo completo com evidências, escolha `ZIP`. Para realizar o download apenas do PDF, escolha `PDF`. |
| `language` *(opcional)* | Idioma do documento de evidências gerado: `pt` para português, `en` para inglês. |
| `document` *(opcional)* | `true`: Traz as fotos do documento do signatário em base64 caso tenha sido usada autenticação com foto. <br> `false`: não traz na resposta as fotos. |

### Resposta de Sucesso
Retorna a URL temporária gerada pela D4Sign (esta URL expira em pouco tempo) e o nome do arquivo.

```json
{
  "url": "https://secure.d4sign.com.br/CODIGO-TEMPORARIO-PARA-DOWNLOAD",
  "name": "teste.pdf"
}
```
