const STORAGE_KEY = "scriptforge.library.v1";
const RUNNABLE_LANGUAGES = new Set(["js", "javascript"]);

const refs = {
	form: document.getElementById("scriptForm"),
	name: document.getElementById("name"),
	language: document.getElementById("language"),
	description: document.getElementById("description"),
	stepPreset: document.getElementById("stepPreset"),
	stepCustom: document.getElementById("stepCustom"),
	stepFields: document.getElementById("stepFields"),
	stepCountPreview: document.getElementById("stepCountPreview"),
	hasInstructions: document.getElementById("hasInstructions"),
	instructionBuilder: document.getElementById("instructionBuilder"),
	code: document.getElementById("code"),
	codeLineNumbers: document.getElementById("codeLineNumbers"),
	clearForm: document.getElementById("clearForm"),
	search: document.getElementById("search"),
	list: document.getElementById("scripts"),
	count: document.getElementById("count"),
	exportBtn: document.getElementById("exportBtn"),
	importInput: document.getElementById("importInput"),
	createBackupBtn: document.getElementById("createBackupBtn"),
	backupCount: document.getElementById("backupCount"),
	backupHistoryList: document.getElementById("backupHistoryList"),
	template: document.getElementById("scriptTemplate"),
	testerScriptSelect: document.getElementById("testerScriptSelect"),
	testerLanguage: document.getElementById("testerLanguage"),
	testerCode: document.getElementById("testerCode"),
	testerCodeLineNumbers: document.getElementById("testerCodeLineNumbers"),
	runScriptBtn: document.getElementById("runScriptBtn"),
	diagBtn: document.getElementById("diagBtn"),
	copyTesterOutputBtn: document.getElementById("copyTesterOutputBtn"),
	clearTesterBtn: document.getElementById("clearTesterBtn"),
	testerOutput: document.getElementById("testerOutput"),
	testerStatus: document.getElementById("testerStatus"),
	testerMeta: document.getElementById("testerMeta"),
	codeDialog: document.getElementById("codeDialog"),
	dialogTitle: document.getElementById("dialogTitle"),
	dialogCode: document.getElementById("dialogCodeInner"),
	confirmDialog: document.getElementById("confirmDialog"),
	confirmTitle: document.getElementById("confirmTitle"),
	confirmMessage: document.getElementById("confirmMessage"),
	confirmAcceptBtn: document.getElementById("confirmAcceptBtn"),
	confirmCancelBtn: document.getElementById("confirmCancelBtn"),
	navButtons: Array.from(document.querySelectorAll("[data-nav-target]")),
	pageSections: Array.from(document.querySelectorAll("[data-page]"))
};

const BACKUP_KEY = "scriptforge.backups.v1";

