#!/usr/bin/env node
// =============================================
// Padroniza os arquivos dados/provas/prova-AAAA num formato único.
//
// Uso:  node dados/ferramentas/normalizar-provas.js [ano ...] [--dry-run]
//
// O que o script faz (pode ser executado várias vezes; o resultado não muda):
//  - cabeçalhos viram "QUESTÃO NN" + marcações padronizadas:
//      (opção inglês) | (opção espanhol) | (tem imagem) | (tem imagem nas alternativas) | (pendente)
//  - "1 QUESTAO", "Questão 1", "QUESTÃO 01- (tem imagem)", "QUESTÃO  (tem imagem)" etc. são reconhecidos;
//  - marcações de imagem no texto viram uma linha "(tem imagem)" na posição da figura;
//  - alternativas que são imagens ("A tem imagem") marcam a questão com "(tem imagem nas alternativas)";
//  - títulos de área, "Questões de X a Y", "DIA 1 - caderno azul" e separadores são removidos
//    e os títulos de área são regravados de forma padronizada;
//  - blocos duplicados (mesmo número e mesmo texto) são unificados, mantendo o mais completo;
//  - números repetidos que preenchem uma lacuna (31, 31, 33) são renumerados (31, 32, 33);
//  - versões de língua estrangeira (1–5, ou 91–95 até 2016) recebem (opção inglês/espanhol).
// =============================================

const fs = require("fs");
const path = require("path");
const { areaForQuestion, normalizeText, parseChoices } = require("../../simulador/parser.js");

const PROVAS_DIR = path.join(__dirname, "..", "provas");
const AREA_HEADINGS = {
	"Linguagens": "LINGUAGENS, CÓDIGOS E SUAS TECNOLOGIAS",
	"Ciências humanas": "CIÊNCIAS HUMANAS E SUAS TECNOLOGIAS",
	"Ciências da natureza": "CIÊNCIAS DA NATUREZA E SUAS TECNOLOGIAS",
	"Matemática": "MATEMÁTICA E SUAS TECNOLOGIAS",
};

const HEADER = /^\s*(?:QUES+T[ÃAÂ]O\s*0*(\d{1,3})?|0*(\d{1,3})\s+QUES+T[ÃAÂ]O)(?![A-Za-zÀ-ú])(.*)$/i;
// "69Atribuo a causa…": número da questão colado na primeira palavra do texto.
const GLUED_HEADER = /^\s*(\d{1,3})([A-ZÀ-Ú][a-zà-ú].*)$/;
const SHARED_TEXT = /^\s*TEXTO\s+PARA\s+AS?\s+QUEST(?:Õ|O)ES\s+(?:DE\s+)?0*(\d{1,3})\s+A\s+0*(\d{1,3})\b/i;

function isMetadataLine(line) {
	return /^\s*-{5,}=?\s*$/.test(line)
		|| /^\s*(?:TEXTO\s+PARA\s+AS?\s+)?QUEST(?:Õ|O)ES\s+DE\s+\d/i.test(line)
		|| /^\s*(?:LINGUAGENS(?:,\s*C[ÓO]DIGOS)?|CI[ÊE]NCIAS\s+HUMANAS|CI[ÊE]NCIAS\s+DA\s+NATUREZA|MATEM[ÁA]TICA)(?:\s+E(?:\s+SUAS)?(?:\s+TECNOLOGIAS)?)?\s*$/.test(line)
		|| /^\s*(?:E\s+)?SUAS(?:\s+TECNOLOGIAS)?\.?\s*$/.test(line)
		|| /^\s*TECNOLOGIAS\s*$/.test(line)
		|| /^\s*OP[CÇ][AÃÂ]O\s+(?:INGL[ÊE]S|ESPANHOL)\s*$/i.test(line)
		|| /^\s*(?:prova\s+(?:\d{4}\s+)?(?:a?caderno\s+azul\s+)?)?dia\s*0?[12]\s*(?:-?\s*(?:caderno\s+)?azul)?\s*$/i.test(line)
		|| /^\s*ENEM\s+\d{4}\s+·.*$/.test(line)
		// Rodapés de página copiados do PDF: "*010175AZ26*", "CH - 1° dia | Caderno 1 - AZUL …"
		|| /^\s*\*\d{6}[A-Z]{2}\d+\*\s*$/.test(line)
		|| /^\s*(?:LC|CH|CN|MT)\s*-\s*[12]\s*[º°o]\s*dia\s*\|/i.test(line);
}

// "E 13Questão 165": cabeçalho da questão seguinte colado no fim da alternativa.
const TRAILING_HEADER = /^(.*\S)\s*(QUES+T[ÃAÂ]O\s*0*(\d{1,3})(?![\d\p{L}]).*)$/iu;

