import { createHmac, randomBytes, timingSafeEqual, scryptSync } from "node:crypto";
import express from "express";
import pg from "pg";
import cron from "node-cron";
import { Resend } from "resend";

const { Pool } = pg;

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "no-referrer");
  next();
});

// ======================================================
// VARIÁVEIS DE AMBIENTE
// ======================================================

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const SESSION_MAX_AGE = 8 * 60 * 60;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const WEEKLY_CRON =
  process.env.WEEKLY_CRON ||
  "0 6 * * 1";

const TIMEZONE =
  process.env.TIMEZONE ||
  "America/Sao_Paulo";

// ======================================================
// RESEND
// ======================================================

const resend = RESEND_API_KEY
  ? new Resend(RESEND_API_KEY)
  : null;

// ======================================================
// POSTGRESQL
// ======================================================

const pool = new Pool({
  connectionString: DATABASE_URL
});

async function inicializarBanco() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mensagens (
        id SERIAL PRIMARY KEY,
        whatsapp_message_id TEXT UNIQUE NOT NULL,
        nome TEXT,
        telefone TEXT NOT NULL,
        mensagem TEXT,
        tipo TEXT,
        recebido_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS missionarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT,
        telefone TEXT UNIQUE,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversas (
        telefone TEXT PRIMARY KEY,
        etapa TEXT NOT NULL DEFAULT 'INICIO',
        missionario_id INTEGER REFERENCES missionarios(id),
        nome_familia TEXT,
        atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mensagens_missionarios (
        id SERIAL PRIMARY KEY,
        whatsapp_message_id TEXT UNIQUE NOT NULL,
        missionario_id INTEGER NOT NULL REFERENCES missionarios(id),
        telefone_familia TEXT NOT NULL,
        nome_familia TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDENTE',
        criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        enviado_em TIMESTAMPTZ
      );
    `);

    console.log("Banco de dados conectado.");
    console.log("Tabela mensagens pronta.");
    console.log("Tabela missionarios pronta.");
    console.log("Tabela conversas pronta.");
    console.log("Tabela mensagens_missionarios pronta.");

    if (RESEND_API_KEY) {
      console.log("Resend configurado.");
    } else {
      console.log(
        "AVISO: RESEND_API_KEY não configurada."
      );
    }
  } catch (error) {
    console.error(
      "Erro ao inicializar banco:",
      error
    );

    throw error;
  }
}

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================

function escaparHTML(valor = "") {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function paginaHTML(
  conteudo,
  titulo = "Mensagens Missionárias"
) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>${escaparHTML(titulo)}</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f4f6f8;
      color: #1f2937;
    }

    header {
      background: #173b57;
      color: white;
      padding: 24px;
    }

    header h1 {
      margin: 0;
      font-size: 26px;
    }

    header p {
      margin: 6px 0 0;
      opacity: 0.85;
    }

    main {
      max-width: 1200px;
      margin: 30px auto;
      padding: 0 20px;
    }

    .card {
      background: white;
      padding: 24px;
      margin-bottom: 24px;
      border-radius: 10px;
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.08);
    }

    h2,
    h3 {
      margin-top: 0;
    }

    label {
      display: block;
      margin-top: 15px;
      font-weight: bold;
    }

    input {
      width: 100%;
      padding: 11px;
      margin-top: 6px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 15px;
    }

    button,
    .botao {
      border: 0;
      border-radius: 6px;
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      text-decoration: none;
      display: inline-block;
    }

    .principal {
      margin-top: 20px;
      background: #173b57;
      color: white;
    }

    .editar {
      background: #2563eb;
      color: white;
      margin-right: 6px;
    }

    .teste-email {
      margin-top: 10px;
      background: #2563eb;
      color: white;
    }

    .compilacao {
      margin-top: 10px;
      background: #7c3aed;
      color: white;
      font-weight: bold;
    }

    .ativar {
      background: #157347;
      color: white;
    }

    .desativar {
      background: #b42318;
      color: white;
    }

    .sucesso {
      padding: 14px;
      margin-bottom: 20px;
      border-radius: 6px;
      background: #dcfce7;
      color: #166534;
      font-weight: bold;
    }

    .erro {
      padding: 14px;
      margin-bottom: 20px;
      border-radius: 6px;
      background: #fee2e2;
      color: #991b1b;
      font-weight: bold;
    }

    .aviso {
      padding: 14px;
      margin-bottom: 20px;
      border-radius: 6px;
      background: #fef3c7;
      color: #92400e;
      font-weight: bold;
    }

    .info {
      padding: 14px;
      border-radius: 6px;
      background: #eff6ff;
      color: #1e40af;
      margin-top: 15px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }

    th,
    td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #f8fafc;
    }

    .ativo {
      color: #157347;
      font-weight: bold;
    }

    .inativo {
      color: #b42318;
      font-weight: bold;
    }

    .pendente {
      color: #b45309;
      font-weight: bold;
    }

    .enviada {
      color: #157347;
      font-weight: bold;
    }

    .login {
      max-width: 450px;
      margin: 80px auto;
    }

    .mensagem-texto {
      max-width: 400px;
      white-space: normal;
      line-height: 1.5;
    }

    .numero {
      font-size: 32px;
      font-weight: bold;
      color: #173b57;
      margin: 5px 0;
    }

    .estatisticas {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(180px, 1fr));
      gap: 15px;
      margin-bottom: 24px;
    }

    .estatistica {
      background: white;
      border-radius: 10px;
      padding: 20px;
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .estatistica p {
      margin: 0;
      color: #64748b;
    }

    .acoes {
      white-space: nowrap;
    }

    .acoes form {
      display: inline-block;
      margin: 0;
    }

    @media (max-width: 700px) {
      table,
      thead,
      tbody,
      th,
      td,
      tr {
        display: block;
      }

      thead {
        display: none;
      }

      tr {
        margin-bottom: 18px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 10px;
      }

      td {
        border: 0;
        padding: 7px;
      }
    }

    /* Tema acolhedor e missionário — somente apresentação */
    :root { --marinho:#234b70; --azul:#3b76ac; --ceu:#eaf5fb; --borda:#dbe9f0; --texto:#294661; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color:var(--texto); background:linear-gradient(140deg,#edf7fb 0%,#f8fbfd 47%,#edf3f6 100%); min-height:100vh; }
    header { background:linear-gradient(105deg,rgba(231,244,251,.98),rgba(251,246,239,.96)),linear-gradient(120deg,#d2e9f5,#f9ead7); color:#244b71; border-bottom:1px solid #d9e8f0; padding:32px max(24px,calc((100vw - 1180px)/2)); position:relative; overflow:hidden; }
    header:after { content:'✧'; position:absolute; right:7%; top:-46px; font-size:180px; color:rgba(109,157,190,.12); pointer-events:none; }
    header h1 { font-family:Georgia,serif; font-size:clamp(28px,3.3vw,42px); letter-spacing:-.7px; }
    header p { color:#58758f; font-size:15px; opacity:1; }
    main { max-width:1180px; margin:0 auto; padding:30px 22px 70px; }
    .card,.estatistica { background:rgba(255,255,255,.96); border:1px solid var(--borda); border-radius:18px; box-shadow:0 8px 24px rgba(41,83,116,.075); }
    .card { padding:clamp(18px,2.6vw,30px); margin-bottom:22px; }
    .card h2 { font-family:Georgia,serif; color:var(--marinho); font-size:clamp(21px,2vw,27px); }
    .estatisticas { gap:18px; margin-bottom:24px; }
    .estatistica { padding:25px 28px; position:relative; overflow:hidden; }
    .estatistica:after { content:'✦'; position:absolute; right:20px; top:8px; color:#e0eef6; font-size:58px; }
    .estatistica p { color:#58718a; font-size:15px; }
    .numero { font-family:Georgia,serif; color:#244b71; font-size:44px; }
    button,.editar,.ativar,.desativar,.compilacao,.teste-email { border-radius:10px; transition:filter .15s ease,transform .15s ease; }
    button:hover { filter:brightness(.96); }
    button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible { outline:3px solid #78b9e8; outline-offset:2px; }
    .compilacao,.teste-email,.editar { background:#3477b9; }
    .compilacao { background:#286fba; padding:13px 19px; }
    .desativar { background:#a74242; }
    .info { background:#eef7ff; color:#285d93; border:1px solid #d7eafa; border-radius:10px; padding:15px 17px; }
    th { background:#edf5fa; color:#2b4d6a; }
    th,td { border-bottom:1px solid #e1ebf1; }
    tr:hover td { background:#f8fcfe; }
    input,select,textarea { border-radius:9px; border:1px solid #cbdde8; background:#fff; }
    .pendente,.enviada,.ativo,.inativo { display:inline-block; border-radius:999px; padding:4px 9px; font-size:13px; }
    .pendente { color:#996010; background:#fff1d9; }
    .enviada,.ativo { color:#1a745e; background:#def4eb; }
    .inativo { color:#9b4141; background:#fce7e7; }
    .login { margin:55px auto; }
    @media(max-width:700px) { header { padding:26px 20px; } main { padding:20px 14px 45px; } .estatisticas { grid-template-columns:1fr 1fr; gap:10px; } .estatistica { padding:17px 13px; } .numero { font-size:36px; } .card { padding:18px 15px; } .card h2 { font-size:22px; } button { max-width:100%; } }
    @media(max-width:420px) { .estatisticas { grid-template-columns:1fr; } }

    /* Segunda etapa visual: navegação e identidade missionária */
    html { scroll-behavior:smooth; }
    .painel-layout { display:grid; grid-template-columns:230px minmax(0,1fr); gap:24px; align-items:start; }
    .painel-conteudo { min-width:0; }
    .painel-menu { position:sticky; top:18px; background:#fff; border:1px solid var(--borda); border-radius:18px; padding:20px 14px; box-shadow:0 8px 24px rgba(41,83,116,.075); }
    .painel-menu strong { display:block; font-family:Georgia,serif; color:var(--marinho); font-size:21px; padding:5px 12px 15px; }
    .painel-menu a { display:block; padding:12px; margin:3px 0; color:#315d7f; border-radius:10px; text-decoration:none; font-weight:600; }
    .painel-menu a:hover,.painel-menu a:focus-visible { background:#eaf5fb; }
    .painel-menu .menu-nota { font-size:13px; line-height:1.5; color:#6a8295; padding:16px 12px 4px; border-top:1px solid var(--borda); margin-top:14px; }
    .painel-boas-vindas { border:1px solid #d7e9f1; border-radius:18px; background:linear-gradient(110deg,#e2f2f9,#fff8ef); padding:22px 26px; margin-bottom:22px; }
    .painel-boas-vindas h2 { font-family:Georgia,serif; color:#234b70; margin:0 0 8px; }
    .painel-boas-vindas p { margin:0; line-height:1.6; }
    .painel-conteudo .card,.painel-conteudo .estatisticas { scroll-margin-top:20px; }
    .tabela-rolagem { overflow-x:auto; max-width:100%; }
    .tabela-rolagem table { min-width:620px; }
    @media(max-width:900px) { .painel-layout { grid-template-columns:1fr; } .painel-menu { position:static; } .painel-menu nav { display:flex; flex-wrap:wrap; gap:5px; } .painel-menu a { flex:1 1 135px; text-align:center; } }
    @media(max-width:700px) { .tabela-rolagem table { min-width:0; } .painel-boas-vindas { padding:19px; } }

    /* V3: usabilidade responsiva, sem alterar rotas ou formulários */
    .menu-retratil > summary { list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; font-family:Georgia,serif; color:var(--marinho); font-size:21px; font-weight:bold; padding:5px 12px 15px; }
    .menu-retratil > summary::-webkit-details-marker { display:none; }
    .menu-indicador { display:none; }
    .painel-menu .menu-retratil > nav a { min-height:44px; }
    .painel-conteudo { overflow-wrap:anywhere; }
    .painel-conteudo table { display:block; overflow-x:auto; max-width:100%; -webkit-overflow-scrolling:touch; }
    .painel-conteudo th,.painel-conteudo td { overflow-wrap:normal; }
    @media(max-width:700px) {
      body { overflow-x:hidden; }
      header { padding:22px 16px; }
      header h1 { font-size:clamp(25px,6vw,36px); }
      main { padding:16px 12px 38px; }
      .painel-layout { gap:14px; }
      .painel-menu { padding:10px 12px; border-radius:14px; }
      .menu-retratil > summary { padding:9px 8px; min-height:46px; }
      .menu-indicador { display:inline-block; transition:transform .2s; }
      .menu-retratil[open] .menu-indicador { transform:rotate(180deg); }
      .painel-menu nav { display:flex; flex-direction:column; gap:3px; }
      .painel-menu a { flex:none !important; text-align:left !important; padding:12px 14px; }
      .painel-boas-vindas { padding:17px; }
      .painel-boas-vindas h2 { font-size:23px; }
      .estatisticas { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
      .estatistica { padding:17px 12px; }
      .estatistica p { font-size:13px; }
      .numero { font-size:33px; }
      .card { padding:18px 14px; }
      .painel-conteudo input,.painel-conteudo select,.painel-conteudo textarea { max-width:100%; }
      .painel-conteudo button { min-height:44px; }
      .tabela-rolagem table { min-width:620px; }
    }
    @media(max-width:380px) { .estatisticas { grid-template-columns:1fr; } }

    /* V4: acabamento compacto para telas pequenas — apenas CSS */
    @media (max-width:700px) {
      header { padding:16px 15px 17px; }
      header h1 { font-size:clamp(23px,5.4vw,30px); line-height:1.18; letter-spacing:-.4px; }
      header p { font-size:13px; line-height:1.4; margin-top:5px; }
      header:after { font-size:115px; top:-25px; right:0; }
      main { padding:12px 12px 32px; }
      .painel-layout { gap:10px; }
      .painel-menu { padding:7px 10px; }
      .menu-retratil > summary { font-size:19px; min-height:42px; padding:6px 8px; }
      .painel-boas-vindas { padding:14px 15px; margin-bottom:12px; }
      .painel-boas-vindas h2 { font-size:clamp(20px,5vw,24px); line-height:1.2; margin-bottom:5px; }
      .painel-boas-vindas p { font-size:14px; line-height:1.45; }
      .painel-conteudo > form[action="/admin/logout"] { margin-bottom:10px !important; }
      .painel-conteudo > form[action="/admin/logout"] button { min-height:40px; padding:9px 13px; }
      .estatisticas { gap:8px; margin-bottom:14px; }
      .estatistica { padding:13px 12px; }
      .estatistica p { font-size:12px; line-height:1.35; }
      .estatistica:after { font-size:40px; right:10px; top:4px; }
      .numero { font-size:32px; }
      .card { padding:16px 14px; margin-bottom:14px; }
      .card h2 { font-size:clamp(20px,5vw,24px); line-height:1.25; }
      .card p { line-height:1.5; }
      .painel-conteudo button,.painel-conteudo .botao { max-width:100%; white-space:normal; }
    }
    @media (max-width:380px) {
      .estatisticas { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .estatistica { padding:12px 9px; }
      .estatistica p { font-size:11px; }
      .numero { font-size:29px; }
    }
  </style>
</head>

<body>

<header>
  <h1>✉ Mensagens Missionárias</h1>

  <p>
    Um lugar de carinho, conexão e boas notícias · Painel administrativo
  </p>
</header>

<main>
  ${conteudo}
</main>

</body>
</html>
`;
}

// ======================================================
// SEGURANÇA DO PAINEL
// ======================================================

function assinatura(valor) {
  return createHmac("sha256", ADMIN_SESSION_SECRET).update(valor).digest("hex");
}
function compararSeguro(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
function cookieAdmin(req) {
  const cookies = Object.fromEntries((req.headers.cookie || "").split(";").map(v => {
    const i = v.indexOf("=");
    return i < 0 ? ["", ""] : [v.slice(0, i).trim(), v.slice(i + 1).trim()];
  }));
  return cookies.mm_admin || "";
}
function verificarSessao(req) {
  if (!ADMIN_SESSION_SECRET) return null;
  const token = cookieAdmin(req);
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [exp, nonce, sig] = partes;
  if (!/^\d+$/.test(exp) || !/^[a-f0-9]{32}$/.test(nonce)) return null;
  if (Number(exp) <= Math.floor(Date.now() / 1000)) return null;
  if (!compararSeguro(sig, assinatura(`${exp}.${nonce}`))) return null;
  return token;
}
function csrfToken(req) {
  return assinatura(`csrf:${verificarSessao(req)}`);
}
function campoCSRF(req) {
  return `<input type="hidden" name="_csrf" value="${csrfToken(req)}">`;
}
function verificarAdmin(req, res, next) {
  if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) {
    return res.status(503).send("Configuração administrativa incompleta.");
  }
  if (!verificarSessao(req)) return res.redirect(303, "/admin/login");
  if (req.method === "POST" && !compararSeguro(req.body?._csrf || "", csrfToken(req))) {
    return res.status(403).send("Formulário expirado ou inválido. Recarregue a página.");
  }
  res.set("Cache-Control", "no-store");
  next();
}
const tentativasLogin = new Map();
app.get("/admin/login", (req, res) => {
  if (verificarSessao(req)) return res.redirect(303, "/admin");
  res.set("Cache-Control", "no-store");
  res.send(paginaHTML(`<div class="card login"><h2>Acesso administrativo</h2>
    <p>Entre com a senha do painel.</p>
    <form method="POST" action="/admin/login">
      <label>Senha</label><input type="password" name="senha" autocomplete="current-password" required>
      <button class="principal" type="submit">Entrar</button>
    </form></div>`));
});
app.post("/admin/login", (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) return res.sendStatus(503);
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const agora = Date.now();
  const item = tentativasLogin.get(ip) || { contagem: 0, ate: agora + 15 * 60_000 };
  if (agora > item.ate) { item.contagem = 0; item.ate = agora + 15 * 60_000; }
  if (item.contagem >= 8) return res.status(429).send("Muitas tentativas. Aguarde 15 minutos.");
  const senha = typeof req.body?.senha === "string" ? req.body.senha : "";
  // ADMIN_PASSWORD pode ser texto temporariamente ou hash scrypt no formato scrypt:sal:hash.
  let correta = false;
  if (ADMIN_PASSWORD.startsWith("scrypt:")) {
    const partes = ADMIN_PASSWORD.split(":");
    if (partes.length === 3 && /^[a-f0-9]{32}$/.test(partes[1]) && /^[a-f0-9]{128}$/.test(partes[2])) {
      correta = compararSeguro(scryptSync(senha, Buffer.from(partes[1], "hex"), 64).toString("hex"), partes[2]);
    }
  } else correta = compararSeguro(senha, ADMIN_PASSWORD);
  if (!correta) {
    item.contagem++;
    tentativasLogin.set(ip, item);
    return res.status(401).send(paginaHTML(`<div class="card login"><h2>Senha incorreta</h2><a href="/admin/login">Tentar novamente</a></div>`));
  }
  tentativasLogin.delete(ip);
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const nonce = randomBytes(16).toString("hex");
  const dados = `${exp}.${nonce}`;
  res.cookie("mm_admin", `${dados}.${assinatura(dados)}`, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/admin", maxAge: SESSION_MAX_AGE * 1000
  });
  return res.redirect(303, "/admin");
});
app.post("/admin/logout", verificarAdmin, (req, res) => {
  res.clearCookie("mm_admin", { path: "/admin", httpOnly: true, secure: true, sameSite: "strict" });
  res.redirect(303, "/admin/login");
});

