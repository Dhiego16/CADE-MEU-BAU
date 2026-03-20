# 🚍 Cadê meu Baú? — Monitor de Ônibus em Tempo Real

Monitor de ônibus em tempo real para Goiânia e Senador Canedo. Consulte horários, salve suas linhas favoritas, receba alertas de chegada e visualize pontos no mapa interativo.

🔗 **[cademeubau.vercel.app](https://cademeubau.vercel.app)**
📄 **[Página de apresentação](https://cademeubau.vercel.app/sobre)**

---

## ✨ Funcionalidades

- ⚡ **Tempo real** — dados atualizados a cada 20 segundos automaticamente
- ★ **Favoritos** — salve suas linhas e veja todas de uma vez na "Minha Garagem"
- ✏️ **Apelidos** — segure o dedo em um card favorito para dar um apelido à linha
- 🔔 **Alertas de chegada** — notificação quando o ônibus estiver a 2, 5, 10 ou 15 minutos
- 🗺️ **Mapa interativo** — visualize 147 pontos de Senador Canedo no mapa com geolocalização
- 🎫 **Consulta SitPass/Bilhete Único** — veja seu saldo pelo CPF com aviso de saldo baixo
- 📲 **PWA instalável** — funciona como app nativo no Android e iOS, sem Play Store
- 🔄 **Atualização automática** — banner avisa quando há nova versão disponível
- 🔗 **Compartilhar linhas** — gera link direto para mandar no WhatsApp
- 🕓 **Histórico de buscas** — acesso rápido aos pontos buscados recentemente
- ☀️ **Tema claro/escuro** — alternável pelo botão no header
- 📡 **Feedback de erro inteligente** — distingue ponto não encontrado, linha inativa, sem conexão
- 💬 **Botão de feedback** — link direto para formulário de sugestões/erros

---

## 🗺️ Mapa de Pontos

O mapa cobre **147 pontos** de ônibus em Senador Canedo, incluindo:

- Terminal de Senador Canedo (saída, entrada e plataformas)
- Av. Sen. Canedo, Av. Pres. Vargas, Av. dos Eucaliptos
- Rodovia GO-403 (trecho completo)
- Bairros: Jardim Califórnia, Jardim Primavera, Vila Nova, Monte Minas e outros
- Tocar em um marcador no mapa abre o ponto direto na aba de busca

---

## 🚀 Rodando localmente

**Pré-requisitos:** Node.js 18+

```bash
# 1. Clone o repositório
git clone https://github.com/Dhiego16/CAD-MEU-BA-
cd CAD-MEU-BA-

# 2. Instale as dependências
npm install

# 3. Rode em desenvolvimento
npm run dev
```

Acesse `http://localhost:5173`

---

## 🏗️ Build e deploy

```bash
# Build de produção
npm run build

# Preview local do build
npm run preview
```

O deploy é automático via **Vercel** a cada push na branch `main`.

---

## 📁 Estrutura do projeto

```
├── src/
│   ├── App.tsx          # Componente principal
│   ├── index.tsx        # Entry point React
│   └── types.ts         # Tipos TypeScript
├── public/
│   ├── logo.png         # Logo do app
│   ├── manifest.json    # Manifesto PWA
│   ├── landing.html     # Página /sobre
│   ├── 404.html         # Página de erro customizada
│   ├── service-worker.js# Service Worker PWA
│   ├── icons/           # Ícones PWA (72px a 512px)
│   └── screenshots/     # Screenshots para install dialog
├── index.html           # HTML base
└── vercel.json          # Configuração de rotas Vercel
```

---

## 🛠️ Tecnologias

- **React 19** + **TypeScript**
- **Tailwind CSS** (via CDN)
- **Vite** — bundler
- **Leaflet.js** — mapa interativo de pontos
- **PWA** — Service Worker + Web App Manifest + `skipWaiting` auto-update
- **API de horários** — [bot-onibus.vercel.app](https://bot-onibus.vercel.app) (dados RMTC/EIXO Goiânia)
- **API de saldo** — Cloudflare Workers (`sitpass.cj22233333.workers.dev`) para consulta SitPass

---

## 📜 Licença

Projeto pessoal, não afiliado à RMTC, EIXO Goiânia ou SitPass.
