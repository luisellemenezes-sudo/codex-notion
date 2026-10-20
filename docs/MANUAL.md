# Entre nós — manual de instalação

Um diário privado para amigos, com publicações de texto e fotos, contas individuais e aprovação pelo administrador. A interface usa HTML, CSS e JavaScript e não exige compilação. As contas ficam no Supabase Auth, os registros no Database e as imagens em buckets privados do Storage. Você precisa de um projeto Supabase e de uma hospedagem HTTPS, como a Hostinger.

## 1. O que vem no pacote

- `index.html`: página do blog.
- `assets/`: estilos, JavaScript, configuração, fontes Poppins e bibliotecas locais.
- `supabase/schema.sql`: tabelas, funções, buckets privados e permissões RLS.
- `supabase/primeiro-admin.sql`: criação inicial do administrador no SQL Editor.
- `.htaccess`: cabeçalhos de proteção opcionais para a Hostinger/Apache; envie também esse arquivo oculto.
- `docs/MANUAL.md`: este manual.
- `docs/TESTES.md`: resultados efetivamente verificados e limites da validação.

Não envie a pasta `.git`, ferramentas de desenvolvimento ou contas de teste para a hospedagem. O ZIP de entrega contém os arquivos necessários. Nenhuma chave secreta deve fazer parte do site.

## 2. Crie o projeto Supabase

1. Acesse <https://supabase.com/dashboard>, entre na sua conta e crie um projeto.
2. Escolha uma região adequada para os participantes. Guarde a senha do banco em um gerenciador de senhas; ela não será usada no navegador.
3. Aguarde o projeto ficar disponível.
4. Em **SQL Editor**, crie uma consulta, cole o conteúdo inteiro de `supabase/schema.sql` e execute.
5. Confirme, em **Table Editor**, as tabelas `profiles`, `posts` e `post_photos`. Em **Storage**, confirme os buckets `originals`, `thumbnails` e `avatars`. Os três devem continuar **privados**.

**Use um projeto Supabase dedicado a este blog.** Não mantenha políticas permissivas anteriores nos mesmos buckets ou tabelas: políticas PostgreSQL podem se somar e conceder acesso além do esperado. O script preserva outros projetos/objetos e não apaga políticas desconhecidas automaticamente.

Execute o SQL como o usuário administrativo padrão do SQL Editor, normalmente `postgres`. O script foi feito para poder ser reaplicado, mas faça backup antes de mudar um projeto que já contenha dados. Não remova tabelas nem desative RLS para resolver problemas de instalação.

### Arquivos e limites

São aceitas fotos JPEG, PNG, WebP e GIF. Cada publicação permite até **8 fotos**, com até **20 MiB por original** e até 60 megapixels (nenhum lado acima de 40.000 pixels). O limite de upload geral do projeto Supabase também deve permitir esse tamanho; confira **Storage → Settings** e os limites do seu plano. Os buckets aplicam seus próprios limites de formato e tamanho.

No iPhone, uma imagem HEIC/HEIF deve ser exportada como JPEG antes do envio. A opção de câmera “Mais compatível” pode ajudar em novas fotos. Não basta renomear `.heic` para `.jpg`.

O original é enviado sem redimensionamento nem recompressão. O site cria um arquivo separado em JPEG para a miniatura, com lado maior de até 1200 pixels; o feed carrega essa versão. GIFs mantêm a animação no original, mas a miniatura é estática. Fotos de perfil são preparadas separadamente para exibição em até 512 pixels.

## 3. Configure os endereços e os e-mails

Decida antes onde o blog ficará. Exemplos:

| Publicação | Endereço do blog |
| --- | --- |
| Na raiz | `https://meudominio.com/` |
| Em uma subpasta | `https://meudominio.com/blog/` |

No Supabase, abra **Authentication → URL Configuration**:

1. Preencha **Site URL** com o endereço definitivo, incluindo `/blog/` se usar essa pasta e a barra final.
2. Em **Redirect URLs**, adicione esse mesmo endereço exato.
3. Se usar um domínio temporário para testes, adicione também o endereço exato desse domínio. Remova os endereços temporários quando concluir.

O site calcula o retorno de confirmação e recuperação a partir da pasta em que está aberto. Não precisa ser instalado na raiz. Evite regras com `*` em domínios de produção quando um endereço exato for suficiente.

Em **Authentication → Providers → Email**, habilite cadastro por e-mail e senha e mantenha a confirmação de e-mail ativa. Cadastros novos precisam confirmar o e-mail e, depois, aguardar aprovação. São etapas diferentes.

Em **Authentication → Email Templates**, revise os modelos de confirmação e recuperação. O link padrão que usa `{{ .ConfirmationURL }}` preserva o fluxo de segurança do Supabase. Não troque esse link por uma URL fixa do blog nem coloque senhas no modelo. Traduza o texto ao redor dele, se desejar.

