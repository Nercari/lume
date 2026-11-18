# Diagnóstico de disponibilidade

Distinguir: plugin listado, instruções carregadas, versão publicada, ferramentas disponíveis e autos acessíveis. Testar somente a camada que falhou, respeitando permissões. Se a fonte publicada mudou mas o carregador devolve texto antigo, registrar divergência; não reinstalar nem afirmar ativação automática. O acesso a uma referência do plugin não comprova execução dos módulos. A ausência de servidor MCP próprio é esperada.

A seção de carregamento do SKILL.md orienta recuperação depois da seleção. Não garante que o host selecione o plugin. Testar acionamento implícito em sessão nova; instrução geral do usuário pode encaminhar pedidos processuais ao Lume, sem substituir o carregamento real.
