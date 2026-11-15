# Retomada por processo

Em tarefa longa ou lote, salvar estado somente no destino de arquivos autorizado para a tarefa, com um arquivo por processo e índice do lote sem cópia dos autos. Usar conector do ambiente; local scratch sozinho não é persistência durável. Nunca guardar dados de casos no plugin ou perfil pessoal.

Estado mínimo: schema lume-checkpoint/1, case_id, version inteira crescente, source_revisions (mapa de identidade para versão/hash), stage, pending (lista), completed (lista), profile_ref (identidade/versão), draft_ref (última versão), result_instruction (orientação atual). Campos factuais adicionais ficam no mesmo arquivo do caso e não em registro global.

Na retomada, conferir alvo e revisões das fontes antes de reutilizar conclusões; fonte alterada marca estado obsoleto e exige reavaliar etapas afetadas. Preservar pendências e últimas edições. Não tratar checkpoint como prova originária. Nunca retomar caso só por nome semelhante.

O comando checkpoint de lume_check.py compara case_id/version com arquivo existente e grava atomica e localmente sob trava. Não sincroniza serviço remoto: a persistência usa o conector de arquivos, com proteção contra versão concorrente. Sem acesso de escrita, manter estado na conversa e declarar o limite. Não prometer retomada persistente sem salvamento observado.
