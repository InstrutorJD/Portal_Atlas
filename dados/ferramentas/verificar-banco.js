#!/usr/bin/env node
// =============================================
// Mostra quantas questões de cada prova o simulador consegue usar,
// usando o mesmo parser do navegador (simulador/parser.js).
//
// Uso: node dados/ferramentas/verificar-banco.js [--detalhes]
//   --detalhes  lista cada questão descartada e o motivo
// Termina com código 1 se alguma prova com gabarito não gerar nenhuma questão.
// =============================================

const fs = require("fs");
const path = require("path");
const { parseAnswerKey, parseChoices, parseQuestionFile, QUESTION_AREAS } = require("../../simulador/parser.js");

const ROOT = path.join(__dirname, "..", "..");
const details = process.argv.includes("--detalhes");
const imagesIndex = path.join(ROOT, "assets", "imagens", "indice.json");
const images = new Set(fs.existsSync(imagesIndex) ? JSON.parse(fs.readFileSync(imagesIndex, "utf8")) : []);

const years = fs.readdirSync(path.join(ROOT, "dados", "provas"))
	.map((name) => name.match(/^prova-(\d{4})$/)?.[1])
	.filter(Boolean)
	.map(Number)
	.sort();

let failed = false;
const totals = { questions: 0, withImage: 0 };
years.forEach((year) => {
	const exam = fs.readFileSync(path.join(ROOT, "dados", "provas", `prova-${year}`), "utf8");
	const keyFile = path.join(ROOT, "dados", "gabaritos", `gabarito-${year}`);
	const key = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, "utf8") : "";
	if (!exam.trim() || !key.trim()) {
		console.log(`${year}: ${!exam.trim() ? "prova" : "gabarito"} vazio — fora do simulador`);
		return;
	}
	const skipped = [];
	const questions = parseQuestionFile(exam, year, parseAnswerKey(key), {
		images,
		onSkip: (reason, info) => skipped.push({ reason, ...info }),
	});
	const byArea = QUESTION_AREAS.map((area) => `${area}: ${questions.filter((q) => q.area === area).length}`).join(" · ");
	const withImage = questions.filter((q) => q.image).length;
	totals.questions += questions.length;
	totals.withImage += withImage;
	console.log(`${year}: ${questions.length} questões (${withImage} com imagem) — ${byArea}`);

	const reasons = new Map();
	skipped.forEach(({ reason }) => {
		const label = reason.replace(/ \(.*\)$/, "");
		reasons.set(label, (reasons.get(label) || 0) + 1);
	});
	if (reasons.size) console.log(`      descartadas: ${[...reasons].map(([reason, count]) => `${count} ${reason}`).join("; ")}`);
	if (details) {
		skipped.forEach(({ reason, number, language }) => console.log(`      - Q${number}${language ? ` (${language})` : ""}: ${reason}`));
	}
	if (!questions.length) failed = true;

	const problems = findMixedContent(exam, questions);
	problems.forEach((problem) => console.log(`      MISTURA Q${problem.number}${problem.letter ? ` [${problem.letter}]` : ""}: ${problem.reason}`));
	totals.mixed = (totals.mixed || 0) + problems.length;
});

// Procura conteúdo de uma questão vazando para outra: alternativas que carregam
// o enunciado/cabeçalho da seguinte, rodapés do PDF, ou enunciados que contêm
// uma segunda lista completa de alternativas A–E (questão sem cabeçalho).
function findMixedContent(exam, questions) {
	const simplify = (value) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, " ").trim();
	const headers = [...exam.matchAll(/^QUESTÃO (\d{1,3}).*$/gm)];
	const blocks = headers.map((header, index) => ({
		number: Number(header[1]),
		lines: exam.slice(header.index + header[0].length, headers[index + 1]?.index ?? exam.length).split(/\r?\n/),
	}));
	const signatures = blocks.flatMap((block) => block.lines.map(simplify)
		.filter((line) => line.length >= 35).map((line) => ({ number: block.number, line })));
	const problems = [];

	questions.forEach((question) => {
		const lengths = question.choices.map((choice) => choice.text.length).sort((a, b) => a - b);
		question.choices.forEach((choice) => {
			const add = (reason) => problems.push({ number: question.number, letter: choice.letter, reason });
			if (/QUES+T[ÃA]O\s*\d|INSTRU[ÇC][ÕO]ES\s+PARA|\*\d{6}[A-Z]{2}\d+\*|\d\s*[º°]\s*dia\s*\|/iu.test(choice.text)) {
				add(`marcador de cabeçalho/rodapé na alternativa: "${choice.text.slice(0, 60)}…"`);
			}
			if (choice.text.length > 250 && choice.text.length > 3 * lengths[2]) {
				add(`alternativa muito mais longa que as outras (${choice.text.length} caracteres)`);
			}
			const simple = simplify(choice.text);
			const foreign = signatures.find((signature) => signature.number !== question.number && simple.includes(signature.line));
			if (foreign) add(`contém texto da questão ${foreign.number}: "${foreign.line.slice(0, 50)}…"`);
		});
	});

	blocks.forEach((block) => {
		const parsed = parseChoices(block.lines);
		if (!parsed) return;
		let expected = 0;
		block.lines.slice(0, parsed.firstChoiceIndex).forEach((line) => {
			const letter = line.match(/^\s*([A-E])(?:[.)]\s*|\s+)\S/)?.[1];
			if (letter && expected < 5 && letter === "ABCDE"[expected]) expected += 1;
		});
		const included = questions.some((question) => question.number === block.number);
		if (expected === 5 && included) {
			problems.push({ number: block.number, reason: "enunciado contém outra sequência A–E (tabela ou questão sem cabeçalho?) — conferir" });
		}
	});
	return problems;
}

console.log(`\nTotal: ${totals.questions} questões, ${totals.withImage} com imagem. Alertas de conteúdo misturado: ${totals.mixed || 0}.`);
process.exit(failed ? 1 : 0);
