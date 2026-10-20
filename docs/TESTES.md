# Verificação da entrega

A entrega foi validada localmente com um administrador e dois membros fictícios (Alice e Bruno), além de contas pendentes, suspensas e acesso anônimo. Nenhuma conta real do usuário foi criada. O projeto Supabase e a hospedagem ainda serão configurados por você.

| Camada | Resultado | Alcance da verificação |
| --- | --- | --- |
| Banco e permissões | 39 verificações aprovadas em PostgreSQL 17 real | RLS, isolamento, publicação/edição atômicas, limite de fotos, objetos privados, privilégios, acesso entre membros e bloqueios |
| Primeiro administrador | 5 verificações aprovadas | Arquivo SQL real: usuário ausente, confirmação de e-mail, promoção inicial e proteção contra repetição |
| Navegador | 36 verificações aprovadas em Chromium | SDK Supabase real com respostas HTTP **simuladas**; interface, autenticação, publicações, perfil, administração, imagens e downloads |
| Validações de arquivos e configuração | 6 testes aprovados em Node | Tamanhos, formatos, assinaturas de imagem, nomes únicos/seguros de ZIP, subpasta e rejeição de chaves privilegiadas |

## O que foi exercitado

- O administrador aprova membros, suspende acesso e remove publicações de outra pessoa.
- Alice e Bruno publicam e editam seu próprio conteúdo; o banco nega alteração/exclusão do conteúdo do outro. O administrador pode remover qualquer publicação, mas não editar texto alheio.
- Conta pendente, suspensa ou anônima não lê o feed nem os originais de outros membros. O banco consulta o status atual, sem depender apenas do estado do login ou de botões escondidos.
- Tentativas de autoaprovação, autopromoção, caminhos de arquivos de outro usuário e registro direto de fotos por fora das RPCs são negadas.
- Todos os membros aprovados podem obter originais registrados de outros autores. Originais não podem ser sobrescritos pelo cliente.
- O SQL foi reaplicado sem apagar os dados. O procedimento de primeiro administrador foi executado e verificado no banco local.
- Cadastro e solicitação de recuperação usam o retorno exato da pasta `/blog/`. O evento de recuperação abre o formulário e atualiza a senha pela API Auth simulada.
- Publicações apenas de texto, apenas de fotos e com ambos funcionam; seleção/prévia, edição com novas fotos, confirmação/cancelamento e exclusão foram exercitados.
- Texto com HTML aparece literalmente, sem execução. Arquivo com assinatura incompatível é recusado.
- Perfil salva nome e avatar JPEG preparado em até 512 pixels.
- O original enviado permaneceu idêntico byte a byte; a miniatura foi enviada separadamente em JPEG.
- Download individual, download pela ampliação e ZIP de fotos de outro autor conservaram os bytes originais. Nomes duplicados no ZIP foram preservados como arquivos distintos, sem sobrescrever uma foto. Uma conferência independente com `zipfile` do Python validou os CRCs do ZIP baixado e os SHA-256 dos dois originais.
- A ampliação carregou o original, não a miniatura. O painel de download e seu link de salvamento ficaram acessíveis dentro da ampliação.
- Falhas de download e consulta aparecem na interface; sair remove o conteúdo privado da tela.
- Raiz e `/blog/` funcionaram com os mesmos arquivos. Telas entre 320 e 1440 pixels foram conferidas sem rolagem horizontal; o download também foi exercitado com viewport de celular.

Os detalhes estão em [security-results.txt](security-results.txt) e [browser-results.txt](browser-results.txt).

## Limites e verificações que faltam nas suas contas

Os testes do banco usam as políticas e funções entregues em PostgreSQL real, com estruturas locais que representam `auth.users`, `auth.uid()` e os objetos do Storage. Eles não executam os serviços HTTP completos do Supabase. Os testes de interface usam o SDK Supabase real e simulam Auth/PostgREST/Storage; não comprovam a configuração do seu projeto.

Após seguir [MANUAL.md](MANUAL.md), faça o roteiro com três contas reais em dispositivos ou perfis separados. Ainda precisam de validação:

- Conexão e aplicação do SQL no seu Supabase, buckets privados, limites do plano e ausência de políticas antigas que ampliem acesso.
- Cadastro/entrega real dos e-mails, confirmação, SMTP, limites de envio e recuperação no domínio definitivo.
- Contas reais, tokens e autorização ponta a ponta nas APIs de Database e Storage, inclusive após suspensão com sessão aberta.
- Persistência compartilhada entre aparelhos usando seu projeto online.
- HTTPS e cabeçalhos da Hostinger, raiz/subpasta e redirecionamentos do seu domínio.
- Safari/iPhone e Android reais: salvar arquivos e comportamento de memória variam entre aparelhos. Chromium com viewport móvel não substitui um teste físico de iOS.
- Álbuns no limite de 160 MiB e fotos muito grandes no seu aparelho. O ZIP é montado no navegador e precisa de memória; há download individual como alternativa.

Um acesso já concedido ou um arquivo já baixado não pode ser apagado à distância. A suspensão bloqueia novas operações protegidas. Quando uma resposta de gravação se perde, os uploads são preservados para evitar apagar uma publicação que talvez tenha sido salva; arquivos sem registro podem exigir limpeza administrativa.

## Reproduzir os testes (opcional, para desenvolvimento)

Não é necessário executar testes ou instalar ferramentas para publicar o site. Para desenvolvimento:

```sh
# Node 22 ou mais recente, na pasta do projeto:
node --test tests/utils.test.mjs

# Docker disponível; PostgreSQL descartável, sem portas expostas:
bash tests/run-database.sh

# Testes do navegador (dependências somente de desenvolvimento):
cd tests
npm ci
npx playwright install chromium
npm test
```

`tests/browser.cjs` usa um servidor local temporário e respostas HTTP de teste, não as chaves preenchidas em `assets/config.js`. Os testes do banco usam um container separado e descartável; nunca aponte o bootstrap de teste para seu banco real. Os logs são regravados por cada execução. Bibliotecas e fontes entregues estão identificadas em [DEPENDENCIAS.md](DEPENDENCIAS.md).
