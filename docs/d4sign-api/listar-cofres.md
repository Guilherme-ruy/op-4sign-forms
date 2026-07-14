# Listar todos os cofres (Safes) — D4Sign API

Cofres (*safes*) são os contêineres onde os documentos ficam organizados e
armazenados de forma segura na D4Sign. Cada cofre tem um **UUID** próprio.

> 🚧 **Importante:** toda requisição precisa do `tokenAPI` e do `cryptKey` na
> query string.

## Endpoint

```
GET /safes?tokenAPI={SEU-TOKEN}&cryptKey={SEU-CRYPT-KEY}
```

- **Sandbox:** `https://sandbox.d4sign.com.br/api/v1/safes?...`
- **Produção:** `https://secure.d4sign.com.br/api/v1/safes?...`

Paginação opcional via `&pg={n}` (o backend já repassa `pg`).

### Header

```json
{
  "Content-Type": "application/json"
}
```

## Resposta

Retorna **todos os cofres** da conta, cada um com seu UUID e nome.

```json
[
  {
    "uuid-safe": "9f08bf18-bf4b-410f-9701-c286e5b1cad1",
    "name-safe": "Contratos"
  },
  {
    "uuid-safe": "e1f2g3h4-i5j6-k7l8-m9n0-o1p2q3r4s5t6",
    "name-safe": "Documentos Pessoais"
  },
  {
    "uuid-safe": "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6",
    "name-safe": "Propostas Comerciais"
  }
]
```

> ⚠️ **Atenção ao formato das chaves.** A documentação oficial retorna
> `uuid-safe` / `name-safe` (com hífen). Já no nosso `D4SignService.listSafes`
> o *dry-run* devolve `uuid_safe` / `name_safe` (com underscore). Ao consumir a
> resposta real, normalize ambos os formatos.

## Como usamos neste portal

- Serviço: [`backend/src/d4sign/d4sign.service.ts`](../../backend/src/d4sign/d4sign.service.ts) → `listSafes(page)`
- Endpoint interno: `GET /d4sign/safes` em [`d4sign.controller.ts`](../../backend/src/d4sign/d4sign.controller.ts)
- O cofre usado em cada upload vem do **departamento do modelo**
  (`Department.safeUuid`), definido no painel em
  `/admin/users → Departamentos`. Não há mais cofre global por env: o roteamento
  acontece em [`links.service.ts`](../../backend/src/links/links.service.ts) no
  `processD4SignSubmission`. Se o departamento não tiver cofre vinculado, a
  geração do documento falha com mensagem clara.

Referência oficial: <https://ajuda.d4sign.com.br/listar-todos-os-cofres-api>
