# Pendências — Portal Atlas

Registrado em 23/11/2026, a partir de testes no portal ligado ao Supabase.

## Principais

- [x] **Professor não consegue propor eletiva, e a tela diz que conseguiu.**
  A função `submitEletiva` em `portal/professor.js` (linha 109) tem o mesmo nome da função que grava no banco (`portal/supabase.js`). Ela chama a si mesma sem parar e dá erro. Mesmo assim aparece a mensagem verde "Eletiva enviada para aprovação!", e nada vai para o banco. Por isso também não deu para testar a aprovação de eletiva pelo coordenador.
  *Correção:* renomear a função do `professor.js`, por exemplo para `enviarEletiva`.

- [x] **Aluno não consegue trocar de eletiva.**
  Dá "Erro ao se inscrever". O sistema sempre tenta criar uma inscrição nova, mas o banco só aceita uma eletiva por aluno por ano. A tela diz "Você pode alterar enquanto o período estiver aberto", o que é falso. A tutoria faz certo: atualiza o registro quando ele já existe.

- [ ] **Aluno não consegue trocar de clubinho.**
  Mesmo problema da eletiva: dá "Erro ao entrar no clubinho".

- [x] **Quem cria um clubinho não entra nele.**
  A inscrição do líder como membro falha, e nenhum erro aparece. Resultado: Pedro é líder do clubinho de teste, mas continua no Clube de Leitura, e o clubinho dele mostra 10 de 10 vagas livres.

## Outros problemas

- [ ] O Clube de Leitura mostra "11 vagas", acima do limite de 10.
- [ ] O Clube de Xadrez venceu em 31/08/2025, mas continua aparecendo e aceitando entrada. Nele aparece "Líder: —".
- [ ] O Clube de Leitura também já venceu (31/08/2026) e continua ativo.
- [ ] Erro de texto: "vagas disponívelis".
- [ ] Depois de aprovar um clubinho, não há como reprovar.

## Da rodada anterior (ainda abertas)

- [ ] Frações quebradas no simulado.
- [x] "TEM FOTO" aparecendo no simulado.
- [ ] Botão sobrepondo o texto no card do Simulado.
- [ ] Esc não fecha os modais.
- [x] Checkboxes desalinhados em Tutores.