// "imagem" ou "foto" ("TEM FOTO" na prova de 2019)
const IMAGE_ONLY_LINE = /^\s*\(?\s*(?:(?:tem|cont[eé]m)\s+)?(?:imagem+|foto)\s*\)?\s*\.?\s*$/i;
const IMAGE_SUFFIX = /^(.*\S)\s*\(\s*(?:tem\s+)?imagem+\s*\)\s*$/i;
const CHOICE_IMAGE = /^\s*[A-E]\s+(?:\(?(?:tem\s+)?(?:imagem|foto)\)?)(?:\s+[A-E]\s+\(?(?:tem\s+)?(?:imagem|foto)\)?)?\s*$/i;

function parseHeaderRest(rest) {
	const withoutChoiceImage = rest.replace(/\(?\s*(?:tem\s+)?imagem\s+n[ao]s?\s+(?:alternativas|respostas)\s*\)?/gi, "");
	return {
		language: /ingl[êe]s/i.test(rest) ? "inglês" : /espanhol/i.test(rest) ? "espanhol" : null,
		image: /imag/i.test(withoutChoiceImage),
		imageInChoices: /imagem\s+n[ao]s?\s+(?:alternativas|respostas)|n[ao]s\s+(?:alternativas|respostas)/i.test(rest),
		pending: /pendente/i.test(rest),
	};
}

function headerLine(block) {
	const parts = [`QUESTÃO ${String(block.number).padStart(2, "0")}`];
	if (block.language) parts.push(`(opção ${block.language})`);
	if (block.image) parts.push("(tem imagem)");
	if (block.imageInChoices) parts.push("(tem imagem nas alternativas)");
	if (block.pending) parts.push("(pendente)");
	return parts.join(" ");
}

// Índice da primeira linha em branco depois de uma sequência A, B, C, D, E (em ordem);
// -1 se não houver texto não vazio depois dela.
function firstChoiceSequenceEnd(lines) {
	let expected = 0;
	for (let index = 0; index < lines.length; index += 1) {
		const letter = lines[index].match(/^\s*([A-E])(?:[.)]\s*|\s+)\S/)?.[1];
		if (letter && letter === "ABCDE"[expected]) expected += 1;
		if (expected === 5 && !lines[index].trim()) {
			return lines.slice(index).some((line) => line.trim()) ? index : -1;
		}
	}
	return -1;
}

function trimBlankEdges(lines) {
	let start = 0;
	let end = lines.length;
	while (start < end && !lines[start].trim()) start += 1;
	while (end > start && !lines[end - 1].trim()) end -= 1;
	return lines.slice(start, end);
}

function collapseBlankRuns(lines) {
	return lines.filter((line, index) => line.trim() || (index > 0 && lines[index - 1].trim()));
}