Para uso real com amigos, configure **SMTP próprio** nas opções de e-mail do Auth, com um provedor de sua escolha e remetente verificado. O serviço padrão de testes do Supabase tem restrições de destinatários e envio; não conte com ele para todos os convidados. Confira cotas, limites de envio e logs no painel. As credenciais SMTP ficam apenas no painel do Supabase, nunca em `config.js`.

Faça um teste de confirmação e outro de recuperação já no domínio definitivo. Se o provedor de e-mail verificar links automaticamente, consulte as recomendações do Supabase/provedor para evitar consumo antecipado dos links de uso único.

## 4. Preencha a configuração pública

Abra `assets/config.js` em um editor de texto. Preencha somente a URL do projeto e a **chave publicável**:

```js
window.BLOG_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseKey: 'sb_publishable_SUBSTITUA_PELA_SUA_CHAVE'
};
```

Encontre os dados nas configurações de API/Connect do seu projeto Supabase. Em projetos com chaves antigas, a chave pública `anon` é o equivalente aceito pelo cliente. A chave `sb_secret_...`, a chave `service_role`, a senha do banco e a chave privada de assinatura **não podem ser usadas aqui**.

A URL e a chave publicável ficam visíveis para qualquer visitante. Isso é esperado: a proteção real é feita pelo login e pelas políticas RLS, aplicadas no servidor. A chave pública não torna tabelas e fotos públicas.

Não há build, `npm install` ou arquivo `.env` exigido para publicar. As bibliotecas e fontes já acompanham a entrega.

## 5. Publique na Hostinger

1. No hPanel, associe seu domínio à hospedagem e ative o certificado SSL.
2. Abra **Arquivos → Gerenciador de arquivos** e entre em `public_html`.
3. Para usar a raiz, envie ali `index.html` e a pasta `assets`. Para usar `/blog/`, crie `public_html/blog` e envie os mesmos arquivos para dentro dela. Envie também o arquivo oculto `.htaccess` se sua hospedagem usar Apache; ele não é necessário para os links relativos funcionarem.
4. Preserve a estrutura interna de `assets`. Não envie apenas o HTML.
5. Abra `https://meudominio.com/blog/` ou o endereço escolhido.
6. Confirme que a tela de login aparece sem avisos de configuração e que não há erros de arquivos ausentes.

Você pode manter o SQL e os manuais fora de `public_html`, guardados no seu computador. Eles são instruções de instalação, não recursos usados pela página. Se fizer upload do ZIP inteiro, extraia-o antes e confira a pasta correta; uma pasta extra pode resultar em `/blog/entre-nos/index.html` em vez de `/blog/`.

O site é estático: não precisa de PHP, servidor Node ou regras de reescrita de rotas. Navegação, estilos e arquivos usam caminhos relativos. Utilize HTTPS; não teste abrindo `index.html` diretamente com `file://`.

Para um teste local opcional, com Python instalado, abra o terminal na pasta que contém `index.html` e execute:

```sh
python3 -m http.server 8000
```

Abra `http://localhost:8000/`. Cadastre esse endereço exato como redirecionamento temporário no Supabase se quiser testar links de e-mail localmente. Não substitua o endereço público definitivo pela URL local.

## 6. Crie o primeiro administrador com segurança

Não existe botão público para se tornar administrador. Qualquer cadastro começa como membro pendente, mesmo se alguém tentar enviar um papel de administrador nos dados do cadastro.

1. No blog publicado, cadastre sua própria conta com seu nome, e-mail e uma senha exclusiva de pelo menos 10 caracteres.
2. Abra o e-mail de confirmação e confirme a conta.
3. Entre na conta. A mensagem de aprovação pendente é esperada.
4. No **SQL Editor do seu projeto**, execute o bloco abaixo depois de trocar **somente** o e-mail de exemplo pelo seu e-mail confirmado. Faça isso na sua própria conta do painel Supabase, nunca no console JavaScript do navegador.

```sql
DO $$
DECLARE
  v_email text := 'SUBSTITUA_PELO_SEU_EMAIL';
  v_id uuid;
  v_count integer;
BEGIN
  IF v_email = 'SUBSTITUA_PELO_SEU_EMAIL' THEN
    RAISE EXCEPTION 'Preencha o seu e-mail confirmado antes de executar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'Já existe um administrador. Este bloco é apenas para a configuração inicial.';
  END IF;

  SELECT count(*) INTO v_count
  FROM auth.users
  WHERE lower(email) = lower(btrim(v_email));

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Esperado exatamente um usuário para esse e-mail; encontrados %.', v_count;
  END IF;

  SELECT id INTO v_id
  FROM auth.users
  WHERE lower(email) = lower(btrim(v_email))
    AND email_confirmed_at IS NOT NULL;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'O e-mail ainda não foi confirmado.';
  END IF;

  UPDATE public.profiles
  SET role = 'admin', status = 'approved'
  WHERE id = v_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado. Verifique a instalação do schema.';
  END IF;

  RAISE NOTICE 'Administrador criado para o usuário %.', v_id;
END;
$$;
```

