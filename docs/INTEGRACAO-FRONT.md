# Ligando o front (Next.js) na API

Hoje o front lê tudo de `lib/mock.ts`, `lib/history.ts` e `lib/series.ts`. A ideia é trocar esses mocks por chamadas à API, mantendo os tipos de `lib/types.ts` (a API devolve os mesmos nomes de campo).

## 1. Configuração

No front, crie `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3333/api
```

No backend, `FRONT_URL=http://localhost:3000` (CORS).

## 2. Cliente da API (`lib/api.ts`)

```ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333/api";

export async function login(email: string, senha: string) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  if (!r.ok) throw new Error((await r.json()).erro ?? "Falha no login");
  const { token, usuario } = await r.json();
  sessionStorage.setItem("token", token); // simples para o projeto; em produção prefira cookie httpOnly
  return usuario;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem("token");
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (r.status === 401) { sessionStorage.removeItem("token"); window.location.href = "/login"; }
  if (!r.ok) throw new Error((await r.json()).erro ?? `Erro ${r.status}`);
  return r.json();
}
```

O front atual **não tem tela de login** (RF08). É preciso criar uma página `/login` que chame `login()` e redirecione para `/`.

## 3. De onde vem cada dado

| Tela / mock | Endpoint | Observações |
|---|---|---|
| `DEVICES` | `GET /dispositivos` | mesmo formato de `Device`. Extras: `regiao`, `fonte`. `lastSeenSec` é `null` se o dispositivo nunca enviou nada |
| `NETWORK` | `GET /dispositivos/resumo` | `{total, online, warn, down}` |
| `DEVICE_DETAILS[id]` | `GET /dispositivos/:id` | mesmo formato de `Device` + `DeviceDetail`. `lux`, `rssi` = `null` e `uptime` = `"—"` (sem sensor) |
| `OV_TEMP`, `OV_HUM`, `OV_HOURS`, `REGIONS`, `PERIMETER` | `GET /visao-geral` | veja abaixo |
| `ALERTS_RAW` | `GET /alertas` | mesmo formato de `AlertRaw`. `id` é o código (`AL-0001`) |
| `UNSEEN_ALERT_IDS` | `GET /alertas/resumo` | `naoVistos` (número). Ao abrir a tela: `POST /alertas/marcar-vistos` |
| `act(id, action)` do `AlertsProvider` | `POST /alertas/:id/acao` | body `{acao, categoria?, nota?}`; aceite a resposta como o alerta atualizado |
| `setCategory` / `setNote` | `PATCH /alertas/:id` | body `{categoria}` ou `{nota}` |
| `buildHistory(...)` | `GET /historico` | veja abaixo |

### Visão Geral

`GET /visao-geral` devolve:

```json
{
  "horas": ["10h", "11h", "...", "agora · 09:42"],
  "temperatura": { "atual": 28.4, "delta": 1.6, "serie": [30.1, 32.1, "..."] },
  "umidade":     { "atual": 67,   "delta": -3,  "serie": [58, 52, "..."] },
  "luminosidade": null,
  "maxRegional": { "id": "ESP32-003", "temp": 33.1 },
  "rede": { "total": 7, "online": 4, "warn": 2, "down": 1 },
  "regions": [{ "name": "Nilo Coelho", "sub": "1 dispositivo", "v": 33.1, "lo": 22, "hi": 32 }],
  "atencao": [ /* até 3 alertas abertos, formato AlertRaw */ ]
}
```

- `serie` equivale a `OV_TEMP` / `OV_HUM` e `horas` a `OV_HOURS`. Pode ter menos de 24 pontos se houver horas sem leitura.
- `luminosidade` é `null` porque o hardware atual não mede luz: esconda ou desabilite esse card.
- `rede.online` conta só os dispositivos sem aviso (`state = "ok"`), igual ao `NETWORK` do mock.

### Histórico

Traduza os filtros da tela antes de chamar:

| Tela | Parâmetro |
|---|---|
| `"7 dias"`, `"30 dias"`, `"Safra"` | `periodo=7`, `periodo=30`, `periodo=safra` |
| `"Temperatura"`, `"Umidade"` | `variavel=temperatura`, `variavel=umidade` |
| `"Luminosidade"` | **sem suporte** (a API responde 400): remova esse filtro |
| `"Todos"`, `"ESP32-001"`... | `dispositivo=todos`, `dispositivo=ESP32-001` |

A resposta tem o mesmo formato que `buildHistory` retorna (`vals`, `bars`, `events`, `title`, `xLabels`, `insights`, `domain`, `unit`, `n`). Se não houver leituras no período, `n` vem 0 e as listas vazias: mostre o estado "vazio" do `StateView`.

## 4. Atualização automática

Os dados mudam a cada ~20 s (intervalo do ThingSpeak). Um `setInterval` de 30 s no cliente chamando os mesmos endpoints já é suficiente para o dashboard parecer "ao vivo".

## 5. Alertas com dispositivo `REDE`

O alerta "Janela ideal de colheita" pertence à rede inteira e vem com `device: "REDE"`. Não há página `/dispositivos/REDE`: não gere link para ele.
