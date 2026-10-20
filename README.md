# Entre nós

Diário colaborativo privado em português para compartilhar mensagens e fotos com amigos. Interface em HTML, CSS e JavaScript, sem compilação, com Supabase Auth, Database e Storage privado.

## Baixar o pacote

[Baixar o blog completo em ZIP](https://github.com/luisellemenezes-sudo/codex-notion/raw/refs/heads/blog-colaborativo/entrega/entre-nos.zip). Se o repositório for privado, entre na sua conta GitHub antes de baixar. O pacote inclui o site, os scripts SQL e os manuais.

## Começar

1. Crie um projeto Supabase e execute [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor.
2. Configure os e-mails e os endereços de retorno do Auth.
3. Preencha a URL e a **chave publicável** em `assets/config.js`. Nunca use `service_role` ou chaves secretas no navegador.
4. Publique `index.html`, `assets/` e o `.htaccess` opcional na Hostinger, na raiz ou em `/blog/`.
5. Cadastre e confirme sua conta; crie o primeiro administrador pelo procedimento seguro do manual.

Veja o [manual para iniciantes](docs/MANUAL.md) para o passo a passo completo e [a validação da entrega](docs/TESTES.md) para saber o que foi testado e o que depende das suas contas.

## Recursos

- Cadastro por e-mail, confirmação, recuperação de senha, perfil e saída.
- Aprovação e suspensão de membros; publicação e leitura apenas por aprovados.
- Texto e até oito fotos por publicação, prévias, edição, exclusão e ampliação.
- Downloads individuais e em ZIP com os originais preservados; miniaturas separadas para o feed.
- Permissões RLS no banco e no Storage, incluindo os downloads.
- Layout adaptável, fundo preto, elementos brancos e fonte Poppins local.

Todos os dados de conteúdo ficam no Supabase. As bibliotecas de navegador e fontes acompanham os arquivos; nenhuma instalação de pacotes é necessária para publicar.
