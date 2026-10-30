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
- 📈 **Previsão com histórico** — compara o que a RMTC previu com a chegada real e mostra "costuma atrasar ~X min" e a confiança no card (aprende no próprio aparelho)
- 🔒 **Cofre do SitPass** — CPFs, cartão favorito e último saldo sincronizam entre aparelhos criptografados no próprio aparelho (AES-256-GCM, senha só do usuário); regras em `firestore.rules`
- 🕒 **Sugestão pra agora** — o app aprende (só no aparelho) em que horário você costuma buscar cada ponto/linha e sugere o mais provável, com a previsão ao vivo
- 👥 **Tá lotado?** — relatos de lotação (vazio/cheio/lotado) por linha e faixa de horário, só exibidos com relatos de aparelhos diferentes; usa `FIREBASE_SERVICE_ACCOUNT`
- 📊 **Contador de eventos próprio** — só contagens por dia, sem dado pessoal (respeita "Não rastrear"); leia em `/api/eventos?dias=7&key=EVENTOS_KEY`
- 🌐 **Histórico coletivo** — as chegadas medidas por todos os aparelhos alimentam o "costuma atrasar ~X min", com faixa de horário (pico da manhã/tarde); precisa de `FIREBASE_SERVICE_ACCOUNT` na Vercel
- ☁️ **Login com Google e sincronização** — favoritos e trajetos seguem a conta em qualquer aparelho (liga sozinho quando as variáveis `VITE_FIREBASE_*` existem; veja `.env.example` e `firestore.rules`)
- ⚡ **Atalhos no ícone do PWA** — segure o ícone para abrir direto em Buscar, Favoritos ou SitPass

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
git clone https://github.com/Dhiego16/CADE-MEU-BAU
cd CADE-MEU-BAU

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
├── api/                 # Funções serverless (Vercel): ponto, realtimebus, route
├── components/          # Componentes, abas (tabs/) e modais (modals/)
├── hooks/               # Hooks de busca, favoritos, alertas, SitPass, PWA...
├── utils/               # Helpers (CPF, tempo, tema, ícones)
├── public/              # Logo, ícones PWA, landing.html, service-worker.js
├── App.tsx              # Componente principal
├── index.tsx            # Entry point React
├── pontos.json          # Pontos de Senador Canedo (mapa)
├── manifest.json        # Manifesto PWA
└── vercel.json          # Rotas Vercel

---

## 🛠️ Tecnologias

- **React 19** + **TypeScript**
- **Tailwind CSS** (via CDN)
- **Vite** — bundler
- **Leaflet.js** — mapa interativo de pontos
- **PWA** — Service Worker + Web App Manifest + `skipWaiting` auto-update
- **API de horários** — rotas `/api/ponto` e `/api/realtimebus` (Vercel Functions, dados RMTC/EIXO Goiânia)
- **API de saldo** — Cloudflare Workers (`sitpass.cj22233333.workers.dev`) para consulta SitPass

---

## 📜 Licença

Projeto pessoal, não afiliado à RMTC, EIXO Goiânia ou SitPass.
