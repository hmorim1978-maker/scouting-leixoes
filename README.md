# Scouting & Recruitment Platform — Leixões S.C.

Plataforma de scouting e recrutamento do Leixões S.C. (época 2026/27).

## Como está montada

| Parte | Onde | O quê |
|---|---|---|
| Página | Netlify (esta pasta, sem passo de build) | `index.html`, `app.css`, `app.js`, `runtime.js`, `theme.js`, `config.js` |
| Login e dados | Supabase (região UE) | Contas por email e palavra-passe; todos os dados na tabela `public.docs` |
| Código | GitHub | Cada alteração enviada para `main` é publicada pela Netlify |

- `app.js` é a aplicação (a mesma do protótipo). Lê e grava através de três serviços: `db`, `user` e `downloads`.
- `runtime.js` faz o login (entrar, criar conta, recuperar a palavra-passe) e fornece esses três serviços sobre o Supabase. Só carrega `app.js` depois de a pessoa entrar.
- `config.js` tem o endereço do Supabase e a chave pública (anon). A chave pode ser pública; quem decide o que cada pessoa pode ler ou alterar é a base de dados.

## Segurança

As permissões aplicam-se em três níveis:
1. **Interface**: menus e botões aparecem conforme as permissões.
2. **Ações e rotas**: cada ação é verificada antes de correr.
3. **Base de dados**: row level security em `public.docs` (ver `supabase/migrations`). A base de dados calcula as permissões de cada pessoa (perfil + ajustes individuais) e recusa leituras e escritas não permitidas, mesmo que alguém contorne a interface.

O proprietário é identificado pelo email confirmado guardado em `public.app_config` (fora deste repositório).

Os testes de permissões estão em `supabase/tests/rls_test.sql`. Correm dentro de uma transação que é sempre desfeita.

## Convites

1. O proprietário convida em Definições › Utilizadores e permissões (email, perfil, permissões).
2. A pessoa cria conta com esse email e confirma-o.
3. Ao entrar, o acesso abre-se sozinho com o perfil do convite.

Para os emails de confirmação chegarem a pessoas fora da equipa do Supabase, é preciso configurar um serviço de email (SMTP) no Supabase.
