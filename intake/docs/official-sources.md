# Official sources for real-case intake

Part of #3. Checked on 2026-11-09 against the official publishers.

This file records what each text says. It does not record an approval. No text below
is an institutional determination for Lume. The maintainer's personal authorization to
do this task is a different thing from an institutional determination, and it does not
replace one.

Each open item is a line that starts with `BLOCKER`. A blocker stays open until a
determination is cited in the register in `data-flow-matrix.md`.

## 1. CNJ Resolução nº 615, de 11/03/2025 (current CNJ text)

- Official page: https://atos.cnj.jus.br/atos/detalhar/6001
- Compiled text (after amendments): https://atos.cnj.jus.br/files/compilado1243232026032669c529ebd7bbb.pdf
- Source: DJe/CNJ n. 54/2025, 14/03/2025, p. 2-17. Status on the official page:
  "Alterado" by Resolução CNJ nº 674, de 25/03/2026. The amendment that we found
  changes the composition of the national AI committee. We did not find an amendment
  to art. 19 or art. 20.
- It revokes Resolução CNJ nº 332/2020. It came into force 120 days after publication
  (art. 47).

Scope (what the text says):

- Art. 19, caput: magistrates and servers can use generative AI and LLMs on the internet
  as tools for management support or decision support. They must obey information
  security rules.
- Art. 19 §1: use is preferably through access that the tribunal enables, supplies and
  monitors.
- Art. 19 §2: if the tribunal supplies no corporate solution, a private direct contract
  (a personal subscription) is possible, with the conditions of §3.
- Art. 19 §3:
  - I: training is mandatory.
  - II: use is auxiliary only. The magistrate keeps full responsibility.
  - III: the provider must not use the data to train models or for other unauthorized
    purposes.
  - IV: it is prohibited to use private or external LLMs to process, analyse, generate
    content from or support decisions with documents or data that are *sigilosos* or
    under *segredo de justiça*, "salvo quando devidamente anonimizados na origem ou
    quando forem adotados mecanismos técnicos e procedimentais que garantam a efetiva
    proteção e segurança desses dados e de seus titulares".
  - V: no private or external use for high-risk or excessive-risk purposes (arts. 10
    and 11, and the Annex).
- Art. 19 §6: generative AI use must be registered automatically in an internal system
  of the tribunal.
- Art. 19 §7: the magistrate or manager must tell the tribunal about the use of a market
  solution, "na forma do regulamento".
- Art. 20: rules for contracts that tribunals make (for example item IX: privacy by
  design and by default, including no storage of the prompt history; item V: no use with
  sigiloso data, except as art. 19 §3 IV permits).
- Art. 21: PJe systems that use AI must show the models in their interface and log the
  AI products.
- Art. 34: human supervision is mandatory. The magistrate can change any AI output.

Scope is not approval: art. 19 permits a category of use with conditions. It does not
approve Lume, a browser extension, a provider account or a data class.

- BLOCKER CNJ-1: no determination says whether the tribunal supplies a corporate
  solution (§1). Without it, we cannot say whether the private-subscription route of §2
  is available at all.