function normalizeFile(text, year, report) {
	const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((line) => line.replace(/\s+$/, ""));
	const blocks = [];
	const preamble = [];
	const sharedTexts = [];
	let sharedText = null;

	lines.forEach((line) => {
		const shared = line.match(SHARED_TEXT);
		if (shared) {
			sharedText = { from: Number(shared[1]), to: Number(shared[2]), lines: [] };
			sharedTexts.push(sharedText);
			return;
		}
		const lastNumber = blocks[blocks.length - 1]?.number;
		const trailing = line.match(TRAILING_HEADER);
		if (trailing && lastNumber && Number(trailing[3]) === lastNumber + 1 && !HEADER.test(line)) {
			report.fixes.push(`cabeçalho da questão ${trailing[3]} estava colado no fim da linha "${trailing[1].trim().slice(0, 20)}"`);
			blocks[blocks.length - 1].lines.push(trailing[1]);
			sharedText = null;
			const tags = parseHeaderRest(trailing[2].replace(/^QUES+T[ÃAÂ]O\s*\d+/i, ""));
			blocks.push({ number: Number(trailing[3]), ...tags, lines: [] });
			return;
		}
		const glued = line.match(GLUED_HEADER);
		if (glued && lastNumber && Number(glued[1]) === lastNumber + 1) {
			report.fixes.push(`número colado ao texto ("${line.trim().slice(0, 16)}…") separado como questão ${glued[1]}`);
			sharedText = null;
			blocks.push({ number: Number(glued[1]), language: null, image: false, imageInChoices: false, pending: false, lines: [glued[2]] });
			return;
		}
		const match = line.match(HEADER);
		if (match && (match[1] || match[2] || /imagem/i.test(match[3]))) {
			sharedText = null;
			const tags = parseHeaderRest(match[3] || "");
			blocks.push({ number: Number(match[1] || match[2]) || null, ...tags, lines: [] });
			return;
		}
		if (isMetadataLine(line)) {
			if (line.trim()) report.removed.push(line.trim());
			return;
		}
		(sharedText ? sharedText.lines : blocks.length ? blocks[blocks.length - 1].lines : preamble).push(line);
	});

	if (trimBlankEdges(preamble).length) {
		report.warnings.push(`texto antes da primeira questão foi descartado: ${normalizeText(preamble.join(" ")).slice(0, 120)}`);
	}

	// Número ausente: assume o seguinte ao anterior.
	blocks.forEach((block, index) => {
		if (block.number === null) {
			block.number = (blocks[index - 1]?.number || 0) + 1;
			report.fixes.push(`cabeçalho sem número tratado como questão ${block.number}`);
		}
	});

	// Marcações de imagem no corpo do texto.
	blocks.forEach((block) => {
		const output = [];
		block.lines.forEach((line) => {
			if (CHOICE_IMAGE.test(line)) {
				block.imageInChoices = true;
				output.push(line.replace(/\(?(?:tem\s+)?(?:imagem|foto)\)?/gi, "(imagem)"));
				return;
			}
			if (IMAGE_ONLY_LINE.test(line)) {
				block.image = true;
				output.push("(tem imagem)");
				return;
			}
			const suffix = line.match(IMAGE_SUFFIX);
			if (suffix && !/^\s*[A-E]\s/.test(line)) {
				block.image = true;
				output.push(suffix[1], "(tem imagem)");
				return;
			}
			output.push(line);
		});
		block.lines = collapseBlankRuns(trimBlankEdges(output));
		block.key = normalizeText(block.lines.join(" ")).slice(0, 160);
	});

	// Questão sem cabeçalho: o bloco traz duas questões completas (enunciado + A–E),
	// separadas por linha em branco, e o número seguinte não existe no arquivo.
	const present = new Set(blocks.map((block) => block.number));
	for (let index = 0; index < blocks.length; index += 1) {
		const block = blocks[index];
		const nextNumber = block.number + 1;
		if (present.has(nextNumber) || nextNumber > 180) continue;
		const first = firstChoiceSequenceEnd(block.lines);
		if (first === -1) continue;
		const rest = trimBlankEdges(block.lines.slice(first));
		const restChoices = parseChoices(rest);
		if (!restChoices || restChoices.firstChoiceIndex === 0) continue;
		report.fixes.push(`questão ${nextNumber} sem cabeçalho estava dentro da ${block.number}: separada`);
		const restImage = rest.some((line) => line === "(tem imagem)");
		block.lines = trimBlankEdges(block.lines.slice(0, first));
		block.image = block.lines.some((line) => line === "(tem imagem)") || (block.image && !restImage);
		blocks.splice(index + 1, 0, {
			number: nextNumber, language: null, image: restImage, imageInChoices: false, pending: false,
			lines: rest, key: normalizeText(rest.join(" ")).slice(0, 160),
		});
		block.key = normalizeText(block.lines.join(" ")).slice(0, 160);
		present.add(nextNumber);
	}

	// Número repetido que preenche uma lacuna: 31, 31, 33 → 31, 32, 33.
	blocks.forEach((block, index) => {
		const previous = blocks[index - 1];
		const next = blocks[index + 1];
		if (previous && next && block.number === previous.number && next.number === block.number + 2
			&& block.key !== previous.key) {
			report.fixes.push(`segunda questão ${block.number} renumerada para ${block.number + 1}`);
			block.number += 1;
		}
	});

	// Duplicatas: mesmo número e mesmo início de texto → mantém o bloco mais completo.
	const byNumber = new Map();
	blocks.forEach((block) => {
		const group = byNumber.get(block.number) || [];
		const twin = group.find((other) => other.key === block.key
			|| other.key.slice(0, 80) === block.key.slice(0, 80));
		if (twin) {
			// Prefere o bloco sem texto solto depois da alternativa E; empate → o mais completo.
			// Conta o texto que sobra depois da PRIMEIRA sequência A–E completa.
			const junk = (candidate) => {
				const end = firstChoiceSequenceEnd(candidate.lines);
				return end === -1 ? 0 : candidate.lines.slice(end).filter((line) => line.trim()).length;
			};
			const size = (candidate) => candidate.lines.join("\n").length;
			const keepNew = junk(block) < junk(twin) || (junk(block) === junk(twin) && size(block) > size(twin));
			report.fixes.push(`questão ${block.number} duplicada: mantido o bloco ${keepNew ? "posterior" : "anterior"}`);
			if (keepNew) group[group.indexOf(twin)] = { ...block, image: block.image || twin.image, language: block.language || twin.language };
			else twin.image = twin.image || block.image;
			return;
		}
		group.push(block);
		byNumber.set(block.number, group);
	});

	// Versões de língua estrangeira.
	const unique = [];
	byNumber.forEach((group, number) => {
		if (group.length > 2) report.warnings.push(`questão ${number} aparece ${group.length} vezes com textos diferentes`);
		if (group.length >= 2) {
			group.forEach((block, index) => { block.language = block.language || (index === 0 ? "inglês" : "espanhol"); });
			const [english, spanish] = [group.find((b) => b.language === "inglês"), group.find((b) => b.language === "espanhol")];
			[english, spanish].forEach((block, index) => {
				if (!block) return;
				const sample = ` ${normalizeText(block.lines.join(" ")).toLowerCase()} `;
				// Só palavras que não existem em português.
				const en = (sample.match(/ (the|and|of|is|you|to|in|with|that|it) /g) || []).length;
				const es = (sample.match(/ (el|los|las|del|una|y|es|con|muy|pero|su) /g) || []).length;
				const looksLike = en > es ? "inglês" : es > en ? "espanhol" : "indefinido";
				if (looksLike !== ["inglês", "espanhol"][index] && looksLike !== "indefinido") {
					report.warnings.push(`questão ${number} (opção ${block.language}) parece estar em ${looksLike}`);
				}
			});
		}
		unique.push(...group);
	});

	unique.forEach((block) => {
		const parsed = parseChoices(block.lines);
		const extra = parsed ? block.lines.slice(parsed.endIndex).filter((line) => line.trim()) : [];
		if (extra.length) {
			report.leftovers.push(`questão ${block.number}${block.language ? ` (${block.language})` : ""}: ${extra.length} linha(s) após a alternativa E, ignoradas pelo simulador — "${normalizeText(extra.join(" ")).slice(0, 70)}…"`);
		}
	});

	const languageOrder = { inglês: 0, null: 1, espanhol: 2 };
	unique.sort((a, b) => a.number - b.number || languageOrder[a.language] - languageOrder[b.language]);

	const out = [`ENEM ${year} · arquivo padronizado por dados/ferramentas/normalizar-provas.js`, ""];
	let currentArea = null;
	const pad = (number) => String(number).padStart(2, "0");
	const pendingShared = sharedTexts.map((shared) => ({ ...shared, lines: collapseBlankRuns(trimBlankEdges(shared.lines)) }));
	unique.forEach((block) => {
		const area = areaForQuestion(year, block.number);
		if (area !== currentArea) {
			currentArea = area;
			out.push(AREA_HEADINGS[area], "");
		}
		pendingShared.filter((shared) => !shared.done && shared.from === block.number).forEach((shared) => {
			out.push(`TEXTO PARA AS QUESTÕES DE ${pad(shared.from)} A ${pad(shared.to)}`, ...shared.lines, "");
			shared.done = true;
		});
		out.push(headerLine(block), ...block.lines, "");
	});

	const numbers = new Set(unique.map((block) => block.number));
	const missing = [];
	for (let number = 1; number <= 180; number += 1) if (!numbers.has(number)) missing.push(number);
	report.summary = `${numbers.size} questões numeradas; ${unique.filter((b) => b.image).length} com imagem`
		+ (missing.length ? `; faltando: ${missing.length > 20 ? `${missing.length} números` : missing.join(", ")}` : "");
	return out.join("\r\n");
}

