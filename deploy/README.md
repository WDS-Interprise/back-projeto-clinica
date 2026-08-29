# Operação do PM2 na VPS

## Proibido (não negociar)

- **fnm**, `fnm_multishells`, `/run/user/`, `~/.fnm`, `~/.local/share/fnm` no PM2 ou no systemd
- Remover `interpreter` / `env_file` do `ecosystem.config.cjs`
- Healthcheck que aceita 404 em `/` como “API ok”
- Deploy sem job `verify` e sem `validate-pm2-registration.cjs`
- “Simplificar” o `.github/workflows/deploy.yml` para um script curto com `PATH` preferindo fnm

Em ago/2026 o commit `a376cee` fez exatamente isso e a API ficou em **502** (`api.clinmax.com.br`).
O contrato endurecido (nvm permanente + env + ready/health) **precisa existir**.

Este procedimento elimina referências ao fnm no PM2 e no serviço de inicialização do Ubuntu.
Ele deve ser executado uma vez antes do primeiro deploy com o workflow endurecido.

O reinício de `pm2-root.service` afeta todos os apps registrados no PM2. Faça a mudança em
uma janela de manutenção e confirme antes que `pm2 save` contém todos os apps esperados.

## Contrato atual

- Node: `24.15.0`
- Instalação: nvm em `$HOME/.nvm`
- API: `$HOME/clinmax-api/dist/index.js`
- Porta: `3550`
- Serviço esperado para o usuário root: `pm2-root.service`
- Ecosystem: `interpreter` via `resolvePermanentNvmNode()` + `env_file: ".env"`

O deploy **migra automaticamente** a unit `pm2-*.service` de fnm → nvm permanente
(`unstartup` + `startup` com o Node do nvm) antes de apagar arquivos. Se a migração
falhar e a unit ainda tiver fnm/`/run/user/`, o deploy aborta.

## 1. Selecionar o Node permanente

Entre na VPS com o mesmo usuário que executa o PM2. Na instalação atual, esse usuário é
`root`.

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"

NODE_VERSION=24.15.0
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"

NODE_BIN="$(node -p 'process.execPath')"
NODE_BIN_DIR="$(dirname "$NODE_BIN")"
test "$NODE_BIN" = "$HOME/.nvm/versions/node/$NODE_VERSION/bin/node"
```

O último comando precisa terminar sem erro. Um caminho com `fnm_multishells` ou
`/run/user/` não serve.

## 2. Instalar e chamar o PM2 pelo mesmo Node

```bash
npm install -g pm2

PM2_CLI="$(npm root -g)/pm2/bin/pm2"
test "$PM2_CLI" = \
  "$(dirname "$(dirname "$NODE_BIN")")/lib/node_modules/pm2/bin/pm2"

pm2_nvm() {
  "$NODE_BIN" "$PM2_CLI" "$@"
}

pm2_nvm list
```

Não use o comando `pm2` encontrado numa sessão do fnm. Os comandos deste runbook usam
explicitamente o Node e o CLI permanentes.

## 3. Fazer backup do estado atual

```bash
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/pm2-backup-$STAMP"
SERVICE="pm2-$(id -un)"

mkdir -p "$BACKUP_DIR"
pm2_nvm jlist > "$BACKUP_DIR/jlist.json"
test -f "$HOME/.pm2/dump.pm2" &&
  cp "$HOME/.pm2/dump.pm2" "$BACKUP_DIR/dump.pm2"
systemctl cat "$SERVICE.service" > "$BACKUP_DIR/$SERVICE.service.txt" 2>/dev/null || true

pm2_nvm list
```

Confirme que todos os apps esperados aparecem antes de continuar.

## 4. Corrigir o registro da clinmax-api, se necessário

Veja o registro atual:

```bash
pm2_nvm describe clinmax-api
```

O interpreter precisa ser exatamente:

```text
/root/.nvm/versions/node/v24.15.0/bin/node
```

O script precisa terminar em `/clinmax-api/dist/index.js` e o PID precisa ser um número
maior que zero. Se qualquer item estiver incorreto, recrie somente a `clinmax-api`:

```bash
cd "$HOME/clinmax-api"
set -a
. ./.env
set +a