- BLOCKER CNJ-2: no determination says which "mecanismos técnicos e procedimentais"
  are sufficient under §3 IV, or which form of anonymization "na origem" is accepted.
  Until then, sigiloso and segredo-de-justiça data must not go to any provider.
  Pseudonymization and `store:false` alone do not establish permission (issue #3, item 4).
- BLOCKER CNJ-3: the regulation for the §7 communication and the §6 internal register
  is not identified. We do not know where and how the use must be reported.
- BLOCKER CNJ-4: no determination classifies the Lume use case (case-record summary and
  draft support) against the risk classes of arts. 10 and 11 and the Annex.

## 2. TRF1 Nota Técnica nº 02/2025 (Rede de Inteligência e Inovação da 1ª Região)

- Full text (PDF, 8 pages, read): https://www.trf1.jus.br/trf1/conteudo/Ascom%20TRF1/Nota%20T%C3%A9cnica.pdf
- CNJ news, 22/09/2025: https://www.cnj.jus.br/justica-federal-da-1a-regiao-publica-nota-tecnica-com-diretrizes-para-uso-da-ia/
- National follow-up: Nota Técnica nº 65/2026 of the Centro Nacional de Inteligência da
  Justiça Federal (read):
  https://slideshow.jfpe.jus.br/ArquivosSlideshow/uploads/noticias/24df58b3-246d-494e-a938-f4595e856317NT%2065-2026-uso%20IA%20nos%20TRFs%20(1).pdf

Scope (what the text says):

- It is guidance for individual users (magistrates and servers). It is not an act that
  authorizes a tool. Its conclusion says that compliance with Res. CNJ 615/2025 is the
  responsibility of each user.
- Axis I: training, careful prompts, knowledge of the tools. Use prompts from trusted
  sources (for example the Sinergia project).
- Axis II: commercial generative-AI platforms are possible under art. 19 of
  Res. 615/2025, but it repeats the express prohibition to insert sigiloso and
  segredo-de-justiça data that is not anonymized at the origin. The user is responsible
  for the anonymization and for checking that it is effective. High-risk and
  excessive-risk uses are prohibited.
- Axis III: individual responsibility and mandatory human review of all AI output.
- Section VII: the TRF1 adopted an institutional strategy to use market tools,
  "incluindo ChatGPT, Google Gemini, Google NotebookLM, Microsoft Copilot e Anthropic
  Claude", instead of building its own solutions.
- NT 65/2026 recommends: do not put personal data or confidential information in
  prompts to external generative-AI tools.

Scope is not approval: section VII names ChatGPT as part of a strategy. It does not say
which account type (personal subscription or corporate), which data classes, or whether
a third-party browser extension can read PJe and send content to it.

- BLOCKER NT-1: the NT does not say whether "opção institucional" means a corporate
  account that the tribunal supplies (art. 19 §1) or personal subscriptions (§2). The
  Lume route uses the maintainer's ChatGPT subscription (#1). This needs a determination.
- BLOCKER NT-2: the NT does not cover automated reading of PJe by a browser extension or
  automated insertion into the PJe editor.

## 3. Resolução Presi 18/2026 (TRF1)

- Full text: NOT FOUND AND NOT READ. The DSpace search of the TRF1 portal
  (portal.trf1.jus.br/dspace) returned HTTP 403 to our requests.
- What we know comes from the preamble of Portaria Diges 467/2026 (section 4): Res.
  Presi 18/2026 "dispõe sobre medidas de proteção da disponibilidade, estabilidade,
  integridade e segurança dos sistemas judiciais eletrônicos da Justiça Federal da 1ª
  Região". It permits limitation, suspension and blocking of access. Its art. 11 gives
  the Diretora-Geral the power to set the technical parameters.
- It is not an AI rule. It is a rule on use of the electronic judicial systems.
- Identity note: a search result also showed an unrelated "Portaria 18/2026" of a
  first-instance unit. That is a different act.

- BLOCKER PRESI-1: the full text is not read. We cannot confirm its exact obligations,
  its exceptions, or whether a user tool that reads the case record through the human
  interface is permitted.

## 4. Portaria Diges 467/2026 (TRF1)

- Full text (PDF, 4 pages, read):
  https://portal.trf1.jus.br/dspace/bitstream/123/426281/1/Portaria%20Diges%20467%20-%20Estabelece%20par%C3%A2metros%20t%C3%A9cnicos%20para%20identifica%C3%A7%C3%A3o%20de%20comportamento%20inaut%C3%AAntico%20dos%20recursos%20computacionais.pdf
- Signed on 22/07/2026. In force on publication (art. 10).

Scope (what the text says):

- Art. 1: technical parameters to identify inauthentic behaviour, excessive or abusive
  use of computing resources, and use that is incompatible with the purpose of the human
  interface of the electronic judicial systems. The parameters are indicative (sole
  paragraph).
- Art. 2, I (quantitative): case queries, document downloads, and queries to cases
  without a procedural link, above limits that the tribunal sets.
- Art. 2, II (behavioural): requests at a frequency incompatible with ordinary human use;
  multiple simultaneous sessions or automated operations with the same credential; use of
  the human interface for tasks that institutional interoperability can do.
- Art. 2, III (indicators of automation or fraud): "utilização de scripts, robôs,
  aplicações ou mecanismos automatizados de consulta, monitoramento ou extração de
  dados"; techniques that bypass authentication, access control, monitoring or limits.
- Art. 2 §1: the quantitative limits are in a technical act of the Secin, published in
  the Processo Eletrônico section of the portal. They can change at any time.
- Art. 2 §3: exceeding a parameter does not automatically cause a block.
- Arts. 3 to 6: the Secin tells the user about a limitation, suspension or block. The
  user can ask for restoration with a justification and explanations about automated
  tools and credential sharing.

Scope is not approval: this act does not prohibit Lume by name, and it does not approve
it. A Lume extension that reads a long record (1,000 pages or more) through the user's
session is close to art. 2, II "a" and III "a".

- BLOCKER DIGES-1: the Secin technical act with the quantitative limits (art. 2 §1) is
  not read. We do not know the download and query limits.
- BLOCKER DIGES-2: no determination says whether user-initiated reading of one open case
  by an extension counts as an "aplicação ou mecanismo automatizado de extração de
  dados". Automated local reading of real PJe records must wait for this determination.
- BLOCKER DIGES-3: no determination says whether an institutional interoperability
  route (art. 2, II "c") must be used instead of the human interface.

## 5. Missing institutional determinations (issue #3, item 3)

None of these exists in the repository. Each one is a blocker that needs the
institution, not the maintainer alone:

- BLOCKER INST-1: live PJe automation (reading and editor insertion) on TRF1/SJDF.
- BLOCKER INST-2: data classes that may be read, sent, retained and inserted (see the
  matrix).
- BLOCKER INST-3: provider and account (corporate or personal subscription; training
  opt-out under art. 19 §3 III).
- BLOCKER INST-4: retention: where, for how long, and who deletes local copies, caches,
  annotations and provider history.
- BLOCKER INST-5: workstation use: installation of an unlisted Chrome extension on the
  work computer.

Until these determinations exist, every real-case cell in the matrix stays "not
permitted until determined", and the real-case manifest stays private and local.
