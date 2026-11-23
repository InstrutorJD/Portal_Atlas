# Portal Atlas

O Portal Atlas oferece acesso ao simulador ENEM integrado à área de estudos.

## Estrutura atual

- `portal/` — páginas do Portal Atlas e assets web do sistema principal
- `simulador/` — experiência de prova e lógica do simulador ENEM
- `dados/` — provas, gabaritos, banco SQL e arquivos de dados locais
- `assets/` — imagens e materiais auxiliares
- `docs/` — documentação, relatórios e scripts de testes

## Como usar

1. Abra o projeto a partir da raiz com um servidor HTTP local, por exemplo:
   `python3 -m http.server`
2. Acesse a página inicial do portal em:
   `http://localhost:8000/`
3. Entre pelo login do Portal Atlas em `portal/index.html`.
4. No painel do aluno, escolha **Simulado ENEM** para abrir a prova.

## Acesso de demonstração

- E-mail: `aluno@atlas.com`
- Senha: `Teste@1234`

## Observação sobre os dados

Os dados de provas e gabaritos foram movidos para:

- `dados/provas/`
- `dados/gabaritos/`

Fonte oficial da INEP:
https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos

O simulador usa a sessão de aluno do Portal Atlas, carrega questões e gabaritos locais das provas disponíveis e oferece três modalidades: Treino Rápido (30 min, 7 questões), Treino (2 h, 30 questões) e Prática Real (6 h, 90 questões). As questões são divididas de forma equilibrada entre Linguagens, Ciências Humanas, Ciências da Natureza e Matemática; a divisão é exibida antes de iniciar. Se faltar questão em uma área, o algoritmo redistribui as vagas entre as áreas disponíveis. Para uma prova completa, reserve no mínimo 4 horas. O resultado apresenta acertos, erros e questões em branco; não é uma nota TRI oficial do ENEM.

## Manutenção do banco de questões

Os arquivos `dados/provas/prova-AAAA` seguem um formato padronizado (descrito em `simulador/parser.js`). Ferramentas, executadas com Node a partir da raiz:

- `node dados/ferramentas/normalizar-provas.js [ano] [--dry-run] [--verbose]`: padroniza cabeçalhos, marcações de imagem, opções de língua e remove duplicatas. Rode depois de colar uma prova nova.
- `node dados/ferramentas/gerar-indice-imagens.js`: atualiza `assets/imagens/indice.json`. Rode sempre que adicionar imagens (`AAAA-questao-NN.png`, ou `-ingles`/`-espanhol` nas questões de língua estrangeira).
- `node dados/ferramentas/verificar-banco.js [--detalhes]`: mostra quantas questões de cada ano entram no simulador e por que as demais foram descartadas.

Questões marcadas com `(tem imagem)` só entram no simulado se a imagem correspondente existir no índice. Questões cujas alternativas são imagens ficam de fora.

## Resultados dos simulados

Cada resultado é salvo no navegador do aluno (`localStorage`) e, quando o Supabase está configurado, também na tabela `simulado_resultados`. A tabela já faz parte de `dados/banco.sql` para instalações novas. O histórico dos últimos simulados aparece na tela de configuração da prova.

## Atualizar um Supabase já existente

Cole `dados/atualizacao_supabase.sql` inteiro no SQL Editor do Supabase e execute. O script pode ser rodado mais de uma vez e é aplicado por inteiro ou não é aplicado. Ele:

- cria a tabela `simulado_resultados`;
- faz o banco recusar inscrições acima do limite de vagas (tutoria, eletiva e clubinho), entradas em clubinhos expirados e períodos com data de fim anterior à de início, e permite um tutor por aluno por ano letivo;
- cria os perfis das contas de teste (`aluno@`, `professor@` e `coordenador@atlas.com`) e liga o `auth_id` de cada perfil ao usuário do Authentication pelo e-mail.

No fim, o script mostra cada usuário do Authentication e o perfil ligado a ele.
