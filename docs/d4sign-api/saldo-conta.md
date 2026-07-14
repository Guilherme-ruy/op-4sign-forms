# Exibir Saldo da Conta (Balance) — D4Sign API

Consulta o saldo (créditos) da conta D4Sign: total de créditos e quantos já
foram usados.

> 🚧 **Importante:** envie `tokenAPI` e `cryptKey` na query string.

## Endpoint

```
GET /account/balance?tokenAPI={SEU-TOKEN}&cryptKey={SEU-CRYPT-KEY}
```

- **Sandbox:** `https://sandbox.d4sign.com.br/api/v1/account/balance?...`
- **Produção:** `https://secure.d4sign.com.br/api/v1/account/balance?...`

### Header

```json
{ "Content-Type": "application/json" }
```

## Resposta

```json
{
  "credit": "999",
  "sent": "372",
  "used_balance": "372/999"
}
```

| Campo          | Descrição                                                        |
|----------------|------------------------------------------------------------------|
| `credit`       | Número total de créditos disponíveis na conta.                   |
| `sent`         | Número de documentos já enviados para assinatura.                |
| `used_balance` | String `enviados/total` (ex.: `"372/999"`).                      |

## ⚠️ Saldo é por CONTA, não por cofre

Este endpoint retorna **apenas o saldo total da conta** — não há parâmetro de
cofre nem quebra de saldo por cofre na resposta. Os limites percentuais que se
configuram por cofre no painel da D4Sign são uma regra interna de distribuição
de créditos, mas **não são consultáveis por aqui**.

Se um dia precisarmos de uma visão "por cofre", o caminho seria **derivar
localmente**: contar quantos documentos enviamos para cada cofre a partir das
nossas próprias `Submission` (que já vão para o cofre do departamento do
modelo). Isso seria uso interno, não saldo real da D4Sign.

## Como usamos neste portal

- Serviço: [`d4sign.service.ts`](../../backend/src/d4sign/d4sign.service.ts) → `getBalance()`
- Endpoint interno: `GET /d4sign/balance` ([`d4sign.controller.ts`](../../backend/src/d4sign/d4sign.controller.ts))
- **Quem pode ver:** `SUPER_ADMIN` sempre; demais usuários só se tiverem a flag
  `canViewBalance` marcada (padrão **desmarcada**) na gestão de acessos
  (`/admin/users`).
- **Onde aparece:** card de saldo no dashboard (`/admin`).

Referência oficial: <https://ajuda.d4sign.com.br/exibir-saldo-da-conta-api>