// ======================================================
// WHATSAPP
// ======================================================

async function enviarMensagemWhatsApp(
  telefone,
  texto
) {
  if (
    !WHATSAPP_TOKEN ||
    !PHONE_NUMBER_ID
  ) {
    console.error(
      "WHATSAPP_TOKEN ou PHONE_NUMBER_ID não configurado."
    );

    return false;
  }

  try {
    const resposta =
      await fetch(
        `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            messaging_product:
              "whatsapp",

            recipient_type:
              "individual",

            to: telefone,

            type: "text",

            text: {
              preview_url: false,
              body: texto
            }
          })
        }
      );

    const resultado =
      await resposta.json();

    if (!resposta.ok) {
      console.error(
        "Erro da API do WhatsApp:",
        JSON.stringify(
          resultado,
          null,
          2
        )
      );

      return false;
    }

    console.log(
      `Mensagem enviada para ${telefone}.`
    );

    return true;
  } catch (error) {
    console.error(
      "Erro ao enviar mensagem:",
      error
    );

    return false;
  }
}

// ======================================================
// MENU INTERATIVO DO WHATSAPP
// ======================================================

async function enviarMenuMissionarios(
  telefone
) {
  const resultado =
    await pool.query(`
      SELECT
        id,
        nome
      FROM missionarios
      WHERE ativo = TRUE
      ORDER BY nome ASC
    `);

  if (
    resultado.rows.length === 0
  ) {
    await enviarMensagemWhatsApp(
      telefone,
      "No momento não há missionários disponíveis para receber mensagens."
    );

    return;
  }

  /*
   * O WhatsApp permite no máximo
   * 10 opções em uma lista interativa.
   */

  if (
    resultado.rows.length > 10
  ) {
    let texto =
      "💙 *Mensagens Missionárias*\n\n" +
      "Para qual missionário você deseja enviar uma mensagem?\n\n";

    resultado.rows.forEach(
      (missionario, indice) => {
        texto +=
          `${indice + 1} - ${missionario.nome}\n`;
      }
    );

    texto +=
      "\nDigite somente o número correspondente ao missionário.";

    await salvarEtapa(
      telefone,
      "AGUARDANDO_MISSIONARIO"
    );

    await enviarMensagemWhatsApp(
      telefone,
      texto
    );

    return;
  }

  await salvarEtapa(
    telefone,
    "AGUARDANDO_MISSIONARIO"
  );

  const rows =
    resultado.rows.map(
      (missionario) => ({
        id:
          `missionario_${missionario.id}`,

        title:
          missionario.nome
            .substring(0, 24)
      })
    );

  if (
    !WHATSAPP_TOKEN ||
    !PHONE_NUMBER_ID
  ) {
    console.error(
      "WHATSAPP_TOKEN ou PHONE_NUMBER_ID não configurado."
    );

    return;
  }

  try {

    const resposta =
      await fetch(
        `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${WHATSAPP_TOKEN}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            messaging_product:
              "whatsapp",

            recipient_type:
              "individual",

            to:
              telefone,

            type:
              "interactive",

            interactive: {
              type:
                "list",

              header: {
                type:
                  "text",

                text:
                  "💙 Mensagens Missionárias"
              },

              body: {
                text:
                  "Para qual missionário você deseja enviar uma mensagem?"
              },

              footer: {
                text:
                  "Escolha um missionário na lista abaixo."
              },

              action: {
                button:
                  "Escolher missionário",

                sections: [
                  {
                    title:
                      "Missionários",

                    rows:
                      rows
                  }
                ]
              }
            }
          })
        }
      );

    const resultadoJson =
      await resposta.json();

    if (
      !resposta.ok
    ) {

      console.error(
        "Erro ao enviar menu interativo:",
        JSON.stringify(
          resultadoJson,
          null,
          2
        )
      );

      /*
       * Se a API não aceitar o menu,
       * usamos automaticamente o
       * menu de texto.
       */

      let texto =
        "💙 *Mensagens Missionárias*\n\n" +
        "Para qual missionário você deseja enviar uma mensagem?\n\n";

      resultado.rows.forEach(
        (missionario, indice) => {
          texto +=
            `${indice + 1} - ${missionario.nome}\n`;
        }
      );

      texto +=
        "\nDigite somente o número correspondente ao missionário.";

      await enviarMensagemWhatsApp(
        telefone,
        texto
      );

      return;
    }

    console.log(
      `Menu interativo enviado para ${telefone}.`
    );

  } catch (error) {

    console.error(
      "Erro ao enviar menu interativo:",
      error
    );

    /*
     * Fallback para menu de texto.
     */

    let texto =
      "💙 *Mensagens Missionárias*\n\n" +
      "Para qual missionário você deseja enviar uma mensagem?\n\n";

    resultado.rows.forEach(
      (missionario, indice) => {
        texto +=
          `${indice + 1} - ${missionario.nome}\n`;
      }
    );

    texto +=
      "\nDigite somente o número correspondente ao missionário.";

    await enviarMensagemWhatsApp(
      telefone,
      texto
    );
  }
}

