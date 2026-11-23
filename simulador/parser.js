// =============================================
// SIMULADOR ENEM — parser.js
// Leitura dos arquivos de prova (dados/provas) e gabarito (dados/gabaritos).
// Funciona no navegador (funções globais) e no Node (module.exports),
// o que permite validar o banco com dados/ferramentas/verificar-banco.js.
//
// Formato padronizado da prova (gerado por dados/ferramentas/normalizar-provas.js):
//   QUESTÃO 07 [(opção inglês|opção espanhol)] [(tem imagem)] [(tem imagem nas alternativas)] [(pendente)]
//   texto do enunciado…
//   (tem imagem)            ← linha opcional: posição da figura no enunciado
//   A alternativa…
//   …
//   E alternativa…
// =============================================

const QUESTION_AREAS = [
	"Linguagens",
	"Ciências humanas",
	"Ciências da natureza",
	"Matemática",
];

const IMAGE_MARKER = "(tem imagem)";
const IMAGE_MARKER_LINE = /^\s*\(tem imagem\)\s*$/i;

// Até 2016 o 1º dia era Humanas + Natureza; a partir de 2017, Linguagens + Humanas.
function areaForQuestion(year, number) {
	const order = year <= 2016
		? ["Ciências humanas", "Ciências da natureza", "Linguagens", "Matemática"]
		: ["Linguagens", "Ciências humanas", "Ciências da natureza", "Matemática"];
	return order[Math.min(3, Math.max(0, Math.floor((number - 1) / 45)))];
}

function normalizeText(text) {
	return text.replace(/\s+/g, " ").trim();
}

function isExamMetadataLine(line) {
	return /^\s*-{5,}\s*$/.test(line)
		|| /^\s*(?:TEXTO\s+PARA\s+AS?\s+)?QUEST(?:Õ|O)ES\s+DE\s+\d/i.test(line)
		|| /^\s*(?:LINGUAGENS(?:,\s*C[ÓO]DIGOS)?|CI[ÊE]NCIAS\s+HUMANAS|CI[ÊE]NCIAS\s+DA\s+NATUREZA|MATEM[ÁA]TICA)(?:\s+E(?:\s+SUAS)?(?:\s+TECNOLOGIAS)?)?\s*$/.test(line)
		|| /^\s*(?:E\s+)?SUAS(?:\s+TECNOLOGIAS)?\.?\s*$/.test(line)
		|| /^\s*TECNOLOGIAS\s*$/.test(line);
}

// Linhas "157 Anulado" não geram resposta: a letra precisa estar isolada (\b).
function parseAnswerKey(text) {
	const answersByNumber = new Map();
	for (const match of text.matchAll(/^\s*(\d{1,3})\s+([A-E])\b(?:\s+([A-E])\b)?/gim)) {
		const number = Number(match[1]);
		const answers = answersByNumber.get(number) || [];
		answers.push(...[match[2], match[3]].filter(Boolean).map((answer) => answer.toUpperCase()));
		answersByNumber.set(number, answers);
	}
	return answersByNumber;
}