pm2_nvm delete clinmax-api || true
pm2_nvm start "$PWD/dist/index.js" \
  --name clinmax-api \
  --cwd "$PWD" \
  --interpreter "$NODE_BIN"
pm2_nvm reset clinmax-api
pm2_nvm save
```

## 5. Regenerar o serviço systemd

Salve a lista antes de substituir a unit:

```bash
pm2_nvm save
pm2_nvm unstartup systemd
pm2_nvm startup systemd -u "$(id -un)" --hp "$HOME"
```

Se o PM2 imprimir um comando adicional com `sudo`, execute exatamente o comando
impresso. Depois:

```bash
SERVICE="pm2-$(id -un)"
systemctl daemon-reload
systemctl enable "$SERVICE.service"
systemctl restart "$SERVICE.service"
```

## 6. Validar a unit e os processos

Primeiro valide o systemd, antes de chamar novamente o CLI do PM2:

```bash
systemctl is-enabled "$SERVICE.service"
systemctl is-active "$SERVICE.service"
systemctl cat "$SERVICE.service"
```

O resultado de `systemctl cat` precisa conter:

```text
/root/.nvm/versions/node/v24.15.0/
```

Ele não pode conter nenhum destes valores:

```text
fnm_multishells
/run/user/
/.fnm/
/.local/share/fnm
```

Valide a API:

```bash
pm2_nvm describe clinmax-api
pm2_nvm save

ss -tlnp | grep ':3550'
curl -fsS http://127.0.0.1:3550/api/health
curl -fsS http://127.0.0.1:3550/api/ready
```

As respostas esperadas contêm `status: ok` e `status: ready`, com `db: true`.

## Postgres ClinMax (porta 5435)

Na VPS o container `clinmax_postgres` publica **127.0.0.1:5435→5432**.
`DATABASE_URL` de produção deve usar essa porta (ver `.env.production.example`).

## Prisma migrate em produção (P3005 / P3018)

O banco de prod veio da era `db push` (schema parcial, sem `_prisma_migrations`).
`prisma migrate deploy` puro pode falhar com:

- **P3005** — schema não vazio, sem histórico → baseline
- **P3018** — migration `clinical_core_hardening` falhou (ex.: `Encounter` ausente)

O deploy chama `node scripts/prod-migrate.cjs` (não `migrate deploy` solto): baseline seletivo,
limpa FAILED com `resolve --rolled-back`, depois `migrate deploy`. **Sem** `db push` / sqlite.

### SQL via docker (não use `psql "$DATABASE_URL"` com `?schema=public`)

O client `psql` local rejeita o query param `schema`. Use:

```bash
docker exec -i clinmax_postgres psql -U clinmax -d clinmax
```

### Recover SSH rápido (migration FAILED)

```bash
cd ~/clinmax-api
set -a; . ./.env; set +a
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24.15.0

npx prisma migrate resolve --rolled-back 20260825010000_clinical_core_hardening
npm run db:prod-migrate
# ou, apos o Action publicar o codigo novo:
# npx prisma migrate deploy

curl -fsS http://127.0.0.1:3550/api/health; echo
curl -fsS http://127.0.0.1:3550/api/ready; echo
```

Caminho permanente: merge `develop` → `main` (Action de deploy). Não depender de remendo eterno na VPS.

### `.env` na VPS (preservado entre deploys)

O `.env` da VPS (`~/clinmax-api/.env`) **é preservado** em cada Action: o deploy faz
backup antes do `rm -rf` e restaura depois do extract. `DOTENV_FILE` (GitHub Environment
Production) **só semeia** na primeira instalação (quando ainda não há `.env` na VPS).
Para rotacionar secrets, edite o `.env` na VPS ou substitua deliberadamente — não
dependa de reescrever via `DOTENV_FILE` em todo push.

### PM2 `env_file` e aspas

O ecosystem usa `env_file: ".env"`. Valores com aspas (`DATABASE_URL="postgresql://..."`)
podem fazer o PM2 entregar a aspas como parte da senha → Prisma `Authentication failed`.
O deploy reescreve o `.env` **sem aspas externas**. Na first install, prefira no GitHub
`DOTENV_FILE` sem aspas:

```text
DATABASE_URL=postgresql://clinmax:SENHA@127.0.0.1:5435/clinmax?schema=public
```

### Sincronizar senha Postgres ↔ `.env` (sem precisar da senha antiga)

`POSTGRES_PASSWORD` no compose só vale na **primeira** criação do volume. Se o volume já
existe, alinhe o user à senha do `.env` (ou o contrário).

```bash
# Ver senha com que o container foi iniciado (pode diferir do volume antigo)
docker exec clinmax_postgres printenv POSTGRES_PASSWORD POSTGRES_USER POSTGRES_DB