// ======================================================
// CONTROLE DA CONVERSA
// ======================================================

async function buscarConversa(telefone) {
  const resultado =
    await pool.query(
      `
      SELECT
        telefone,
        etapa,
        missionario_id,
        nome_familia
      FROM conversas
      WHERE telefone = $1
      `,
      [telefone]
    );

  return resultado.rows[0] || null;
}

async function salvarEtapa(
  telefone,
  etapa,
  missionarioId = null,
  nomeFamilia = null
) {
  await pool.query(
    `
    INSERT INTO conversas
    (
      telefone,
      etapa,
      missionario_id,
      nome_familia,
      atualizado_em
    )

    VALUES
    (
      $1,
      $2,
      $3,
      $4,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT (telefone)

    DO UPDATE SET
      etapa = EXCLUDED.etapa,
      missionario_id =
        EXCLUDED.missionario_id,
      nome_familia =
        EXCLUDED.nome_familia,
      atualizado_em =
        CURRENT_TIMESTAMP
    `,
    [
      telefone,
      etapa,
      missionarioId,
      nomeFamilia
    ]
  );
}

async function reiniciarConversa(
  telefone
) {
  await pool.query(
    `
    DELETE FROM conversas
    WHERE telefone = $1
    `,
    [telefone]
  );
}

