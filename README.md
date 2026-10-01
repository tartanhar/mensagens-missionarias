# Mensagens Missionárias
Backend inicial para WhatsApp Business Platform/Flows com armazenamento semanal e compilação em PDF por missionário.

## Incluído
- `GET /webhook`: verificação do webhook Meta.
- `POST /webhook`: recebe respostas de WhatsApp Flow e grava como `PENDENTE`.
- Assinatura `X-Hub-Signature-256` quando `APP_SECRET` está configurado.
- Agendamento padrão: domingo, 20h, `America/Sao_Paulo`.
- PDF individual por missionário + envio SMTP.
- `POST /admin/run-weekly` para teste manual (header `x-admin-token`).
- `flow.json`: protótipo do Flow.

## Antes de produção
1. Copie `.env.example` para `.env` e preencha credenciais apenas no servidor.
2. Troque os exemplos de `data/missionarios.json` pelos missionários reais.
3. Publique em um host HTTPS e configure `https://SEU_HOST/webhook` na Meta.
4. Cadastre um número brasileiro dedicado na WhatsApp Business Platform.
5. Configure SMTP/e-mail e teste em ambiente controlado.

Nunca publique `.env`, App Secret, tokens Meta ou senhas SMTP no repositório.