function loadBackups() {
	try {
		const raw = localStorage.getItem(BACKUP_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function saveBackups(backups) {
	localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
}

function formatBackupDate(iso) {
	return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function downloadJSON(data, filename) {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

function renderBackupHistory() {
	const backups = loadBackups();
	const list = refs.backupHistoryList;
	const count = refs.backupCount;
	if (!list) return;

	list.innerHTML = "";
	if (count) count.textContent = `${backups.length} respaldo${backups.length === 1 ? "" : "s"}`;

	if (!backups.length) {
		list.innerHTML = "<p class=\"muted-msg\">Sin respaldos guardados aun.</p>";
		return;
	}

	backups
		.slice()
		.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
		.forEach((backup) => {
			const item = document.createElement("div");
			item.className = "backup-history-item";
			item.innerHTML = `
				<div class="backup-history-info">
					<strong>${backup.label}</strong>
					<span class="meta">${formatBackupDate(backup.createdAt)} &mdash; ${backup.scripts.length} script${backup.scripts.length === 1 ? "" : "s"}</span>
				</div>
				<div class="backup-history-actions">
					<button class="secondary" data-backup-download="${backup.id}"><i class="bi bi-download"></i></button>
					<button class="secondary" data-backup-restore="${backup.id}"><i class="bi bi-arrow-counterclockwise"></i> Restaurar</button>
					<button class="danger" data-backup-delete="${backup.id}"><i class="bi bi-trash"></i></button>
				</div>`;
			list.appendChild(item);
		});

	list.addEventListener("click", (event) => {
		const target = event.target.closest("[data-backup-download],[data-backup-restore],[data-backup-delete]");
		if (!target) return;
		const backupsNow = loadBackups();
		const id = target.dataset.backupDownload || target.dataset.backupRestore || target.dataset.backupDelete;
		const backup = backupsNow.find((b) => b.id === id);

		if (target.dataset.backupDownload && backup) {
			downloadJSON(backup.scripts, `respaldo-${backup.label.replace(/\s+/g, "_")}.json`);
		}

		if (target.dataset.backupRestore && backup) {
			const ok = confirm(`Restaurar "${backup.label}"? Reemplazara la biblioteca actual.`);
			if (!ok) return;
			library = backup.scripts.filter((item) => item && item.id && item.name && item.description);
			saveLibrary();
			renderLibrary(refs.search.value);
			showToast(`Biblioteca restaurada desde "${backup.label}".`, "info");
		}

		if (target.dataset.backupDelete && backup) {
			const ok = confirm(`Eliminar respaldo "${backup.label}"?`);
			if (!ok) return;
			saveBackups(backupsNow.filter((b) => b.id !== id));
			renderBackupHistory();
		}
	});
}

let library = loadLibrary();
let editingId = null;
let testerFrame = null;
let currentRunCleanup = null;

function loadLibrary() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function saveLibrary() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

function formatDate(value) {
	return new Intl.DateTimeFormat("es-ES", {
		dateStyle: "medium",
		timeStyle: "short"
	}).format(new Date(value));
}

function sanitizeText(text) {
	return (text || "").trim();
}

function toUpperCaseInput(value) {
	return String(value || "").toLocaleUpperCase("es-ES");
}

function ensureLanguageOption(languageValue) {
	const normalized = sanitizeText(languageValue);
	if (!normalized || !refs.language) {
		return;
	}

	const upperValue = toUpperCaseInput(normalized);
	const exists = Array.from(refs.language.options || []).some((option) => option.value === upperValue);
	if (exists) {
		return;
	}

	const option = document.createElement("option");
	option.value = upperValue;
	option.textContent = upperValue;
	refs.language.appendChild(option);
}

function getStepCount() {
	if (!refs.hasInstructions?.checked) {
		return 0;
	}

	const customValue = Number.parseInt(refs.stepCustom.value, 10);
	if (Number.isInteger(customValue) && customValue >= 0) {
		return Math.min(customValue, 20);
	}

	const presetValue = Number.parseInt(refs.stepPreset.value, 10);
	return Number.isInteger(presetValue) && presetValue >= 0 ? presetValue : 0;
}

function updateStepCountPreview(count) {
	refs.stepCountPreview.textContent = `${count} paso${count === 1 ? "" : "s"}`;
}

function renderStepFields(count, values = []) {
	refs.stepFields.innerHTML = "";
	updateStepCountPreview(count);

	for (let index = 0; index < count; index += 1) {
		const wrapper = document.createElement("label");
		wrapper.className = "step-card";

		const title = document.createElement("strong");
		title.textContent = `Paso ${index + 1}`;

		const textarea = document.createElement("textarea");
		textarea.rows = 2;
		textarea.placeholder = `Explica que debe hacer el usuario en el paso ${index + 1}`;
		textarea.dataset.stepIndex = String(index);
		textarea.value = toUpperCaseInput(values[index] || "");

		wrapper.append(title, textarea);
		refs.stepFields.appendChild(wrapper);
	}
	}

function collectInstructions() {
	if (!refs.hasInstructions?.checked) {
		return [];
	}

	return Array.from(refs.stepFields.querySelectorAll("textarea"))
		.map((field) => toUpperCaseInput(sanitizeText(field.value)))
		.filter(Boolean);
}

function toggleInstructionBuilder(visible) {
	if (!refs.instructionBuilder) {
		return;
	}

	refs.instructionBuilder.hidden = !visible;

	if (!visible) {
		renderStepFields(0);
	}
}

function syncStepFieldsFromControls(preserveExisting = true) {
	if (!refs.hasInstructions?.checked) {
		renderStepFields(0);
		return;
	}

	const count = getStepCount();
	const values = preserveExisting ? collectInstructions() : [];
	refs.stepPreset.value = String(count);
	if (Number.parseInt(refs.stepCustom.value, 10) !== count && refs.stepCustom.value !== "") {
		refs.stepCustom.value = String(count);
	}
	renderStepFields(count, values);
}

function getCommentStyle(languageValue) {
	const language = getNormalizedLanguage(languageValue);
	const lineMap = {
		js: "//",
		javascript: "//",
		ts: "//",
		typescript: "//",
		java: "//",
		go: "//",
		cs: "//",
		csharp: "//",
		c: "//",
		cpp: "//",
		php: "//",
		swift: "//",
		py: "#",
		python: "#",
		sh: "#",
		bash: "#",
		shell: "#",
		ps1: "#",
		powershell: "#",
		yml: "#",
		yaml: "#",
		rb: "#",
		ruby: "#",
		pl: "#",
		sql: "--",
		bat: "REM",
		cmd: "REM"
	};

	if (lineMap[language]) {
		return { mode: "line", token: lineMap[language] };
	}

	if (["html", "xml", "markdown", "md"].includes(language)) {
		return { mode: "block", open: "<!--", close: "-->" };
	}

	if (["css", "scss", "less", "json"].includes(language)) {
		return { mode: "block", open: "/*", close: "*/" };
	}

	return { mode: "line", token: "#" };
}

function buildInstructionHeader(script) {
	const instructions = Array.isArray(script.instructions) ? script.instructions.filter(Boolean) : [];
	if (!instructions.length) {
		return "";
	}

	const style = getCommentStyle(script.language);
	const lines = [
		`ScriptForge | ${script.name}`,
		`Descripcion: ${script.description}`,
		"Instrucciones:",
		...instructions.map((instruction, index) => `Paso ${index + 1}: ${instruction}`)
	];

	if (style.mode === "block") {
		return `${style.open}\n${lines.join("\n")}\n${style.close}\n\n`;
	}

	return `${lines.map((line) => `${style.token} ${line}`).join("\n")}\n\n`;
}

function buildDownloadContent(script) {
	return `${buildInstructionHeader(script)}${script.code || ""}`;
}

function getNormalizedLanguage(languageValue) {
	return String(languageValue || "").trim().toLowerCase();
}

function canRunInBrowser(languageValue) {
	return RUNNABLE_LANGUAGES.has(getNormalizedLanguage(languageValue));
}

function getLanguageFromFileName(fileName) {
	const parts = fileName.split(".");
	return parts.length > 1 ? parts.pop().toUpperCase() : "Texto";
}

function detectLanguageFromContent(codeValue) {
	const code = String(codeValue || "").trim();
	if (!code) {
		return "";
	}

	const lowerCode = code.toLowerCase();
	const checks = [
		{ language: "CMD", regex: /(%programfiles%|%programfiles\(x86\)%|cscript\s+ospp\.vbs|for\s+\/f|cd\s+\/d|\.bat\b|\.cmd\b)/i },
		{ language: "POWERSHELL", regex: /(^|\n)\s*(get-|set-|new-|remove-|write-host|\$[a-z_]|param\(|function\s+[a-z0-9_-]+\s*\{)/i },
		{ language: "BASH", regex: /(^#!\s*\/bin\/(bash|sh)|\becho\b|\bchmod\b|\bapt\b|\bsudo\b|\bgrep\b|\bexport\s+[a-z_]+)/i },
		{ language: "PYTHON", regex: /(^|\n)\s*(def\s+\w+\(|import\s+\w+|from\s+\w+\s+import|print\(|if\s+__name__\s*==\s*["']__main__["'])/i },
		{ language: "JAVASCRIPT", regex: /(^|\n)\s*(const\s+|let\s+|var\s+|function\s+\w+\(|=>|console\.log\(|document\.|window\.)/i },
		{ language: "SQL", regex: /\b(select|insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+table|alter\s+table)\b/i },
		{ language: "HTML", regex: /<\s*html|<\s*div|<\s*script|<\s*body|<\s*head/i },
		{ language: "CSS", regex: /\{[^}]*:[^}]*;[^}]*\}|@media\s*\(/i },
		{ language: "JSON", regex: /^\s*[\[{][\s\S]*[\]}]\s*$/i },
		{ language: "YAML", regex: /(^|\n)\s*[a-z0-9_.-]+\s*:\s*[^\n]+/i }
	];

	for (const check of checks) {
		if (check.regex.test(code)) {
			return check.language;
		}
	}

	return "";
}

function maybeAutoSelectLanguageFromCode(codeValue) {
	if (!refs.language) {
		return;
	}

	const currentValue = toUpperCaseInput(sanitizeText(refs.language.value));
	if (currentValue && currentValue !== "TEXTO") {
		return;
	}

	const detected = detectLanguageFromContent(codeValue);
	if (!detected) {
		return;
	}

	ensureLanguageOption(detected);
	refs.language.value = detected;
}

function resolvePrismLanguage(languageValue) {
	const key = getNormalizedLanguage(languageValue);
	const map = {
		js: "javascript",
		javascript: "javascript",
		ts: "typescript",
		typescript: "typescript",
		py: "python",
		python: "python",
		sh: "bash",
		bash: "bash",
		shell: "bash",
		ps1: "powershell",
		powershell: "powershell",
		json: "json",
		xml: "markup",
		html: "markup",
		css: "css",
		sql: "sql",
		yml: "yaml",
		yaml: "yaml",
		md: "markdown",
		markdown: "markdown",
		php: "php",
		java: "java",
		go: "go",
		cs: "csharp",
		csharp: "csharp",
		rb: "ruby",
		ruby: "ruby"
	};

	return map[key] || "clike";
}

function applyHighlight(codeElement, codeValue, languageValue) {
	if (!codeElement) {
		return;
	}

	const prismLanguage = resolvePrismLanguage(languageValue);
	const container = codeElement.parentElement;

	codeElement.textContent = codeValue || "(sin codigo)";
	codeElement.className = `language-${prismLanguage}`;

	if (container) {
		Array.from(container.classList)
			.filter((name) => name.startsWith("language-"))
			.forEach((name) => container.classList.remove(name));
		container.classList.add(`language-${prismLanguage}`);
	}

	if (window.Prism && typeof window.Prism.highlightElement === "function") {
		window.Prism.highlightElement(codeElement);
	}
}

async function readFileAsText(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
		reader.readAsText(file);
	});
}

function resetForm() {
	refs.form.reset();
	editingId = null;
	refs.form.querySelector('button[type="submit"]').textContent = "Guardar script";
	toggleInstructionBuilder(false);
	updateLineNumbers(refs.code, refs.codeLineNumbers);
}

function setTesterStatus(text, tone = "idle") {
	refs.testerStatus.textContent = text;
	refs.testerStatus.dataset.tone = tone;
}

function setTesterOutput(text) {
	if (!refs.testerOutput) {
		return;
	}

	if ("value" in refs.testerOutput) {
		refs.testerOutput.value = String(text || "");
		return;
	}

	refs.testerOutput.textContent = String(text || "");
}

function updateLineNumbers(textarea, lineNumbers) {
	if (!textarea || !lineNumbers) {
		return;
	}

	const lineCount = Math.max(1, String(textarea.value || "").split(/\r\n|\r|\n/).length);
	lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
}

function setupCodeEditorLineNumbers(textarea, lineNumbers) {
	if (!textarea || !lineNumbers) {
		return;
	}

	const syncLineNumbers = () => updateLineNumbers(textarea, lineNumbers);
	textarea.addEventListener("input", syncLineNumbers);
	textarea.addEventListener("scroll", () => {
		lineNumbers.scrollTop = textarea.scrollTop;
	});

	syncLineNumbers();
}

function runStaticDiagnostics(code) {
	const checks = [];

	// 1. Sintaxis
	try {
		// eslint-disable-next-line no-new-func
		new Function(code);
		checks.push({ label: "Sintaxis JavaScript", status: "ok", detail: "Sin errores de sintaxis detectados" });
	} catch (err) {
		checks.push({ label: "Sintaxis JavaScript", status: "fail", detail: String(err.message || err) });
	}

	// 2. async / await balance
	const asyncCount = (code.match(/\basync\b/g) || []).length;
	const awaitCount = (code.match(/\bawait\b/g) || []).length;
	if (awaitCount > 0 && asyncCount === 0) {
		checks.push({ label: "await dentro de async", status: "fail", detail: `${awaitCount} await(s) sin ninguna funcion async que los contenga` });
	} else if (awaitCount > 0) {
		checks.push({ label: "async / await", status: "ok", detail: `${asyncCount} funcion(es) async con ${awaitCount} await(s)` });
	} else {
		checks.push({ label: "async / await", status: "ok", detail: "No utiliza async/await" });
	}

	// 3. Promesas sin .catch()
	const thenCount = (code.match(/\.then\s*\(/g) || []).length;
	const catchCount = (code.match(/\.catch\s*\(/g) || []).length;
	if (thenCount > 0 && catchCount === 0) {
		checks.push({ label: "Promesas sin .catch()", status: "warn", detail: `${thenCount} .then() sin ningun .catch() detectado — errores de promesa podrian quedar silenciosos` });
	} else if (thenCount > 0) {
		checks.push({ label: "Manejo de promesas", status: "ok", detail: `${thenCount} .then() con ${catchCount} .catch()` });
	} else {
		checks.push({ label: "Promesas .then()", status: "ok", detail: "No usa encadenamiento .then()" });
	}

	// 4. Salida por consola
	const hasConsole = /console\.(log|info|warn|error)\s*\(/.test(code);
	checks.push({
		label: "Salida por consola",
		status: hasConsole ? "ok" : "warn",
		detail: hasConsole ? "Usa console.log / info / warn / error" : "No tiene console.log — la salida puede ser silenciosa"
	});

	// 5. Referencias al DOM (podrian fallar en sandbox sin pagina real)
	const domRefs = [];
	if (/\bdocument\b/.test(code)) domRefs.push("document");
	if (/\bwindow\.location\b/.test(code)) domRefs.push("window.location");
	if (/\bnavigator\b/.test(code)) domRefs.push("navigator");
	if (domRefs.length > 0) {
		checks.push({ label: "Referencias al DOM", status: "warn", detail: `Usa: ${domRefs.join(", ")} — puede fallar fuera del contexto de pagina real` });
	} else {
		checks.push({ label: "Referencias al DOM", status: "ok", detail: "Sin referencias a DOM que puedan romper el sandbox" });
	}

	// 6. setTimeout / setInterval que podrian no completarse
	const timerCount = (code.match(/\bsetTimeout\b|\bsetInterval\b/g) || []).length;
	if (timerCount > 0) {
		checks.push({ label: "Timers (setTimeout / setInterval)", status: "warn", detail: `${timerCount} timer(s) detectado(s) — si exceden el timeout del sandbox (3 s) la ejecucion se cortara` });
	} else {
		checks.push({ label: "Timers", status: "ok", detail: "No usa setTimeout ni setInterval" });
	}

	// 7. IIFE
	const hasIife = /\(\s*function\s*\(|\(\s*\(\s*\)\s*=>/.test(code);
	checks.push({
		label: "Estructura IIFE",
		status: "ok",
		detail: hasIife ? "Detectada funcion auto-invocada (IIFE) — buen aislamiento de scope" : "Sin IIFE — variables pueden contaminar el scope global"
	});

	return checks;
}

let lastDiagChecks = null;

function renderChecklist(items, show = true) {
	const panel = document.getElementById("diagPanel");
	const list = document.getElementById("diagList");
	const summary = document.getElementById("diagSummary");

	if (!panel || !list || !summary) {
		return;
	}

	lastDiagChecks = items;

	list.innerHTML = "";

	const okCount = items.filter((item) => item.status === "ok").length;
	const failCount = items.filter((item) => item.status === "fail").length;
	const warnCount = items.filter((item) => item.status === "warn").length;

	summary.textContent = `${okCount} OK   ${failCount} Error   ${warnCount} Advertencia`;
	summary.dataset.tone = failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "ok";

	const iconMap = { ok: "bi-check-circle-fill", fail: "bi-x-circle-fill", warn: "bi-exclamation-triangle-fill" };

	items.forEach((item) => {
		const li = document.createElement("li");
		li.className = `diag-item diag-${item.status}`;
		li.innerHTML = `<i class="bi ${iconMap[item.status] || "bi-info-circle-fill"}"></i><span class="diag-label">${item.label}</span><span class="diag-detail">${item.detail}</span>`;
		list.appendChild(li);
	});

	if (show) {
		panel.hidden = false;
		panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}
}

function showToast(message, tone = "info") {
	let container = document.getElementById("toastContainer");
	if (!container) {
		container = document.createElement("div");
		container.id = "toastContainer";
		container.className = "toast-container";
		document.body.appendChild(container);
	}

	const toast = document.createElement("div");
	toast.className = `toast toast-${tone}`;
	toast.textContent = message;
	container.appendChild(toast);

	window.setTimeout(() => {
		toast.classList.add("is-hiding");
		window.setTimeout(() => {
			toast.remove();
			if (!container.childElementCount) {
				container.remove();
			}
		}, 220);
	}, 2400);
}

async function showConfirmDialog(message, title = "Confirmar accion") {
	if (!refs.confirmDialog || !refs.confirmMessage) {
		return confirm(message);
	}

	if (refs.confirmTitle) {
		refs.confirmTitle.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${title}`;
	}

	refs.confirmMessage.textContent = message;

	return new Promise((resolve) => {
		const onClose = () => {
			refs.confirmDialog.removeEventListener("close", onClose);
			resolve(refs.confirmDialog.returnValue === "accept");
		};

		refs.confirmDialog.addEventListener("close", onClose);
		refs.confirmDialog.showModal();
		if (refs.confirmCancelBtn) {
			refs.confirmCancelBtn.focus();
		}
	});
}

function destroyTesterFrame() {
	if (currentRunCleanup) {
		currentRunCleanup();
		currentRunCleanup = null;
	}

	if (testerFrame) {
		testerFrame.remove();
		testerFrame = null;
	}
}

function populateTesterSelect() {
	if (!refs.testerScriptSelect) {
		return;
	}

	const runnableScripts = library.filter((script) => canRunInBrowser(script.language));
	const previousValue = refs.testerScriptSelect.value;
	refs.testerScriptSelect.innerHTML = runnableScripts.length
		? '<option value="">Selecciona un script</option>'
		: '<option value="">No hay scripts compatibles (JavaScript)</option>';

	runnableScripts
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name, "es"))
		.forEach((script) => {
			const option = document.createElement("option");
			option.value = script.id;
			option.textContent = `${script.name} (${script.language || "Sin lenguaje"})`;
			refs.testerScriptSelect.appendChild(option);
		});

	if (previousValue && runnableScripts.some((item) => item.id === previousValue)) {
		refs.testerScriptSelect.value = previousValue;
	}
	}

function loadScriptIntoTester(scriptId) {
	const script = library.find((item) => item.id === scriptId);
	if (!script) {
		refs.testerScriptSelect.value = "";
		refs.testerLanguage.value = "";
		refs.testerCode.value = "";
		updateLineNumbers(refs.testerCode, refs.testerCodeLineNumbers);
		setTesterStatus("Listo", "idle");
		refs.testerMeta.textContent = "Sin ejecuciones";
		setTesterOutput("Esperando ejecucion...");
		return;
	}

	refs.testerScriptSelect.value = script.id;
	refs.testerLanguage.value = script.language || "Texto";
	refs.testerCode.value = script.code || "";
	updateLineNumbers(refs.testerCode, refs.testerCodeLineNumbers);
	setTesterStatus(canRunInBrowser(script.language) ? "Listo para ejecutar" : "No compatible", canRunInBrowser(script.language) ? "ready" : "blocked");
	refs.testerMeta.textContent = canRunInBrowser(script.language)
		? "Listo para ejecutar en sandbox del navegador"
		: "Este lenguaje necesita backend o app de escritorio";
	setTesterOutput(canRunInBrowser(script.language)
		? "Presiona Ejecutar para correr este script JavaScript en un sandbox aislado."
		: `No se puede ejecutar ${script.language || "este lenguaje"} desde el navegador. Para hacerlo funcionar de verdad necesitas un backend que ejecute procesos o una app de escritorio.`);
}

function openTesterWithScript(scriptId) {
	setActivePage("tester");
	loadScriptIntoTester(scriptId);
	window.scrollTo({ top: 0, behavior: "smooth" });
}

function buildRunnerDocument(code) {
	const serializedCode = JSON.stringify(String(code || ""));
	return `<!DOCTYPE html>
<html lang="es">
<body>
<script>
const send = (type, payload = {}) => parent.postMessage({ source: "scriptforge-runner", type, ...payload }, "*");
const serialize = (value) => {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};
window.console = {
  log: (...args) => send("log", { level: "log", message: args.map(serialize).join(" ") }),
  info: (...args) => send("log", { level: "info", message: args.map(serialize).join(" ") }),
  warn: (...args) => send("log", { level: "warn", message: args.map(serialize).join(" ") }),
  error: (...args) => send("log", { level: "error", message: args.map(serialize).join(" ") })
};
window.alert = (message) => send("log", { level: "alert", message: serialize(message) });
window.onerror = (message, source, line, column) => {
  send("error", { message: serialize(message), source, line, column });
};
(async () => {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runner = new AsyncFunction(${serializedCode});
    const result = await runner();
    if (typeof result !== "undefined") {
      send("result", { message: serialize(result) });
    }
    send("done");
  } catch (error) {
    send("error", { message: error && error.stack ? error.stack : serialize(error) });
  }
})();
</script>
</body>
</html>`;
}

function detectBlockedSandboxNavigation(code) {
	const source = String(code || "");
	const rules = [
		{ label: "top.location / parent.location", regex: /\b(?:top|parent)\.location\b/i },
		{ label: "window.location =", regex: /\bwindow\.location\s*=/i },
		{ label: "location.href =", regex: /\b(?:window\.)?location\.href\s*=/i },
		{ label: "location.assign/replace/reload", regex: /\b(?:window\.)?location\.(?:assign|replace|reload)\s*\(/i },
		{ label: "window.open()", regex: /\bwindow\.open\s*\(/i }
	];

	for (const rule of rules) {
		if (rule.regex.test(source)) {
			return rule.label;
		}
	}

	return "";
}

function runJavaScriptInSandbox(code) {
	const blockedPattern = detectBlockedSandboxNavigation(code);
	if (blockedPattern) {
		return Promise.resolve({
			status: "error",
			elapsed: 0,
			lines: [
				"[ERROR] Se bloqueo una accion de navegacion no permitida en el sandbox.",
				`[DETALLE] Patron detectado: ${blockedPattern}`,
				"[AYUDA] El probador web no permite redirecciones ni apertura de ventanas."
			]
		});
	}

	destroyTesterFrame();

	return new Promise((resolve) => {
		const outputLines = [];
		const startedAt = performance.now();
		const frame = document.createElement("iframe");
		frame.setAttribute("sandbox", "allow-scripts");
		frame.hidden = true;
		document.body.appendChild(frame);
		testerFrame = frame;

		const finish = (status, lines) => {
			const elapsed = Math.round(performance.now() - startedAt);
			destroyTesterFrame();
			resolve({ status, lines, elapsed });
		};

		const handleMessage = (event) => {
			if (!event.data || event.data.source !== "scriptforge-runner") {
				return;
			}

			if (event.data.type === "log") {
				outputLines.push(`[${String(event.data.level || "log").toUpperCase()}] ${event.data.message}`);
				return;
			}

			if (event.data.type === "result") {
				outputLines.push(`[RESULTADO] ${event.data.message}`);
				return;
			}

			if (event.data.type === "error") {
				outputLines.push(`[ERROR] ${event.data.message}`);
				finish("error", outputLines);
				return;
			}

			if (event.data.type === "done") {
				finish("success", outputLines.length ? outputLines : ["[OK] Script ejecutado sin salida."]);
			}
		};

		const timeoutId = window.setTimeout(() => {
			outputLines.push("[ERROR] Tiempo de ejecucion agotado (3000 ms).");
			finish("error", outputLines);
		}, 3000);

		currentRunCleanup = () => {
			window.removeEventListener("message", handleMessage);
			window.clearTimeout(timeoutId);
		};

		window.addEventListener("message", handleMessage);
		frame.srcdoc = buildRunnerDocument(code);
	});
}

function setActivePage(pageName) {
	refs.navButtons.forEach((button) => {
		button.classList.toggle("is-active", button.dataset.navTarget === pageName);
	});

	refs.pageSections.forEach((section) => {
		section.classList.toggle("is-active", section.dataset.page === pageName);
	});
}

function createScriptCard(script) {
	const fragment = refs.template.content.cloneNode(true);
	const article = fragment.querySelector(".script-card");

	article.querySelector('[data-field="name"]').textContent = script.name;
	article.querySelector('[data-field="language"]').textContent = script.language || "Sin lenguaje";
	article.querySelector('[data-field="description"]').textContent = script.description;
	article.querySelector('[data-field="updatedAt"]').textContent = formatDate(script.updatedAt);

	const previewCodeElement = article.querySelector('[data-field="previewCode"]');
	applyHighlight(previewCodeElement, script.code.slice(0, 300) || "(sin codigo)", script.language);

	article.querySelector('[data-action="view"]').addEventListener("click", () => {
		refs.dialogTitle.textContent = script.name;
		applyHighlight(refs.dialogCode, script.code || "(sin codigo guardado)", script.language);
		refs.codeDialog.showModal();
	});

	article.querySelector('[data-action="test"]').addEventListener("click", () => {
		if (!canRunInBrowser(script.language)) {
			showToast("No es compatible con el probador web. Solo JavaScript se puede ejecutar.", "warn");
			return;
		}
		openTesterWithScript(script.id);
	});

	article.querySelector('[data-action="copy"]').addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(script.code || "");
			alert("Codigo copiado al portapapeles.");
		} catch {
			alert("No se pudo copiar el codigo.");
		}
	});

	article.querySelector('[data-action="download"]').addEventListener("click", () => {
		const blob = new Blob([buildDownloadContent(script)], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `${script.name.replace(/\s+/g, "_")}.txt`;
		anchor.click();
		URL.revokeObjectURL(url);
	});

	article.querySelector('[data-action="delete"]').addEventListener("click", () => {
		const accepted = confirm(`Eliminar "${script.name}" de tu biblioteca?`);
		if (!accepted) {
			return;
		}

		library = library.filter((item) => item.id !== script.id);
		saveLibrary();
		renderLibrary(refs.search.value);
	});

	article.addEventListener("dblclick", () => {
		refs.name.value = script.name;
		ensureLanguageOption(script.language);
		refs.language.value = toUpperCaseInput(script.language);
		refs.description.value = script.description;
		refs.code.value = script.code;
		const instructionCount = Array.isArray(script.instructions) ? script.instructions.length : 0;
		refs.hasInstructions.checked = instructionCount > 0;
		toggleInstructionBuilder(refs.hasInstructions.checked);
		refs.stepPreset.value = String(instructionCount);
		refs.stepCustom.value = instructionCount ? String(instructionCount) : "";
		renderStepFields(instructionCount, script.instructions || []);
		editingId = script.id;
		refs.form.querySelector('button[type="submit"]').textContent = "Actualizar script";
		setActivePage("add");
		window.scrollTo({ top: 0, behavior: "smooth" });
	});

	return fragment;
}

function renderLibrary(query = "") {
	refs.list.innerHTML = "";
	const q = query.trim().toLowerCase();

	const filtered = library
		.filter((script) => {
			if (!q) {
				return true;
			}

			return [script.name, script.description, script.language].some((value) =>
				String(value || "").toLowerCase().includes(q)
			);
		})
		.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

	if (!filtered.length) {
		refs.list.innerHTML = "<p>No hay scripts para mostrar.</p>";
	} else {
		filtered.forEach((script) => {
			refs.list.appendChild(createScriptCard(script));
		});
	}

	refs.count.textContent = `${filtered.length} script${filtered.length === 1 ? "" : "s"}`;
	populateTesterSelect();
}
refs.form.addEventListener("submit", (event) => {
	event.preventDefault();
	const languageValue = toUpperCaseInput(sanitizeText(refs.language.value));
	ensureLanguageOption(languageValue);

	const payload = {
		id: editingId || crypto.randomUUID(),
		name: toUpperCaseInput(sanitizeText(refs.name.value)),
		language: languageValue || "TEXTO",
		description: toUpperCaseInput(sanitizeText(refs.description.value)),
		instructions: collectInstructions(),
		code: refs.code.value || "",
		updatedAt: new Date().toISOString()
	};

	if (!payload.name || !payload.description) {
		alert("Nombre y descripcion son obligatorios.");
		return;
	}

	if (editingId) {
		library = library.map((script) => (script.id === editingId ? payload : script));
	} else {
		library.push(payload);
	}

	saveLibrary();
	resetForm();
	renderLibrary(refs.search.value);
	setActivePage("library");
});

refs.search.addEventListener("input", (event) => {
	renderLibrary(event.target.value);
});

refs.code.addEventListener("input", () => {
	maybeAutoSelectLanguageFromCode(refs.code.value);
});

refs.code.addEventListener("paste", () => {
	window.setTimeout(() => {
		maybeAutoSelectLanguageFromCode(refs.code.value);
	}, 0);
});

refs.name.addEventListener("input", () => {
	refs.name.value = toUpperCaseInput(refs.name.value);
});

refs.description.addEventListener("input", () => {
	refs.description.value = toUpperCaseInput(refs.description.value);
});

refs.language.addEventListener("change", () => {
	refs.language.value = toUpperCaseInput(refs.language.value);
});

refs.clearForm.addEventListener("click", resetForm);

refs.hasInstructions.addEventListener("change", async () => {
	if (!refs.hasInstructions.checked) {
		const hasExistingSteps = Array.from(refs.stepFields.querySelectorAll("textarea"))
			.some((field) => sanitizeText(field.value).length > 0);
		if (hasExistingSteps) {
			const accepted = await showConfirmDialog("Si desactivas esta opcion se eliminaran los pasos escritos. Deseas continuar?", "Eliminar pasos");
			if (!accepted) {
				refs.hasInstructions.checked = true;
				return;
			}

			refs.stepPreset.value = "0";
			refs.stepCustom.value = "";
		}
	}

	toggleInstructionBuilder(refs.hasInstructions.checked);
});

refs.stepPreset.addEventListener("change", () => {
	if (!refs.hasInstructions.checked) {
		return;
	}

	refs.stepCustom.value = "";
	syncStepFieldsFromControls(false);
});

refs.stepCustom.addEventListener("input", () => {
	if (!refs.hasInstructions.checked) {
		return;
	}

	syncStepFieldsFromControls(true);
});

refs.stepFields.addEventListener("input", (event) => {
	if (!(event.target instanceof HTMLTextAreaElement)) {
		return;
	}

	event.target.value = toUpperCaseInput(event.target.value);
});

refs.navButtons.forEach((button) => {
	button.addEventListener("click", () => {
		setActivePage(button.dataset.navTarget);
	});
});

refs.testerScriptSelect.addEventListener("change", (event) => {
	loadScriptIntoTester(event.target.value);
});

refs.runScriptBtn.addEventListener("click", async () => {
	const language = refs.testerLanguage.value || "javascript";
	const code = refs.testerCode.value;

	if (!code.trim()) {
		setTesterStatus("Sin codigo", "blocked");
		refs.testerMeta.textContent = "Nada para ejecutar";
		setTesterOutput("Pega o carga primero un script.");
		return;
	}

	if (!canRunInBrowser(language)) {
		setTesterStatus("No compatible", "blocked");
		refs.testerMeta.textContent = "Lenguaje fuera del sandbox web";
		setTesterOutput(`El navegador no puede ejecutar ${language} de forma real. Para esto necesitas un backend que lance procesos o una aplicacion de escritorio como Electron.`);
		return;
	}

	setTesterStatus("Ejecutando", "running");
	refs.testerMeta.textContent = "Sandbox aislado del navegador";
	setTesterOutput("Ejecutando script...");

	const result = await runJavaScriptInSandbox(code);
	setTesterStatus(result.status === "success" ? "Ejecutado" : "Con error", result.status === "success" ? "success" : "error");
	refs.testerMeta.textContent = `Ultima ejecucion: ${result.elapsed} ms`;
	setTesterOutput(result.lines.join("\n"));
	});

refs.diagBtn.addEventListener("click", async () => {
	const diagPanel = document.getElementById("diagPanel");

	// Toggle: si ya hay resultados, mostrar u ocultar el panel
	if (lastDiagChecks !== null) {
		if (diagPanel && !diagPanel.hidden) {
			diagPanel.hidden = true;
			return;
		} else if (diagPanel && diagPanel.hidden) {
			diagPanel.hidden = false;
			diagPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
			return;
		}
	}

	const language = refs.testerLanguage.value || "javascript";
	const code = refs.testerCode.value;

	if (!code.trim()) {
		showToast("Sin codigo para diagnosticar.", "warn");
		return;
	}

	if (!canRunInBrowser(language)) {
		showToast("El diagnostico solo funciona con JavaScript.", "warn");
		return;
	}

	// Analisis estatico
	const checks = runStaticDiagnostics(code);

	// Ejecucion real en sandbox
	setTesterStatus("Diagnosticando", "running");
	refs.testerMeta.textContent = "Ejecutando analisis completo...";
	setTesterOutput("Ejecutando diagnostico en sandbox...");

	const result = await runJavaScriptInSandbox(code);

	// Resultados de runtime
	const errorLines = result.lines.filter((line) => line.startsWith("[ERROR]"));
	checks.push({
		label: "Ejecucion en sandbox",
		status: result.status === "success" ? "ok" : "fail",
		detail: result.status === "success"
			? `Completada en ${result.elapsed} ms sin errores de runtime`
			: `Error: ${errorLines.join(" ") || "Error desconocido"}`
	});

	checks.push({
		label: "Salida generada",
		status: result.lines.length > 0 ? "ok" : "warn",
		detail: result.lines.length > 0
			? `${result.lines.length} linea(s) de salida producidas`
			: "El script no genero ninguna salida visible"
	});

	checks.push({
		label: "Tiempo de respuesta",
		status: result.elapsed < 1000 ? "ok" : result.elapsed < 2800 ? "warn" : "fail",
		detail: `${result.elapsed} ms${result.elapsed >= 2800 ? " — cerca del limite de timeout (3000 ms)" : ""}`
	});

	setTesterStatus(result.status === "success" ? "Diagnostico OK" : "Con errores", result.status === "success" ? "success" : "error");
	refs.testerMeta.textContent = `Diagnostico: ${result.elapsed} ms`;
	setTesterOutput(result.lines.join("\n") || "(sin salida)");
	renderChecklist(checks);
});

refs.copyTesterOutputBtn.addEventListener("click", async () => {
	const diagPanel = document.getElementById("diagPanel");
	const diagList = document.getElementById("diagList");
	const diagPanelVisible = diagPanel && !diagPanel.hidden && diagList && diagList.childElementCount > 0;

	let textToCopy = "";

	if (diagPanelVisible) {
		const items = Array.from(diagList.querySelectorAll(".diag-item"));
		textToCopy = items.map((item) => {
			const label = item.querySelector(".diag-label")?.textContent || "";
			const detail = item.querySelector(".diag-detail")?.textContent || "";
			const tone = item.classList.contains("diag-ok") ? "OK" : item.classList.contains("diag-fail") ? "ERROR" : "AVISO";
			return `[${tone}] ${label}: ${detail}`;
		}).join("\n");
	} else {
		textToCopy = refs.testerOutput && "value" in refs.testerOutput
			? refs.testerOutput.value
			: refs.testerOutput.textContent;
	}

	if (!String(textToCopy || "").trim()) {
		showToast("No hay salida para copiar.", "warn");
		return;
	}

	try {
		await navigator.clipboard.writeText(textToCopy);
		showToast(diagPanelVisible ? "Diagnostico copiado al portapapeles." : "Salida copiada al portapapeles.", "info");
	} catch {
		showToast("No se pudo copiar.", "warn");
	}
});

refs.clearTesterBtn.addEventListener("click", () => {
	destroyTesterFrame();
	setTesterStatus("Listo", "idle");
	refs.testerMeta.textContent = "Salida limpiada";
	setTesterOutput("Esperando ejecucion...");
	const diagPanel = document.getElementById("diagPanel");
	if (diagPanel) {
		diagPanel.hidden = true;
	}
});

refs.createBackupBtn.addEventListener("click", () => {
	if (!library.length) {
		showToast("No hay scripts en la biblioteca para respaldar.", "warn");
		return;
	}

	const now = new Date();
	const label = `Respaldo ${now.toLocaleDateString("es-ES")} ${now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
	const backups = loadBackups();
	backups.push({ id: crypto.randomUUID(), label, createdAt: now.toISOString(), scripts: JSON.parse(JSON.stringify(library)) });
	saveBackups(backups);
	renderBackupHistory();
	showToast(`Respaldo "${label}" creado con ${library.length} script${library.length === 1 ? "" : "s"}.`, "info");
});

refs.exportBtn.addEventListener("click", () => {
	downloadJSON(library, "scriptforge-backup.json");
});

refs.importInput.addEventListener("change", async (event) => {
	const [file] = event.target.files;
	if (!file) {
		return;
	}

	try {
		const raw = await readFileAsText(file);
		const imported = JSON.parse(raw);
		if (!Array.isArray(imported)) {
			throw new Error("Formato invalido. Debe ser un arreglo JSON.");
		}

		library = imported.filter((item) => item && item.id && item.name && item.description);
		saveLibrary();
		renderLibrary(refs.search.value);
		alert("Biblioteca importada correctamente.");
	} catch (error) {
		alert(error.message || "No se pudo importar el archivo.");
	} finally {
		refs.importInput.value = "";
	}
});

renderLibrary();
toggleInstructionBuilder(false);
renderBackupHistory();
setupCodeEditorLineNumbers(refs.code, refs.codeLineNumbers);
setupCodeEditorLineNumbers(refs.testerCode, refs.testerCodeLineNumbers);
setActivePage("add");