// ======================================================
// FLUXO DA FAMÍLIA
// ======================================================

async function processarConversa(
  telefone,
  texto,
  whatsappMessageId,
  missionarioSelecionadoId = null
) {
  const mensagem =
    texto.trim();

  let conversa =
    await buscarConversa(
      telefone
    );

  const comando =
    mensagem.toLowerCase();

  if (
    comando === "inicio" ||
    comando === "início" ||
    comando === "menu"
  ) {
    await reiniciarConversa(
      telefone
    );

    conversa = null;
  }

  if (!conversa) {

    await enviarMensagemWhatsApp(
      telefone,
      "Olá! 👋\n\n" +
      "Bem-vindo ao *Mensagens Missionárias*.\n\n" +
      "Aqui você pode deixar uma mensagem para um missionário."
    );

    await enviarMenuMissionarios(
      telefone
    );

    return;
  }

  // ==================================================
  // ESCOLHA DO MISSIONÁRIO
  // ==================================================

  if (
    conversa.etapa ===
    "AGUARDANDO_MISSIONARIO"
  ) {

    let missionario;

    /*
     * Se o usuário clicou no menu,
     * recebemos diretamente o ID.
     */

    if (
      missionarioSelecionadoId
    ) {

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            nome
          FROM missionarios
          WHERE id = $1
            AND ativo = TRUE
          `,
          [
            missionarioSelecionadoId
          ]
        );

      if (
        resultado.rowCount === 0
      ) {

        await enviarMensagemWhatsApp(
          telefone,
          "Não foi possível identificar esse missionário.\n\n" +
          "Digite *menu* para tentar novamente."
        );

        return;
      }

      missionario =
        resultado.rows[0];

    } else {

      /*
       * Mantém compatibilidade
       * com o antigo menu numérico.
       */

      const numero =
        Number.parseInt(
          mensagem,
          10
        );

      const resultado =
        await pool.query(`
          SELECT
            id,
            nome
          FROM missionarios
          WHERE ativo = TRUE
          ORDER BY nome ASC
        `);

      if (
        !Number.isInteger(numero) ||
        numero < 1 ||
        numero >
          resultado.rows.length
      ) {

        await enviarMensagemWhatsApp(
          telefone,
          "Opção inválida.\n\n" +
          "Escolha um missionário no menu ou digite o número correspondente."
        );

        return;
      }

      missionario =
        resultado.rows[
          numero - 1
        ];
    }

    await salvarEtapa(
      telefone,
      "AGUARDANDO_FAMILIA",
      missionario.id,
      null
    );

    await enviarMensagemWhatsApp(
      telefone,
      `Você selecionou *${missionario.nome}*.\n\n` +
      "Qual é o nome da sua família?\n\n" +
      "Exemplo: Família Silva"
    );

    return;
  }

  // ==================================================
  // NOME DA FAMÍLIA
  // ==================================================

  if (
    conversa.etapa ===
    "AGUARDANDO_FAMILIA"
  ) {

    if (
      mensagem.length < 2
    ) {

      await enviarMensagemWhatsApp(
        telefone,
        "Digite o nome da sua família."
      );

      return;
    }

    await salvarEtapa(
      telefone,
      "AGUARDANDO_MENSAGEM",
      conversa.missionario_id,
      mensagem
    );

    const missionario =
      await pool.query(
        `
        SELECT nome
        FROM missionarios
        WHERE id = $1
        `,
        [
          conversa.missionario_id
        ]
      );

    await enviarMensagemWhatsApp(
      telefone,
      `${mensagem}, agora escreva sua mensagem para *${missionario.rows[0]?.nome}*.\n\n` +
      "Pode escrever normalmente em uma única mensagem."
    );

    return;
  }

  // ==================================================
  // MENSAGEM PARA O MISSIONÁRIO
  // ==================================================

  if (
    conversa.etapa ===
    "AGUARDANDO_MENSAGEM"
  ) {

    if (!mensagem) {

      await enviarMensagemWhatsApp(
        telefone,
        "A mensagem não pode ficar vazia."
      );

      return;
    }

    const missionario =
      await pool.query(
        `
        SELECT
          id,
          nome
        FROM missionarios
        WHERE id = $1
          AND ativo = TRUE
        `,
        [
          conversa.missionario_id
        ]
      );

    if (
      missionario.rowCount === 0
    ) {

      await reiniciarConversa(
        telefone
      );

      await enviarMensagemWhatsApp(
        telefone,
        "Esse missionário não está mais disponível.\n\n" +
        "Envie *menu* para começar novamente."
      );

      return;
    }

    await pool.query(
      `
      INSERT INTO
        mensagens_missionarios
      (
        whatsapp_message_id,
        missionario_id,
        telefone_familia,
        nome_familia,
        mensagem,
        status
      )

      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        'PENDENTE'
      )

      ON CONFLICT
      (whatsapp_message_id)
      DO NOTHING
      `,
      [
        whatsappMessageId,
        conversa.missionario_id,
        telefone,
        conversa.nome_familia,
        mensagem
      ]
    );

    await reiniciarConversa(
      telefone
    );

    await enviarMensagemWhatsApp(
      telefone,
      "✅ *Mensagem recebida!*\n\n" +
      `Missionário: *${missionario.rows[0].nome}*\n` +
      `Família: *${conversa.nome_familia}*\n\n` +
      "Sua mensagem foi guardada e será incluída na próxima compilação semanal.\n\n" +
      "Obrigado por participar do *Mensagens Missionárias*. 💙\n\n" +
      "Se quiser enviar outra mensagem, digite *menu*."
    );

    console.log(
      `Mensagem destinada ao missionário ${missionario.rows[0].nome} salva com sucesso.`
    );

    return;
  }

  // ==================================================
  // REINÍCIO
  // ==================================================

  await reiniciarConversa(
    telefone
  );

  await enviarMensagemWhatsApp(
    telefone,
    "Vamos começar novamente.\n\n" +
    "Digite *menu*."
  );
}

// ======================================================
// COMPILAÇÃO DAS MENSAGENS
// ======================================================

async function enviarCompilacoesPendentes() {
  if (!resend) {
    throw new Error(
      "RESEND_API_KEY não configurada."
    );
  }

  const resultado =
    await pool.query(`
      SELECT
        mm.id,
        mm.missionario_id,
        mm.nome_familia,
        mm.mensagem,
        mm.criado_em,
        m.nome
          AS missionario_nome,
        m.email
          AS missionario_email

      FROM mensagens_missionarios mm

      INNER JOIN missionarios m
        ON m.id =
          mm.missionario_id

      WHERE
        mm.status = 'PENDENTE'

      ORDER BY
        m.id ASC,
        mm.criado_em ASC
    `);

  if (
    resultado.rows.length === 0
  ) {
    return {
      missionarios: 0,
      mensagens: 0,
      semEmail: 0,
      erros: 0
    };
  }

  const grupos =
    new Map();

  for (
    const item of
    resultado.rows
  ) {
    if (
      !grupos.has(
        item.missionario_id
      )
    ) {
      grupos.set(
        item.missionario_id,
        {
          id:
            item.missionario_id,

          nome:
            item.missionario_nome,

          email:
            item.missionario_email,

          mensagens: []
        }
      );
    }

    grupos
      .get(
        item.missionario_id
      )
      .mensagens
      .push(item);
  }

  let totalMissionarios = 0;
  let totalMensagens = 0;
  let totalSemEmail = 0;
  let totalErros = 0;

  for (
    const missionario of
    grupos.values()
  ) {

    if (
      !missionario.email?.trim()
    ) {

      console.log(
        `Missionário ${missionario.nome} não possui e-mail cadastrado.`
      );

      totalSemEmail++;

      continue;
    }

    const quantidade =
      missionario
        .mensagens
        .length;

    const blocosMensagens =
      missionario
        .mensagens
        .map(
          (item) => {

            const familia =
              escaparHTML(
                item.nome_familia
              );

            const mensagem =
              escaparHTML(
                item.mensagem
              )
                .replaceAll(
                  "\n",
                  "<br>"
                );

            const data =
              new Date(
                item.criado_em
              )
                .toLocaleString(
                  "pt-BR",
                  {
                    timeZone:
                      "America/Sao_Paulo"
                  }
                );

            return `
              <div
                style="
                  margin: 22px 0;
                  padding: 18px;
                  background: #f8fafc;
                  border-left: 4px solid #173b57;
                  border-radius: 6px;
                "
              >

                <p
                  style="
                    margin: 0 0 8px;
                    font-size: 17px;
                    font-weight: bold;
                    color: #173b57;
                  "
                >
                  ${familia}
                </p>

                <p
                  style="
                    margin: 0 0 12px;
                    line-height: 1.7;
                    font-size: 16px;
                  "
                >
                  ${mensagem}
                </p>

                <p
                  style="
                    margin: 0;
                    color: #64748b;
                    font-size: 12px;
                  "
                >
                  Recebida em
                  ${escaparHTML(data)}
                </p>

              </div>
            `;
          }
        )
        .join("");

    try {

      console.log(
        `Enviando compilação para ${missionario.nome} (${missionario.email})...`
      );

      const resultadoEmail =
        await resend.emails.send({
          from:
            "Mensagens Missionárias <mensagens@mail.familycode.com.br>",

          to: [
            missionario
              .email
              .trim()
          ],

          subject:
            quantidade === 1
              ? "Você recebeu uma nova mensagem - Mensagens Missionárias"
              : `Você recebeu ${quantidade} novas mensagens - Mensagens Missionárias`,

          html: `
            <div
              style="
                font-family: Arial, sans-serif;
                max-width: 650px;
                margin: 0 auto;
                color: #1f2937;
              "
            >

              <div
                style="
                  background: #173b57;
                  color: white;
                  padding: 24px;
                  border-radius: 8px 8px 0 0;
                "
              >

                <h2
                  style="
                    margin: 0;
                  "
                >
                  💙 Mensagens Missionárias
                </h2>

              </div>

              <div
                style="
                  padding: 25px;
                  border: 1px solid #e5e7eb;
                  border-top: 0;
                  border-radius: 0 0 8px 8px;
                "
              >

                <p>
                  Olá,
                  <strong>
                    ${escaparHTML(
                      missionario.nome
                    )}
                  </strong>!
                </p>

                <p>
                  ${
                    quantidade === 1
                      ? "Você recebeu uma nova mensagem de sua família."
                      : `Você recebeu <strong>${quantidade}</strong> novas mensagens de suas famílias.`
                  }
                </p>

                ${blocosMensagens}

                <p
                  style="
                    margin-top: 30px;
                  "
                >
                  Esperamos que essas
                  mensagens tragam
                  alegria e força para
                  sua missão.
                </p>

                <p>
                  Com carinho,<br>

                  <strong>
                    Mensagens Missionárias
                  </strong>
                </p>

              </div>

            </div>
          `
        });

      if (
        resultadoEmail.error
      ) {

        console.error(
          `Erro retornado pelo Resend para ${missionario.nome}:`,
          resultadoEmail.error
        );

        totalErros++;

        continue;
      }

      const ids =
        missionario
          .mensagens
          .map(
            (item) =>
              item.id
          );

      await pool.query(
        `
        UPDATE
          mensagens_missionarios

        SET
          status = 'ENVIADA',
          enviado_em =
            CURRENT_TIMESTAMP

        WHERE
          id = ANY($1::int[])
          AND status = 'PENDENTE'
        `,
        [ids]
      );

      totalMissionarios++;

      totalMensagens +=
        quantidade;

      console.log(
        `Compilação enviada para ${missionario.nome}.`
      );

      console.log(
        `${quantidade} mensagem(ns) marcada(s) como ENVIADA.`
      );

    } catch (error) {

      console.error(
        `Erro ao enviar compilação para ${missionario.nome}:`,
        error
      );

      totalErros++;
    }
  }

  return {
    missionarios:
      totalMissionarios,

    mensagens:
      totalMensagens,

    semEmail:
      totalSemEmail,

    erros:
      totalErros
  };
}

// ======================================================
// PÁGINA PRINCIPAL
// ======================================================

app.get(
  "/",
  (req, res) => {
    res
      .status(200)
      .send(
        "Mensagens Missionárias - servidor online"
      );
  }
);

// ======================================================
// PAINEL ADMINISTRATIVO
// ======================================================

app.get(
  "/admin",
  verificarAdmin,
  async (req, res) => {

    try {

      const resultado =
        await pool.query(`
          SELECT
            id,
            nome,
            email,
            telefone,
            ativo,
            criado_em
          FROM missionarios
          ORDER BY nome ASC
        `);

      const resultadoMensagens =
        await pool.query(`
          SELECT
            mm.id,
            mm.nome_familia,
            mm.telefone_familia,
            mm.mensagem,
            mm.status,
            mm.criado_em,
            mm.enviado_em,
            m.nome
              AS missionario_nome

          FROM mensagens_missionarios mm

          INNER JOIN missionarios m
            ON m.id =
              mm.missionario_id

          ORDER BY
            mm.criado_em DESC
        `);

      const estatisticas =
        await pool.query(`
          SELECT

            COUNT(*)
              FILTER (
                WHERE status =
                  'PENDENTE'
              )
              AS pendentes,

            COUNT(*)
              FILTER (
                WHERE status =
                  'ENVIADA'
              )
              AS enviadas

          FROM
            mensagens_missionarios
        `);

      let aviso = "";

      if (
        req.query.email === "ok"
      ) {

        aviso = `
          <div class="sucesso">
            E-mail de teste enviado com sucesso.
          </div>
        `;
      }

      if (
        req.query.email ===
        "erro"
      ) {

        aviso = `
          <div class="erro">
            Não foi possível enviar o e-mail de teste.
            Consulte os Logs do Render.
          </div>
        `;
      }

      if (
        req.query.editado === "ok"
      ) {

        aviso = `
          <div class="sucesso">
            Missionário atualizado com sucesso.
          </div>
        `;
      }

      if (
        req.query.compilacao ===
        "ok"
      ) {

        const totalMensagens =
          Number(
            req.query.mensagens ||
            0
          );

        const totalMissionarios =
          Number(
            req.query.missionarios ||
            0
          );

        const semEmail =
          Number(
            req.query.semEmail ||
            0
          );

        const erros =
          Number(
            req.query.erros ||
            0
          );

        aviso = `
          <div class="sucesso">

            Compilação concluída!

            <br><br>

            ${totalMensagens}
            mensagem(ns) enviada(s)
            para
            ${totalMissionarios}
            missionário(s).

            ${
              semEmail > 0
                ? `<br><br>${semEmail} missionário(s) não possui(em) e-mail cadastrado.`
                : ""
            }

            ${
              erros > 0
                ? `<br><br>${erros} envio(s) apresentou(aram) erro. As mensagens permaneceram PENDENTES.`
                : ""
            }

          </div>
        `;
      }

      if (
        req.query.compilacao ===
        "vazia"
      ) {

        aviso = `
          <div class="aviso">
            Não existem mensagens PENDENTES
            para enviar.
          </div>
        `;
      }

      if (
        req.query.compilacao ===
        "erro"
      ) {

        aviso = `
          <div class="erro">
            Ocorreu um erro ao processar
            a compilação.
            Consulte os Logs do Render.
          </div>
        `;
      }

      const linhas =
        resultado.rows
          .map(
            (missionario) => {

              const status =
                missionario.ativo
                  ? `<span class="ativo">Ativo</span>`
                  : `<span class="inativo">Inativo</span>`;

              const novoStatus =
                !missionario.ativo;

              const classe =
                missionario.ativo
                  ? "desativar"
                  : "ativar";

              const texto =
                missionario.ativo
                  ? "Desativar"
                  : "Ativar";

              return `
                <tr>

                  <td>
                    ${missionario.id}
                  </td>

                  <td>
                    ${escaparHTML(
                      missionario.nome
                    )}
                  </td>

                  <td>
                    ${escaparHTML(
                      missionario.email ||
                      "-"
                    )}
                  </td>

                  <td>
                    ${escaparHTML(
                      missionario.telefone ||
                      "-"
                    )}
                  </td>

                  <td>
                    ${status}
                  </td>

                  <td class="acoes">

                    <a
                      class="botao editar"
                      href="/admin/missionarios/${missionario.id}/editar"
                    >
                      Editar
                    </a>

                    <form
                      method="POST"
                      action="/admin/missionarios/${missionario.id}/status"
                    >

                      ${campoCSRF(req)}

                      <input
                        type="hidden"
                        name="ativo"
                        value="${novoStatus}"
                      >

                      <button
                        class="${classe}"
                        type="submit"
                      >
                        ${texto}
                      </button>

                    </form>

                  </td>

                </tr>
              `;
            }
          )
          .join("");

      const linhasMensagens =
        resultadoMensagens.rows
          .map(
            (item) => {

              const data =
                new Date(
                  item.criado_em
                )
                  .toLocaleString(
                    "pt-BR",
                    {
                      timeZone:
                        "America/Sao_Paulo"
                    }
                  );

              let classeStatus =
                "pendente";

              if (
                item.status ===
                "ENVIADA"
              ) {

                classeStatus =
                  "enviada";
              }

              return `
                <tr>

                  <td>
                    ${item.id}
                  </td>

                  <td>
                    ${escaparHTML(
                      item.missionario_nome
                    )}
                  </td>

                  <td>
                    ${escaparHTML(
                      item.nome_familia
                    )}
                  </td>

                  <td
                    class="mensagem-texto"
                  >
                    ${escaparHTML(
                      item.mensagem
                    )}
                  </td>

                  <td>
                    ${escaparHTML(
                      data
                    )}
                  </td>

                  <td>
                    <span
                      class="${classeStatus}"
                    >
                      ${escaparHTML(
                        item.status
                      )}
                    </span>
                  </td>

                </tr>
              `;
            }
          )
          .join("");

      const pendentes =
        estatisticas
          .rows[0]
          ?.pendentes || 0;

      const enviadas =
        estatisticas
          .rows[0]
          ?.enviadas || 0;

      res.send(
        paginaHTML(`

          <div class="painel-layout">
          <aside class="painel-menu" aria-label="Navegação do painel">
            <details class="menu-retratil" open>
              <summary>✉ Sua missão <span class="menu-indicador" aria-hidden="true">⌄</span></summary>
            <nav aria-label="Seções do painel">
              <a href="#inicio">⌂ Início</a>
              <a href="#compilacao">✉ Compilação</a>
              <a href="#teste-email">✧ Testar e-mail</a>
              <a href="#cadastro">＋ Cadastrar</a>
              <a href="#missionarios">♡ Missionários</a>
              <a href="#mensagens">▤ Mensagens</a>
            </nav>
            <p class="menu-nota">Cada mensagem aproxima uma família de quem está servindo. 💙</p>
            </details>
          </aside>
          <script>
            (() => {
              const menu = document.querySelector('.menu-retratil');
              if (!menu) return;
              if (window.matchMedia('(max-width: 700px)').matches) menu.open = false;
              menu.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => {
                if (window.matchMedia('(max-width: 700px)').matches) menu.open = false;
              }));
            })();
          </script>
          <div class="painel-conteudo">
          <section id="inicio" class="painel-boas-vindas">
            <h2>Bem-vindo ao seu painel 🌿</h2>
            <p>Um espaço para cuidar das mensagens e fortalecer conexões, mesmo à distância.</p>
          </section>
          <form method="POST" action="/admin/logout" style="text-align:right;margin-bottom:12px">
            ${campoCSRF(req)}<button type="submit" class="desativar">Sair do painel</button>
          </form>
          ${aviso}

          <div class="estatisticas">

            <div class="estatistica">
              <p>Mensagens pendentes</p>

              <div class="numero">
                ${pendentes}
              </div>
            </div>

            <div class="estatistica">
              <p>Mensagens enviadas</p>

              <div class="numero">
                ${enviadas}
              </div>
            </div>

          </div>

          <div class="card" id="compilacao">

            <h2>
              📬 Enviar compilação
            </h2>

            <p>
              Envia todas as mensagens
              <strong>PENDENTES</strong>
              agrupadas por missionário.
            </p>

            <p>
              Cada missionário receberá apenas
              um e-mail contendo todas as mensagens
              que estiverem pendentes para ele.
            </p>

            <div class="info">
              As mensagens somente serão marcadas
              como <strong>ENVIADA</strong> depois
              que o Resend confirmar o envio.
            </div>

            <form
              method="POST"
              action="/admin/enviar-compilacao"
              onsubmit="
                return confirm(
                  'Deseja enviar agora todas as mensagens pendentes?'
                );
              "
            >

              ${campoCSRF(req)}

              <button
                class="compilacao"
                type="submit"
              >
                Enviar compilação agora
              </button>

            </form>

          </div>

          <div class="card" id="teste-email">

            <h2>
              Testar envio de e-mail
            </h2>

            <p>
              Digite um endereço de e-mail para
              verificar se a integração com o
              Resend está funcionando.
            </p>

            <form
              method="POST"
              action="/admin/testar-email"
            >

              ${campoCSRF(req)}

              <label>
                E-mail para o teste
              </label>

              <input
                type="email"
                name="email_teste"
                required
              >

              <button
                class="teste-email"
                type="submit"
              >
                Enviar e-mail de teste
              </button>

            </form>

          </div>

          <div class="card" id="cadastro">

            <h2>
              Cadastrar missionário
            </h2>

            <form
              method="POST"
              action="/admin/missionarios"
            >

              ${campoCSRF(req)}

              <label>
                Nome do missionário
              </label>

              <input
                type="text"
                name="nome"
                required
              >

              <label>
                E-mail
              </label>

              <input
                type="email"
                name="email"
              >

              <label>
                WhatsApp / telefone
              </label>

              <input
                type="text"
                name="telefone"
                placeholder="5513999999999"
              >

              <button
                class="principal"
                type="submit"
              >
                Cadastrar missionário
              </button>

            </form>

          </div>

          <div class="card" id="missionarios">

            <h2>
              Missionários cadastrados
            </h2>

            <table>

              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>

              <tbody>
                ${
                  linhas ||
                  `
                    <tr>
                      <td colspan="6">
                        Nenhum missionário cadastrado.
                      </td>
                    </tr>
                  `
                }
              </tbody>

            </table>

          </div>

          <div class="card" id="mensagens">

            <h2>
              Mensagens recebidas
            </h2>

            <p>
              Mensagens enviadas pelas famílias
              e destinadas aos missionários.
            </p>

            <table>

              <thead>
                <tr>
                  <th>ID</th>
                  <th>Missionário</th>
                  <th>Família</th>
                  <th>Mensagem</th>
                  <th>Recebida em</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                ${
                  linhasMensagens ||
                  `
                    <tr>
                      <td colspan="6">
                        Nenhuma mensagem recebida.
                      </td>
                    </tr>
                  `
                }
              </tbody>

            </table>

          </div>

          </div>
          </div>
        `)
      );

    } catch (error) {

      console.error(
        "Erro ao carregar painel:",
        error
      );

      res
        .status(500)
        .send(
          "Erro ao carregar painel."
        );
    }
  }
);

// ======================================================
// ENVIAR COMPILAÇÃO MANUALMENTE
// ======================================================

app.post(
  "/admin/enviar-compilacao",
  verificarAdmin,
  async (req, res) => {

    try {

      console.log(
        "Iniciando compilação manual..."
      );

      const resultado =
        await enviarCompilacoesPendentes();

      console.log(
        "Resultado da compilação:",
        resultado
      );

      if (
        resultado.mensagens === 0 &&
        resultado.semEmail === 0 &&
        resultado.erros === 0
      ) {

        return res.redirect(
          `/admin?compilacao=vazia`
        );
      }

      return res.redirect(
        `/admin?compilacao=ok` +
        `&mensagens=${resultado.mensagens}` +
        `&missionarios=${resultado.missionarios}` +
        `&semEmail=${resultado.semEmail}` +
        `&erros=${resultado.erros}`
      );

    } catch (error) {

      console.error(
        "Erro na compilação manual:",
        error
      );

      return res.redirect(
        `/admin?compilacao=erro`
      );
    }
  }
);

// ======================================================
// TESTE DE E-MAIL - RESEND
// ======================================================

app.post(
  "/admin/testar-email",
  verificarAdmin,
  async (req, res) => {

    try {

      if (!resend) {
        throw new Error(
          "RESEND_API_KEY não configurada."
        );
      }

      const emailTeste =
        req.body
          .email_teste
          ?.trim();

      if (!emailTeste) {

        return res
          .status(400)
          .send(
            "Informe um e-mail para realizar o teste."
          );
      }

      console.log(
        `Enviando e-mail de teste para ${emailTeste}...`
      );

      const resultado =
        await resend.emails.send({

          from:
            "Mensagens Missionárias <mensagens@mail.familycode.com.br>",

          to: [
            emailTeste
          ],

          subject:
            "Teste - Mensagens Missionárias",

          html: `
            <div
              style="
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: auto;
                line-height: 1.6;
              "
            >

              <h2>
                💙 Mensagens Missionárias
              </h2>

              <p>
                Este é um e-mail de teste do
                sistema Mensagens Missionárias.
              </p>

              <p>
                Se você recebeu esta mensagem,
                a integração entre
                <strong>Render</strong>
                e
                <strong>Resend</strong>
                está funcionando.
              </p>

              <hr>

              <p
                style="
                  color: #64748b;
                  font-size: 13px;
                "
              >
                Mensagens Missionárias
              </p>

            </div>
          `
        });

      if (resultado.error) {

        console.error(
          "Erro retornado pelo Resend:",
          resultado.error
        );

        throw new Error(
          resultado.error.message ||
          "Erro no Resend."
        );
      }

      console.log(
        "E-mail enviado pelo Resend:",
        resultado.data
      );

      res.redirect(
        `/admin?email=ok`
      );

    } catch (error) {

      console.error(
        "Erro ao enviar e-mail de teste:",
        error
      );

      res.redirect(
        `/admin?email=erro`
      );
    }
  }
);

// ======================================================
// CADASTRAR MISSIONÁRIO
// ======================================================

app.post(
  "/admin/missionarios",
  verificarAdmin,
  async (req, res) => {

    try {

      const {
        nome,
        email,
        telefone
      } = req.body;

      if (!nome?.trim()) {

        return res
          .status(400)
          .send(
            "Nome obrigatório."
          );
      }

      if (
        !email?.trim() &&
        !telefone?.trim()
      ) {

        return res
          .status(400)
          .send(
            "Informe e-mail ou telefone."
          );
      }

      await pool.query(
        `
        INSERT INTO missionarios
        (
          nome,
          email,
          telefone
        )

        VALUES
        (
          $1,
          $2,
          $3
        )
        `,
        [
          nome.trim(),
          email?.trim() || null,
          telefone?.trim() || null
        ]
      );

      console.log(
        `Missionário cadastrado: ${nome}`
      );

      res.redirect(
        `/admin`
      );

    } catch (error) {

      if (
        error.code ===
        "23505"
      ) {

        return res
          .status(409)
          .send(
            "Já existe um missionário com esse telefone."
          );
      }

      console.error(
        "Erro ao cadastrar missionário:",
        error
      );

      res
        .status(500)
        .send(
          "Erro ao cadastrar missionário."
        );
    }
  }
);

// ======================================================
// EDITAR MISSIONÁRIO - FORMULÁRIO
// ======================================================

app.get(
  "/admin/missionarios/:id/editar",
  verificarAdmin,
  async (req, res) => {

    try {

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            nome,
            email,
            telefone,
            ativo
          FROM missionarios
          WHERE id = $1
          `,
          [
            req.params.id
          ]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res
          .status(404)
          .send(
            paginaHTML(`
              <div class="card">

                <h2>
                  Missionário não encontrado
                </h2>

                <p>
                  O cadastro solicitado
                  não existe.
                </p>

              </div>
            `)
          );
      }

      const missionario =
        resultado.rows[0];

      res.send(
        paginaHTML(`

          <div class="card">

            <h2>
              Editar missionário
            </h2>

            <p>
              Você está alterando o cadastro de
              <strong>
                ${escaparHTML(
                  missionario.nome
                )}
              </strong>.
            </p>

            <div class="info">

              Esta edição mantém o mesmo
              ID do missionário.

              <br><br>

              Portanto, as mensagens que
              já estão vinculadas a ele
              continuarão normalmente no
              sistema.

            </div>

            <form
              method="POST"
              action="/admin/missionarios/${missionario.id}/editar"
            >

              ${campoCSRF(req)}

              <label>
                Nome do missionário
              </label>

              <input
                type="text"
                name="nome"
                value="${escaparHTML(
                  missionario.nome
                )}"
                required
              >

              <label>
                E-mail
              </label>

              <input
                type="email"
                name="email"
                value="${escaparHTML(
                  missionario.email ||
                  ""
                )}"
              >

              <label>
                WhatsApp / telefone
              </label>

              <input
                type="text"
                name="telefone"
                value="${escaparHTML(
                  missionario.telefone ||
                  ""
                )}"
                placeholder="5513999999999"
              >

              <button
                class="principal"
                type="submit"
              >
                Salvar alterações
              </button>

            </form>

            <p
              style="
                margin-top: 25px;
              "
            >

              <a
                href="/admin"
              >
                ← Voltar ao painel
              </a>

            </p>

          </div>

        `)
      );

    } catch (error) {

      console.error(
        "Erro ao abrir edição do missionário:",
        error
      );

      res
        .status(500)
        .send(
          "Erro ao carregar missionário."
        );
    }
  }
);