5. No blog, atualize o status ou saia e entre novamente. A área de administração ficará disponível.

O acesso ao SQL Editor concede poder administrativo real. Proteja sua conta Supabase com autenticação em duas etapas e nunca compartilhe credenciais do painel com os participantes. Se precisar de outro administrador ou recuperar acesso administrativo, faça a alteração deliberadamente pelo SQL Editor, verificando antes o UUID e o e-mail confirmado. Não crie uma função pública de promoção. Preserve pelo menos um administrador ativo.

A área de administração do blog aprova e suspende **membros**, mas não promove contas nem suspende administradores. Isso reduz o risco de bloquear a administração pelo próprio site.

## 7. Convide e use o diário

### Para os amigos

1. Acesse o endereço do blog e escolha o cadastro.
2. Informe nome, e-mail e senha. Confirme o e-mail recebido.
3. Aguarde sua aprovação. Uma conta pendente não pode ler publicações, fotos ou a lista privada de membros.
4. Após a aprovação, entre novamente ou use o botão de atualizar status.
5. Abra seu perfil para trocar o nome e a foto.
6. Use **Nova publicação**. Escreva texto, escolha fotos ou combine os dois. Confira as prévias e publique.
7. Toque em uma foto para ampliá-la. Use os controles da visualização para navegar e baixar.

O feed apresenta as publicações mais recentes primeiro. Cada participante pode editar e excluir suas próprias publicações. Exclusões exigem confirmação. As mensagens são renderizadas como texto: HTML enviado por alguém não é executado.

### Para o administrador

Abra a área de membros para aprovar novos participantes ou suspender contas. Confira o nome da pessoa antes de aprovar. Você também pode remover qualquer publicação. O administrador não precisa conhecer a senha de ninguém.

A suspensão passa a bloquear novas operações protegidas no banco e no Storage, inclusive com uma sessão ainda existente. Não depende apenas de esconder botões. Uma página que já carregou imagens ou um arquivo já baixado pode conservar cópias; nenhuma suspensão apaga arquivos que outra pessoa já recebeu.

## 8. Baixe fotos e álbuns

Cada foto tem **Baixar foto**, também disponível na visualização ampliada. A publicação oferece **Baixar todas as fotos desta publicação**, que reúne os originais em um ZIP. Todos os membros aprovados podem baixar as fotos às quais têm acesso, inclusive as de outros participantes.

O download busca o arquivo original do bucket privado usando a sessão autenticada. A miniatura não substitui o original: resolução, formato e bytes enviados são preservados. Nomes podem ser saneados para evitar caracteres problemáticos, mas o conteúdo do arquivo não é recomprimido. O ZIP usa armazenamento sem perda para os originais.

A interface mostra progresso e informa falhas. Mantenha a página aberta durante o processo. Um álbum de oito originais de 20 MiB pode chegar a cerca de 160 MiB, além da memória necessária para montar o ZIP; em celulares com pouca memória, prefira baixar individualmente. O sistema do celular pode abrir uma prévia ou pedir que você escolha **Salvar em Arquivos/Downloads**; isso depende do navegador.

Não torne os buckets públicos para facilitar downloads. Os endereços temporários usados na página são locais ao navegador; a obtenção dos bytes é autorizada no Storage. Um visitante sem login, pendente ou suspenso não recebe acesso aos originais pelo botão ou pela API. Naturalmente, participantes autorizados podem compartilhar um arquivo depois de baixá-lo; combine regras de privacidade com o grupo.

Para conferir preservação do original, compare o SHA-256 do arquivo enviado e do baixado. Os hashes devem ser iguais. A miniatura terá hash diferente por ser outro arquivo.

## 9. Senha, sessões e uso em vários dispositivos

Na tela de entrada, use **Esqueci minha senha** e informe o e-mail. Abra o link enviado e escolha a nova senha no blog. Links de recuperação e confirmação são temporários e podem ser usados uma única vez; peça outro se houver expiração. A mensagem de solicitação não confirma publicamente se uma conta existe.

Você pode entrar em aparelhos diferentes com a mesma conta. Publicações e fotos são lidas do Supabase, não do armazenamento do navegador. Apenas o estado da sessão de autenticação é mantido localmente pelo cliente Auth para continuar conectado. Use **Sair** em aparelhos compartilhados e proteja-os com senha.