function parseChoices(lines) {
	const candidates = [];
	lines.forEach((line, index) => {
		const match = line.trim().match(/^([A-E])(?:[.)]\s*|\s+)(\S.*)$/);
		if (match) {
			candidates.push({ letter: match[1], text: match[2], index });
		}
	});

	let bestSequence;
	candidates.forEach((candidate, start) => {
		if (candidate.letter !== "A") return;
		const sequence = [candidate];
		let nextLetterIndex = 1;
		for (let index = start + 1; index < candidates.length && nextLetterIndex < 5; index += 1) {
			if (candidates[index].letter === "ABCDE"[nextLetterIndex]) {
				sequence.push(candidates[index]);
				nextLetterIndex += 1;
			}
		}
		// Menor intervalo vence; no empate, a sequência mais ao fim (as alternativas vêm por último,
		// e uma tabela com linhas "A 23,00…", "B 21,50…" no enunciado não deve ser confundida com elas).
		if (sequence.length === 5 && (!bestSequence
			|| sequence[4].index - sequence[0].index <= bestSequence[4].index - bestSequence[0].index)) {
			bestSequence = sequence;
		}
	});

	if (!bestSequence) return null;
	let endIndex = lines.length;
	const choices = bestSequence.map((choice, index) => {
		let end = bestSequence[index + 1]?.index;
		if (end === undefined) {
			// A última alternativa termina na primeira linha em branco: o que vem depois
			// (instruções da redação, rodapés) não faz parte da questão.
			const blank = lines.findIndex((line, lineIndex) => lineIndex > choice.index && !line.trim());
			end = blank === -1 ? lines.length : blank;
			endIndex = end;
		}
		const continuation = lines.slice(choice.index + 1, end).join(" ");
		return {
			letter: choice.letter,
			text: normalizeText(`${choice.text} ${continuation}`),
		};
	});
	return choices.every((choice) => choice.text)
		? { choices, firstChoiceIndex: bestSequence[0].index, endIndex }
		: null;
}

function questionHeaderTags(rest) {
	return {
		language: /ingl[êe]s/i.test(rest) ? "inglês" : /espanhol/i.test(rest) ? "espanhol" : null,
		imageInChoices: /imagem\s+n[ao]s\s+(?:alternativas|respostas)/i.test(rest),
		image: /imagem/i.test(rest),
		pending: /pendente/i.test(rest),
	};
}

function imageFileName(year, number, language) {
	const suffix = language === "inglês" ? "-ingles" : language === "espanhol" ? "-espanhol" : "";
	return `${year}-questao-${String(number).padStart(2, "0")}${suffix}.png`;
}

/**
 * @param {string} text conteúdo de dados/provas/prova-AAAA
 * @param {number} year
 * @param {Map<number,string[]>} answerKey resultado de parseAnswerKey
 * @param {object} [options]
 * @param {Set<string>} [options.images] nomes de arquivo disponíveis em assets/imagens
 * @param {string} [options.imageBasePath] prefixo do caminho das imagens
 * @param {(reason:string, info:object)=>void} [options.onSkip] recebe cada questão descartada
 */
