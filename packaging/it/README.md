# Lume — implantacao em estacao gerenciada (TI)

Part of #13. **English summary below.**

Quando o **Modo do desenvolvedor** do Chrome e bloqueado por politica, use as politicas corporativas do Google Chrome (e equivalentes no Microsoft Edge Chromium). Este pacote **nao inclui chave privada** de extensao; o mantenedor gera o `.crx` fora do repositorio.

## Caminho A — extensao auto-instalada (policy `ExtensionInstallForcelist`)

| Policy Chrome | Uso neste pacote |
|---------------|------------------|
| **ExtensionInstallForcelist** | Entrada `EXTENSION_ID;https://SEU_SERVIDOR/lume/update.xml` para forcar a extensao com ID fixo `odjfiioakpihgkikmjadmohgckkhkjhi`. *(Nao verificado em maquina gerenciada real neste PR.)* |
| **ExtensionSettings** | Bloco JSON por ID com `installation_mode: force_installed` e `update_url` apontando para o XML interno. *(Nao verificado em maquina gerenciada real.)* |

O `update.xml` e o `.crx` sao publicados em servidor HTTPS interno pelo mantenedor. Substitua `SEU_SERVIDOR` nos exemplos.

## Caminho B — lista de permissao + nota para equipe (policy `ExtensionInstallAllowlist`)

| Policy Chrome | Uso |
|---------------|-----|
| **ExtensionInstallAllowlist** | Permite instalar somente o ID `odjfiioakpihgkikmjadmohgckkhkjhi`. *(Nao verificado em maquina gerenciada real.)* |
| **DeveloperToolsAvailability** | Valor `0` bloqueia DevTools; **nao** desbloqueia modo desenvolvedor sozinho. Documente para a equipe que este caminho **nao** substitui o Forcelist se o modo desenvolvedor estiver proibido. *(Nao verificado.)* |

## Native Messaging (companion `com.lume.chatgpt`)

| Policy Chrome | Uso |
|---------------|-----|
| **NativeMessagingUserLevelHosts** | Habilita hosts registrados em HKCU / perfil do usuario (alinhado ao `instalar.ps1`). *(Nao verificado.)* |
| **NativeMessagingAllowlist** | Lista `com.lume.chatgpt` para permitir o host do Lume. *(Nao verificado.)* |

Arquivos de amostra: `sample-policies.json` (GPO/Cloud) e `sample-chrome-hkcu.reg` (registro de exemplo para o manifest — ajuste caminhos).

## Microsoft Edge

Politicas equivalentes existem com prefixos `Edge` nos templates ADMX. Este PR documenta apenas os nomes **Chrome Enterprise** acima; valide no Edge com a equipe de identidade.

---

## English

Use `ExtensionInstallForcelist` or `ExtensionSettings` with an internal `update_url` and maintainer-built CRX (no private key in repo). Allow the native host with `NativeMessagingAllowlist` = `com.lume.chatgpt` and enable user-level hosts with `NativeMessagingUserLevelHosts`. Sample files are placeholders; policies marked **not verified** on a live managed machine in this PR.
