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
	code: document.getElementById("code"),
	fileInput: document.getElementById("fileInput"),
	clearForm: document.getElementById("clearForm"),
	search: document.getElementById("search"),
	list: document.getElementById("scripts"),
	count: document.getElementById("count"),
	exportBtn: document.getElementById("exportBtn"),
	importInput: document.getElementById("importInput"),
	template: document.getElementById("scriptTemplate"),
	testerScriptSelect: document.getElementById("testerScriptSelect"),
	testerLanguage: document.getElementById("testerLanguage"),
	testerCode: document.getElementById("testerCode"),
	runScriptBtn: document.getElementById("runScriptBtn"),
	clearTesterBtn: document.getElementById("clearTesterBtn"),
	testerOutput: document.getElementById("testerOutput"),
	testerStatus: document.getElementById("testerStatus"),
	testerMeta: document.getElementById("testerMeta"),
	codeDialog: document.getElementById("codeDialog"),
	dialogTitle: document.getElementById("dialogTitle"),
	dialogCode: document.getElementById("dialogCodeInner"),
	navButtons: Array.from(document.querySelectorAll("[data-nav-target]")),
	pageSections: Array.from(document.querySelectorAll("[data-page]"))
};

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

function getStepCount() {
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
		textarea.value = values[index] || "";

		wrapper.append(title, textarea);
		refs.stepFields.appendChild(wrapper);
	}
	}

function collectInstructions() {
	return Array.from(refs.stepFields.querySelectorAll("textarea"))
		.map((field) => sanitizeText(field.value))
		.filter(Boolean);
}

function syncStepFieldsFromControls(preserveExisting = true) {
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
	renderStepFields(0);
}

function setTesterStatus(text, tone = "idle") {
	refs.testerStatus.textContent = text;
	refs.testerStatus.dataset.tone = tone;
}

function setTesterOutput(text) {
	refs.testerOutput.textContent = text;
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

	const previousValue = refs.testerScriptSelect.value;
	refs.testerScriptSelect.innerHTML = '<option value="">Selecciona un script</option>';

	library
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name, "es"))
		.forEach((script) => {
			const option = document.createElement("option");
			option.value = script.id;
			option.textContent = `${script.name} (${script.language || "Sin lenguaje"})`;
			refs.testerScriptSelect.appendChild(option);
		});

	if (previousValue && library.some((item) => item.id === previousValue)) {
		refs.testerScriptSelect.value = previousValue;
	}
	}

function loadScriptIntoTester(scriptId) {
	const script = library.find((item) => item.id === scriptId);
	if (!script) {
		refs.testerScriptSelect.value = "";
		refs.testerLanguage.value = "";
		refs.testerCode.value = "";
		setTesterStatus("Listo", "idle");
		refs.testerMeta.textContent = "Sin ejecuciones";
		setTesterOutput("Esperando ejecucion...");
		return;
	}

	refs.testerScriptSelect.value = script.id;
	refs.testerLanguage.value = script.language || "Texto";
	refs.testerCode.value = script.code || "";
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

function runJavaScriptInSandbox(code) {
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
		const extension = (script.language || "txt").toLowerCase();
		const blob = new Blob([buildDownloadContent(script)], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `${script.name.replace(/\s+/g, "_")}.${extension}`;
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
		refs.language.value = script.language;
		refs.description.value = script.description;
		refs.code.value = script.code;
		const instructionCount = Array.isArray(script.instructions) ? script.instructions.length : 0;
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

refs.fileInput.addEventListener("change", async (event) => {
	const [file] = event.target.files;
	if (!file) {
		return;
	}

	try {
		const content = await readFileAsText(file);
		refs.code.value = content;

		if (!refs.name.value.trim()) {
			refs.name.value = file.name.replace(/\.[^.]+$/, "");
		}

		if (!refs.language.value.trim()) {
			refs.language.value = getLanguageFromFileName(file.name);
		}
	} catch (error) {
		alert(error.message);
	}
});

refs.form.addEventListener("submit", (event) => {
	event.preventDefault();

	const payload = {
		id: editingId || crypto.randomUUID(),
		name: sanitizeText(refs.name.value),
		language: sanitizeText(refs.language.value) || "Texto",
		description: sanitizeText(refs.description.value),
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

refs.clearForm.addEventListener("click", resetForm);

refs.stepPreset.addEventListener("change", () => {
	refs.stepCustom.value = "";
	syncStepFieldsFromControls(false);
});

refs.stepCustom.addEventListener("input", () => {
	syncStepFieldsFromControls(true);
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

refs.clearTesterBtn.addEventListener("click", () => {
	destroyTesterFrame();
	setTesterStatus("Listo", "idle");
	refs.testerMeta.textContent = "Salida limpiada";
	setTesterOutput("Esperando ejecucion...");
});

refs.exportBtn.addEventListener("click", () => {
	const blob = new Blob([JSON.stringify(library, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = "scriptforge-backup.json";
	anchor.click();
	URL.revokeObjectURL(url);
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
renderStepFields(0);
setActivePage("add");