// ======================================================
// EDITAR MISSIONÁRIO - SALVAR
// ======================================================

app.post(
  "/admin/missionarios/:id/editar",
  verificarAdmin,
  async (req, res) => {

    try {

      const {
        nome,
        email,
        telefone
      } = req.body;

      if (!nome?.trim()) {

        return res
          .status(400)
          .send(
            "Nome obrigatório."
          );
      }

      if (
        !email?.trim() &&
        !telefone?.trim()
      ) {

        return res
          .status(400)
          .send(
            "Informe e-mail ou telefone."
          );
      }

      const resultado =
        await pool.query(
          `
          UPDATE missionarios

          SET
            nome = $1,
            email = $2,
            telefone = $3

          WHERE id = $4

          RETURNING
            id,
            nome,
            email,
            telefone
          `,
          [
            nome.trim(),
            email?.trim() || null,
            telefone?.trim() || null,
            req.params.id
          ]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res
          .status(404)
          .send(
            "Missionário não encontrado."
          );
      }

      console.log(
        `Missionário ${resultado.rows[0].nome} atualizado com sucesso.`
      );

      res.redirect(
        `/admin?editado=ok`
      );

    } catch (error) {

      if (
        error.code ===
        "23505"
      ) {

        return res
          .status(409)
          .send(
            "Esse telefone já está cadastrado para outro missionário."
          );
      }

      console.error(
        "Erro ao atualizar missionário:",
        error
      );

      res
        .status(500)
        .send(
          "Erro ao atualizar missionário."
        );
    }
  }
);