function parseQuestionFile(text, year, answerKey, options = {}) {
	const images = options.images || new Set();
	const imageBasePath = options.imageBasePath || "";
	const onSkip = options.onSkip || (() => {});
	// [ \t] e não \s: \s atravessa quebras de linha e transformava uma linha "2"
	// (denominador de fração) seguida de "QUESTÃO 164" na falsa "questão 2".
	const marker = /^[ \t]*(?:QUEST(?:ÃO|AO)[ \t]*0*(\d{1,3})|0*(\d{1,3})[ \t]+QUEST(?:ÃO|AO))\b(.*)$/gim;
	const headers = [...text.matchAll(marker)];
	const questions = [];

	// "TEXTO PARA AS QUESTÕES DE 06 A 10": texto-base repetido no início de cada questão do intervalo.
	const sharedTexts = [];
	for (const shared of text.matchAll(/^[ \t]*TEXTO[ \t]+PARA[ \t]+AS?[ \t]+QUEST(?:Õ|O)ES[ \t]+DE[ \t]+0*(\d{1,3})[ \t]+A[ \t]+0*(\d{1,3})\b.*$/gim)) {
		const start = shared.index + shared[0].length;
		const nextHeader = headers.find((header) => header.index > shared.index);
		const sharedLines = text.slice(start, nextHeader ? nextHeader.index : text.length).split(/\r?\n/)
			.filter((line) => !isExamMetadataLine(line));
		sharedTexts.push({ from: Number(shared[1]), to: Number(shared[2]), text: normalizeText(sharedLines.join(" ")) });
	}
	const seenNumbers = new Set();
	const occurrences = new Map();

	headers.forEach((header, index) => {
		const number = Number(header[1] || header[2]);
		if (!number) return;
		const occurrence = occurrences.get(number) || 0;
		occurrences.set(number, occurrence + 1);
		const tags = questionHeaderTags(header[3] || "");
		const language = tags.language
			|| (occurrence > 0 || (answerKey.get(number) || []).length > 1 ? ["inglês", "espanhol"][Math.min(occurrence, 1)] : null);
		const skip = (reason) => onSkip(reason, { year, number, language });
		// Só uma versão por número entra no banco (inglês tem prioridade sobre espanhol).
		if (seenNumbers.has(number)) return;

		const start = header.index + header[0].length;
		const end = headers[index + 1]?.index ?? text.length;
		const rawLines = text.slice(start, end).split(/\r?\n/)
			.filter((line) => !isExamMetadataLine(line))
			.map((line) => line.replace(/-{5,}=?/g, ""));

		if (tags.pending) return skip("questão marcada como pendente");
		if (tags.imageInChoices) return skip("alternativas em imagem");

		const hasImage = tags.image || rawLines.some((line) => IMAGE_MARKER_LINE.test(line));
		let imageSrc = null;
		if (hasImage) {
			const fileName = imageFileName(year, number, language);
			if (!images.has(fileName)) return skip(`imagem ausente (${fileName})`);
			imageSrc = `${imageBasePath}${fileName}`;
		}

		const parsedChoices = parseChoices(rawLines);
		if (!parsedChoices) return skip("alternativas A–E não encontradas");
		const possibleAnswers = answerKey.get(number) || [];
		const answerIndex = language === "espanhol" ? 1 : 0;
		const correctAnswer = possibleAnswers[Math.min(answerIndex, possibleAnswers.length - 1)];
		if (!correctAnswer) return skip("sem gabarito (ou anulada)");
		if (!parsedChoices.choices.some((choice) => choice.letter === correctAnswer)) return skip("gabarito fora das alternativas");

		const statementLines = rawLines.slice(0, parsedChoices.firstChoiceIndex);
		const blocks = [];
		let buffer = [];
		let imagePlaced = false;
		const flush = () => {
			const textBlock = normalizeText(buffer.join(" "));
			if (textBlock) blocks.push({ type: "text", text: textBlock });
			buffer = [];
		};
		statementLines.forEach((line) => {
			if (IMAGE_MARKER_LINE.test(line)) {
				flush();
				if (imageSrc && !imagePlaced) {
					blocks.push({ type: "image", src: imageSrc });
					imagePlaced = true;
				}
				return;
			}
			buffer.push(line);
		});
		flush();
		if (imageSrc && !imagePlaced) blocks.unshift({ type: "image", src: imageSrc });
		const shared = sharedTexts.find(({ from, to }) => number >= from && number <= to);
		if (shared?.text) blocks.unshift({ type: "text", text: shared.text, shared: true });

		const statement = normalizeText(blocks.filter((block) => block.type === "text").map((block) => block.text).join(" "));
		if (!statement) return skip("enunciado vazio");

		questions.push({
			id: `${year}-${number}`,
			year,
			number,
			language,
			area: areaForQuestion(year, number),
			statement,
			statementBlocks: blocks,
			image: imageSrc,
			choices: parsedChoices.choices,
			correctAnswer,
			difficulty: "Média",
			complexity: `${statement} ${parsedChoices.choices.map((choice) => choice.text).join(" ")}`.split(/\s+/).length,
		});
		seenNumbers.add(number);
	});

	return questions;
}

function classifyDifficulty(questions) {
	const sorted = [...questions].sort((first, second) => first.complexity - second.complexity);
	sorted.forEach((question, index) => {
		const percentile = index / Math.max(sorted.length, 1);
		question.difficulty = percentile < 0.3 ? "Fácil" : percentile < 0.7 ? "Média" : "Difícil";
	});
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		QUESTION_AREAS,
		IMAGE_MARKER,
		areaForQuestion,
		imageFileName,
		isExamMetadataLine,
		parseAnswerKey,
		parseChoices,
		parseQuestionFile,
		classifyDifficulty,
		normalizeText,
	};
}
