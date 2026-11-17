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