// ======================================================
// ATIVAR / DESATIVAR MISSIONÁRIO
// ======================================================

app.post(
  "/admin/missionarios/:id/status",
  verificarAdmin,
  async (req, res) => {

    try {

      const ativo =
        req.body.ativo ===
        "true";

      await pool.query(
        `
        UPDATE missionarios
        SET ativo = $1
        WHERE id = $2
        `,
        [
          ativo,
          req.params.id
        ]
      );

      res.redirect(
        `/admin`
      );

    } catch (error) {

      console.error(
        "Erro ao alterar status:",
        error
      );

      res
        .status(500)
        .send(
          "Erro ao alterar missionário."
        );
    }
  }
);

// ======================================================
// VERIFICAÇÃO DO WEBHOOK
// ======================================================

app.get(
  "/webhook",
  (req, res) => {

    const mode =
      req.query[
        "hub.mode"
      ];

    const token =
      req.query[
        "hub.verify_token"
      ];

    const challenge =
      req.query[
        "hub.challenge"
      ];

    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ) {

      console.log(
        "Webhook verificado com sucesso."
      );

      return res
        .status(200)
        .send(
          challenge
        );
    }

    return res
      .sendStatus(403);
  }
);

// ======================================================
// WEBHOOK DO WHATSAPP
// ======================================================

