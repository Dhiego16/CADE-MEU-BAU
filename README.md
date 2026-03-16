<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🚍 Cadê meu Baú? — Monitor de Ônibus em Tempo Real

Monitor de ônibus em tempo real para Goiânia e região metropolitana. Consulte horários, salve suas linhas favoritas e receba alertas quando o ônibus estiver chegando.

🔗 **[cademeubau.vercel.app](https://cademeubau.vercel.app)**
📄 **[Página de apresentação](https://cademeubau.vercel.app/sobre)**

---

## ✨ Funcionalidades

- ⚡ **Tempo real** — dados atualizados a cada 20 segundos automaticamente
- ★ **Favoritos** — salve suas linhas e veja todas de uma vez na "Minha Garagem"
- 🔔 **Alertas de chegada** — notificação quando o ônibus estiver a 2, 5, 10 ou 15 minutos
- 📲 **PWA instalável** — funciona como app nativo no Android e iOS, sem Play Store
- 🔗 **Compartilhar linhas** — gera link direto para mandar no WhatsApp
- 🕓 **Histórico de buscas** — acesso rápido aos pontos buscados recentemente
- ☀️ **Tema claro/escuro** — alternável pelo botão no header
- 📡 **Feedback de erro inteligente** — distingue ponto não encontrado, linha inativa, sem conexão

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
├── App.tsx              # Componente principal
├── index.tsx            # Entry point React
├── index.html           # HTML base
├── types.ts             # Tipos TypeScript
├── vercel.json          # Configuração de rotas Vercel
├── service-worker.js    # Service Worker PWA
├── public/
│   ├── logo.png         # Logo do app
│   ├── manifest.json    # Manifesto PWA
│   ├── landing.html     # Página /sobre
│   ├── icons/           # Ícones PWA (72px a 512px)
│   └── screenshots/     # Screenshots para install dialog
```

---

## 🛠️ Tecnologias

- **React 19** + **TypeScript**
- **Tailwind CSS** (via CDN)
- **Vite** — bundler
- **PWA** — Service Worker + Web App Manifest
- **API** — [bot-onibus.vercel.app](https://bot-onibus.vercel.app) (dados RMTC/EIXO Goiânia)

---

## 📜 Licença

Projeto pessoal, não afiliado à RMTC ou EIXO Goiânia.
