# Lume: install and daily use

Part of #13. Plain-language steps for court staff. You never paste tokens, API keys, or
billing details. Sign-in happens only through the official browser flow started by Lume.

## Before you start

You need:

- Google Chrome version 116 or newer.
- Access to **PJe TRF1/SJDF first instance** (`pje1g.trf1.jus.br`) in the same browser, already
  signed in the usual way your court uses.
- A **ChatGPT account** that your organization allows for “Sign in with ChatGPT” in other apps.
  If IT has not approved this, stop and ask them first.
- The install folder from your IT team (`lume-install/`), not a random download.

Ten minutes is a **goal** for first setup, not a promise. Your first run may take longer.

## Install the extension

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** only if IT tells you to use an unpacked install. Managed installs
   skip this step.
3. Click **Load unpacked** and choose the `extension` folder inside `lume-install`.
4. Pin **Lume** to the toolbar if Chrome offers it.

Lume asks only for **side panel** permission. It does not read all tabs, cookies, or passwords.

## Install the companion

The companion is a small program on your computer. It completes Sign in with ChatGPT. Your IT
team places the files and the native messaging manifest (see the technical layout guide).

You do **not** configure OAuth client IDs, redirect URLs, or secrets. The companion creates
what it needs on first sign-in.

## Connect extension and companion

IT registers the companion with Chrome using the manifest in `lume-install/native-messaging/`.
After that, the Lume side panel shows whether the companion is reachable.

If the panel says the companion is missing, contact IT. Do not copy files into system folders
yourself unless IT documented that step for you.

## First sign-in

1. Open a **PJe** tab for a case you are allowed to work on.
2. Open the **Lume** side panel.
3. Click **Sign in** (or the equivalent button your build shows).
4. Chrome opens the **official OpenAI sign-in page**. Use your normal ChatGPT work login.
5. When the page finishes, return to PJe. The panel should show that you are signed in.

If sign-in fails with “plan not eligible” or “usage limit,” pause and try again later. Lume
does **not** offer a paid API key or credit card fallback.

## Open a case

With PJe open on the supported site, Lume reads the document list through your existing session.
It does not store your PJe password. Case notes stay on this computer in encrypted browser
storage until you delete them or they expire (see permissions guide).

## Update Lume

1. IT provides a new `lume-install` folder or triggers a managed update.
2. For unpacked installs: remove the old extension, load the new `extension` folder, and
   confirm the version in `RELEASE-PIN.txt` matches what IT announced.
3. IT updates the companion files if the release notes say so.
4. Sign in again only if the panel asks you to.

## Sign out and revoke access

1. In the Lume panel, choose **Sign out**.
2. Lume asks the companion to **revoke** the refresh token with the provider when the network
   allows, then deletes local tokens.
3. If revocation cannot be confirmed, local tokens are still removed, but IT may ask you to
   revoke the app in your ChatGPT account settings.

You do not paste tokens into the panel or a settings file.

## Remove case data

In the panel, use **Remove case** (or delete cases from the case list) for each matter you
finished. That erases encrypted local copies. Other open cases are not affected.

## Uninstall Lume

1. Sign out (previous section).
2. Remove all cases you no longer need.
3. In `chrome://extensions`, click **Remove** on Lume.
4. IT removes the companion binary and native messaging manifest when you return the machine
   or on request.

After uninstall, no Lume authorization should remain active. Local case blobs tied to the
extension profile are gone with the extension unless Chrome retained a profile backup outside
Lume’s control—IT handles profile wipes per policy.

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Panel empty on non-PJe pages | Normal. Open a supported PJe tab. |
| “Session expired” on PJe | Sign in to PJe again in that tab, then resume in Lume. |
| “Companion not found” | Ask IT to verify native messaging registration. |
| “Plan limit” / “Not eligible” | Wait or use an account IT approved; do not add API keys. |
| Layout error on PJe | Stop and report to IT; the page layout may have changed. |

For deeper technical detail, see `permissions-and-limits.md` and `companion/docs/auth-route.md`
in the repository (maintainers only).