app.post(
  "/webhook",
  async (req, res) => {

    /*
     * Respondemos imediatamente ao Meta
     * para evitar timeout.
     */

    res.sendStatus(200);

    try {

      const value =
        req.body
          ?.entry?.[0]
          ?.changes?.[0]
          ?.value;

      const message =
        value
          ?.messages?.[0];

      const contact =
        value
          ?.contacts?.[0];

      if (!message) {
        return;
      }

      const whatsappMessageId =
        message.id;

      const telefone =
        message.from;

      const nome =
        contact
          ?.profile
          ?.name ||
        "Sem nome";

      const tipo =
        message.type ||
        "desconhecido";

      /*
       * Texto normal.
       */

      let texto =
        message
          .text
          ?.body || "";

      /*
       * ID do missionário escolhido
       * pelo menu interativo.
       */

      let missionarioSelecionadoId =
        null;

      /*
       * Verifica se o usuário clicou
       * em uma opção da lista.
       */

      if (
        tipo === "interactive" &&
        message
          .interactive
          ?.type === "list_reply"
      ) {

        const idSelecionado =
          message
            .interactive
            ?.list_reply
            ?.id;

        const tituloSelecionado =
          message
            .interactive
            ?.list_reply
            ?.title ||
          "";

        if (
          idSelecionado
            ?.startsWith(
              "missionario_"
            )
        ) {

          missionarioSelecionadoId =
            Number.parseInt(
              idSelecionado.replace(
                "missionario_",
                ""
              ),
              10
            );
        }

        texto =
          tituloSelecionado;

        console.log(
          `Opção selecionada no menu: ${tituloSelecionado}`
        );

        console.log(
          `ID do missionário selecionado: ${missionarioSelecionadoId}`
        );
      }

      console.log(
        "Nova mensagem recebida:"
      );

      console.log(
        `Nome: ${nome}`
      );

      console.log(
        `Telefone: ${telefone}`
      );

      console.log(
        `Mensagem: ${texto}`
      );

      console.log(
        `Tipo: ${tipo}`
      );

      /*
       * Salva também no histórico geral
       * de mensagens.
       */

      const registro =
        await pool.query(
          `
          INSERT INTO mensagens
          (
            whatsapp_message_id,
            nome,
            telefone,
            mensagem,
            tipo
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )

          ON CONFLICT
          (whatsapp_message_id)
          DO NOTHING

          RETURNING id
          `,
          [
            whatsappMessageId,
            nome,
            telefone,
            texto,
            tipo
          ]
        );

      if (
        registro.rowCount ===
        0
      ) {

        console.log(
          "Mensagem já processada anteriormente."
        );

        return;
      }

      console.log(
        "Mensagem salva no banco de dados."
      );

      /*
       * Aceitamos:
       *
       * - mensagem de texto
       * - escolha de lista interativa
       */

      const mensagemValida =
        tipo === "text" ||
        (
          tipo === "interactive" &&
          message
            .interactive
            ?.type === "list_reply"
        );

      if (
        !mensagemValida
      ) {

        await enviarMensagemWhatsApp(
          telefone,
          "Por enquanto, envie sua mensagem em formato de texto ou utilize o menu disponível."
        );

        return;
      }

      await processarConversa(
        telefone,
        texto,
        whatsappMessageId,
        missionarioSelecionadoId
      );

    } catch (error) {

      console.error(
        "Erro ao processar webhook:",
        error
      );
    }
  }
);

