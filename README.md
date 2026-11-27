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

Os testes de permissões estão em `supabase/tests/rls_test.sql` e `supabase/tests/rls_scope_test.sql`. Correm dentro de uma transação que é sempre desfeita.

### O que cada scout vê

Um Scout só vê o que é dele:
- **Jogadores**: os que ele próprio adicionou (`createdBy`) e os das suas tarefas e dos seus relatórios.
- **Relatórios, tarefas e notas**: só os seus.
- Não vê o plantel, as necessidades, as equipas sombra, a área financeira, os utilizadores nem o trabalho de outros scouts.

Só edita os jogadores que adicionou. Quem tem "Ver todos os jogadores" (Diretor desportivo, Chief scout, Analista) vê a base de dados inteira. O proprietário pode alargar ou reduzir o acesso de cada pessoa em Utilizadores e permissões.

## Convites

1. O proprietário convida em Definições › Utilizadores e permissões (email, perfil, permissões).
2. A plataforma envia o email de convite (Edge Function `send-invite`, que só aceita pedidos do proprietário para convites em aberto).
3. A pessoa abre o link, escolhe o nome e a palavra-passe e entra; o acesso abre-se com o perfil do convite.

No Supabase é preciso:
- **SMTP próprio** (Authentication › Emails › SMTP Settings): sem ele, o Supabase só envia emails para a equipa do projeto.
- **URL Configuration**: Site URL `https://scouting-leixoes.netlify.app` e Redirect URL `https://scouting-leixoes.netlify.app/**`.

## Protótipo

O protótipo no claude.ai é gerado a partir destes mesmos ficheiros:

    python3 tools/build-prototype.py saida.html

Sem `config.js`, `app.js` corre em modo protótipo (armazenamento e contas do claude.ai). Qualquer alteração à app chega aos dois.