## 10. Confira antes de convidar o grupo

O arquivo [TESTES.md](TESTES.md) descreve os testes executados na entrega. A validação da sua conta Supabase, SMTP e domínio precisa ser feita após a instalação; não é possível prometer entrega de e-mails sem testar sua configuração.

Faça este roteiro com **três contas reais** e navegadores ou perfis separados:

1. **Administrador:** crie e confirme a conta, execute o bootstrap e verifique a área de administração.
2. **Amigo A e amigo B:** cadastre e confirme ambos. Antes da aprovação, verifique que nenhum consegue ver publicações ou baixar imagens.
3. Aprove A e B. Publique texto simples, uma imagem sem texto e várias fotos com texto. Confira em outro dispositivo.
4. Cada amigo deve conseguir editar e excluir a própria publicação. Um amigo não deve conseguir editar ou excluir a publicação do outro, nem alterar o próprio `role` ou `status`, mesmo chamando diretamente a API.
5. Como administrador, remova uma publicação de teste e confira o resultado nos outros dispositivos.
6. Como B, baixe uma foto publicada por A, inclusive pela ampliação, e um ZIP completo. Confira a quantidade de arquivos, formato, dimensões e hashes dos originais.
7. Suspenda B mantendo a sessão dele aberta. Tente ler novamente publicações e buscar um original pelo Storage: o servidor deve negar novas operações. Teste também sem login e com uma conta ainda pendente.
8. Confira confirmação de e-mail, recuperação de senha, troca de nome/foto de perfil, saída e nova entrada.
9. Teste num celular e num computador, incluindo a instalação na subpasta `/blog/`.

Nos testes diretos, use somente a sessão de cada usuário e a chave publicável. A `service_role` contorna RLS e invalidaria a prova de isolamento. Não teste com a conta de serviço e conclua que as permissões dos membros estão corretas.

## 11. Problemas frequentes

| Sintoma | O que verificar |
| --- | --- |
| Aviso de configuração inicial | Preencha `assets/config.js`; confirme o caminho e recarregue a página. |
| “Invalid API key” ou erro de conexão | URL e chave publicável do mesmo projeto; HTTPS; projeto Supabase ativo; nenhuma chave secreta no site. |
| Cadastro ou recuperação não envia e-mail | Configuração SMTP, remetente autorizado, caixa de spam, logs do Auth e limites do provedor. |
| Link de e-mail abre o endereço errado | Site URL, Redirect URLs e a barra final de `/blog/`; peça um link novo após corrigir. |
| Conta confirmada continua pendente | O administrador precisa aprová-la; confirmar e-mail não aprova acesso. |
| Upload negado | Conta aprovada, schema completo, bucket privado correto, formato e limites de tamanho/cota. Não desligue RLS. |
| Foto HEIC recusada | Exporte como JPEG/PNG; não apenas renomeie a extensão. |
| Download ZIP falha no celular | Aguarde em primeiro plano, confira memória/espaço e tente fotos individuais ou conexão melhor. |
| Página sem estilo ou fontes | Envie toda a pasta `assets`, respeitando maiúsculas/minúsculas e estrutura. |
| Acesso negado após suspensão | Comportamento esperado; o administrador precisa aprovar novamente o membro. |

Abra o console do navegador apenas para diagnóstico e compartilhe mensagens de erro sem tokens, senhas ou dados privados. Para problemas do serviço, consulte também os logs de Auth, Database e Storage no Supabase.

## 12. Operação e manutenção

Guarde uma cópia do código, do SQL e da configuração pública. Configure backups do banco e dos arquivos conforme os recursos do seu plano: backup do banco não significa necessariamente backup dos bytes no Storage. Acompanhe espaço, tráfego e cotas do projeto; fotos e downloads consomem recursos. Ao atualizar o site, preserve `assets/config.js` com a configuração do seu projeto e teste o login antes de liberar para o grupo.

As políticas RLS devem permanecer habilitadas. A aprovação é consultada no banco, e não confiada a um campo de administrador enviado pelo navegador. Mantenha os buckets privados, a confirmação de e-mail e HTTPS em produção.

### Envio interrompido ou resposta perdida

Se a conexão cair enquanto o servidor salva, a página pode não saber se a operação foi concluída. Ela preserva os arquivos já enviados para evitar apagar uma foto que tenha sido publicada. Feche a edição e atualize o diário antes de repetir. Arquivos que ficaram sem publicação continuam privados (acessíveis apenas ao dono aprovado e ao administrador) e podem ser limpos no painel Storage depois de conferir os caminhos em `post_photos`. Ao excluir uma publicação, o registro é removido antes dos objetos; se a limpeza falhar, outros membros já perdem o acesso, e o administrador pode remover os arquivos residuais.