// ======================================================
// ENVIO AUTOMÁTICO SEMANAL
// ======================================================

function iniciarAgendamentoSemanal() {

  if (
    !cron.validate(
      WEEKLY_CRON
    )
  ) {

    console.error(
      `WEEKLY_CRON inválido: ${WEEKLY_CRON}`
    );

    return;
  }

  console.log(
    `Compilação semanal agendada: ${WEEKLY_CRON}`
  );

  console.log(
    `Fuso horário da compilação: ${TIMEZONE}`
  );

  cron.schedule(
    WEEKLY_CRON,

    async () => {

      console.log(
        "=========================================="
      );

      console.log(
        "Iniciando compilação semanal automática..."
      );

      console.log(
        `Data/hora: ${new Date().toLocaleString(
          "pt-BR",
          {
            timeZone:
              TIMEZONE
          }
        )}`
      );

      try {

        const resultado =
          await enviarCompilacoesPendentes();

        console.log(
          "Resultado da compilação semanal automática:",
          resultado
        );

        if (
          resultado.mensagens === 0 &&
          resultado.semEmail === 0 &&
          resultado.erros === 0
        ) {

          console.log(
            "Nenhuma mensagem pendente para a compilação desta semana."
          );

          console.log(
            "=========================================="
          );

          return;
        }

        console.log(
          `Compilação automática concluída: ${resultado.mensagens} mensagem(ns) enviada(s) para ${resultado.missionarios} missionário(s).`
        );

        if (
          resultado.semEmail > 0
        ) {

          console.log(
            `${resultado.semEmail} missionário(s) sem e-mail cadastrado.`
          );
        }

        if (
          resultado.erros > 0
        ) {

          console.error(
            `${resultado.erros} envio(s) apresentou(aram) erro. As respectivas mensagens permaneceram PENDENTES.`
          );
        }

      } catch (error) {

        console.error(
          "Erro na compilação semanal automática:",
          error
        );
      }

      console.log(
        "=========================================="
      );
    },

    {
      timezone:
        TIMEZONE,

      noOverlap:
        true
    }
  );
}

// ======================================================
// INICIALIZAÇÃO
// ======================================================

async function iniciarServidor() {

  try {

    await inicializarBanco();

    // Agendamento interno desativado: compilação apenas manual durante os testes.

    app.listen(
      PORT,
      () => {

        console.log(
          `Servidor iniciado na porta ${PORT}`
        );
      }
    );

  } catch (error) {

    console.error(
      "Não foi possível iniciar o servidor:",
      error
    );

    process.exit(1);
  }
}

iniciarServidor();