function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const verbose = args.includes("--verbose");
	const years = args.filter((arg) => /^\d{4}$/.test(arg));
	const files = fs.readdirSync(PROVAS_DIR)
		.filter((name) => /^prova-\d{4}$/.test(name))
		.filter((name) => !years.length || years.includes(name.slice(6)))
		.sort();

	files.forEach((name) => {
		const year = Number(name.slice(6));
		const file = path.join(PROVAS_DIR, name);
		const original = fs.readFileSync(file, "utf8");
		if (!original.trim()) {
			console.log(`${name}: vazio, ignorado`);
			return;
		}
		const report = { removed: [], fixes: [], warnings: [], leftovers: [], summary: "" };
		const normalized = normalizeFile(original, year, report);
		const changed = normalized !== original;
		console.log(`\n${name}: ${report.summary}${changed ? "" : " (sem alterações)"}`);
		report.fixes.forEach((fix) => console.log(`  correção: ${fix}`));
		report.warnings.forEach((warning) => console.log(`  ATENÇÃO: ${warning}`));
		if (verbose) {
			report.leftovers.forEach((leftover) => console.log(`  sobra: ${leftover}`));
			const counts = new Map();
			report.removed.forEach((line) => counts.set(line, (counts.get(line) || 0) + 1));
			counts.forEach((count, line) => console.log(`  removido (${count}x): ${line}`));
		}
		if (changed && !dryRun) fs.writeFileSync(file, normalized);
	});
}

if (require.main === module) main();

module.exports = { normalizeFile };
