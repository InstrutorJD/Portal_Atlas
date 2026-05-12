const APP_STATE = {
    config:{
        coordenacaoLiberou: true,
        vagasEletivas: true
    },
    aluno:{
        nome:"João Silva",
        eletivaId: null,
        tutorId: null
    },
    eletivas: [
        {id:1, nome:"Desenvolvimento de Games", desc:"Descrição da eletiva 1", vagas:10},
        {id:2, nome:"Inteligência Artificial", desc:"Descrição da eletiva 2", vagas:15},
        {id:3, nome:"Fotografia Digital", desc:"Descrição da eletiva 3", vagas:12}
    ],
    tutores:[
        {id:1, nome:"Prof. Carlos"},
        {id:2, nome:"Prof. Ana"},
        {id:3, nome:"Prof. Maria"}
    ],
    clubinhos:[
        {id:1, nome:"Clubinho de Robótica", desc:"Descrição do clubinho 1", status: "aprovado"},
        {id:2, nome:"Clubinho de Programação", desc:"Descrição do clubinho 2", status: "pendente"},
        {id:3, nome:"Clubinho de Artes", desc:"Descrição do clubinho 3", status: "pendente"}
    ]
};

function abrirModal(tipo){
    const modal = document.getElementById('modal-container');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
}