# Extrair senha do .env da API (não cole em chat/logs públicos)
# DATABASE_URL=postgresql://USER:SENHA@127.0.0.1:5435/DB
grep '^DATABASE_URL=' ~/clinmax-api/.env

# Opção A — resetar senha DENTRO do Postgres para bater com o .env
# (troque SENHA_DO_ENV pela senha da DATABASE_URL; caracteres especiais: use $$ ou dollar-quoting)
docker exec -it clinmax_postgres \
  psql -U clinmax -d clinmax \
  -c "ALTER USER clinmax WITH PASSWORD 'SENHA_DO_ENV';"

# Opção B — se a senha do volume for a do printenv e o .env estiver errado,
# atualize DATABASE_URL no .env / DOTENV_FILE e reinicie:
#   pm2 restart clinmax-api --update-env

# Conferir
curl -fsS http://127.0.0.1:3550/api/ready
```

## 7. Testar um reboot planejado

Faça este passo somente dentro da janela de manutenção:

```bash
reboot
```

Depois de reconectar, valide o systemd antes de executar qualquer comando PM2:

```bash
SERVICE="pm2-$(id -un)"
systemctl is-enabled "$SERVICE.service"
systemctl is-active "$SERVICE.service"
systemctl cat "$SERVICE.service"

ss -tlnp | grep ':3550'
curl -fsS http://127.0.0.1:3550/api/health
curl -fsS http://127.0.0.1:3550/api/ready
```

Quando o novo deploy estiver publicado, `.github/workflows/deploy.yml` repetirá
automaticamente as verificações do Node, da unit, do processo vivo, da readiness e do
`dump.pm2`.

## Atualização futura do Node

Ao trocar a versão do Node:

1. Atualize `NODE_VERSION` em `.github/workflows/deploy.yml`.
2. Instale a nova versão com nvm e reinstale o PM2 nela.
3. Execute novamente `pm2 unstartup` e `pm2 startup`.
4. Salve a lista e repita as validações desta página.

Não atualize somente o symlink do Node. A unit do systemd precisa ser regenerada porque
ela guarda caminhos absolutos.

## Schema drift (login 500 / Plan / aiMode)

Se o Postgres veio da era `db push` e o historico Prisma esta incompleto, a API pode
ficar `ready` com `db:true` mas falhar no seed (`Plan` inexistente), no scheduler
(`ClinicWhatsappSettings.aiMode`) e no login (colunas do `User`/relacoes fora do sync).

### Desbloqueio ASAP (nao destrutivo)

**Nao use** `--force-reset` / `--accept-data-loss` sem backup e ordem explicita.

```bash
cd ~/clinmax-api
set -a && . ./.env && set +a
# Confirme Postgres (nao sqlite):
echo "$DATABASE_URL" | head -c 40
npx prisma db push
pm2 restart clinmax-api --update-env
sleep 5
curl -fsS http://127.0.0.1:3550/api/health
curl -fsS http://127.0.0.1:3550/api/ready
```

Caminho permanente: migrations em `prisma/migrations/` (incl. `20260829030000_saas_plan_whatsapp_ai_prod`)
via deploy GitHub / `npm run prod:migrate` (ou `node scripts/prod-migrate.cjs`).
