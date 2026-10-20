-- Execute SOMENTE no SQL Editor do seu projeto Supabase, depois de cadastrar
-- sua conta no blog e confirmar o e-mail. Nunca execute isto no navegador.
-- Troque SOMENTE o valor da variável v_email abaixo pelo SEU e-mail confirmado.
-- Este arquivo não contém senha nem chave secreta e não cria função pública.
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
