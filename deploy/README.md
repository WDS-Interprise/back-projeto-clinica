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
