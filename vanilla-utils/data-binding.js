// Declarative two-way binding: binds inputs with [data-bind-value] to state objects

import { hexToRGB, RGBToHex } from './color.js';

// Simple two-way binding utility for a plain object property <-> input element
export function bindProperty(obj, prop, inputEl, options = {}) {
	const parse = options.parse ?? ((v) => (v === '' ? NaN : parseFloat(v)));
	const format = options.format ?? ((v) => (v == null ? '' : String(v)));
	
	if (!inputEl) throw new Error('input element required');
	
	// If the property is not configurable or already has an accessor, fallback to polling sync
	const desc = Object.getOwnPropertyDescriptor(obj, prop);
	if (desc && (!desc.configurable || desc.get || desc.set)) {
		// non-configurable or accessor property: bind user input -> property only
		inputEl.value = format(obj[prop]);
		const onInput = () => {
			const v = parse(inputEl.value);
			try { obj[prop] = v; } catch (e) { /* ignore write errors */ }
		};
		inputEl.addEventListener('input', onInput);
		return () => inputEl.removeEventListener('input', onInput);
	}
	
	// Replace the property with an accessor that updates the input element when changed
	let internal = obj[prop];
	Object.defineProperty(obj, prop, {
		configurable: true,
		enumerable: true,
		get() { return internal; },
		set(v) {
			internal = v;
			const formatted = format(v);
			if (document.activeElement !== inputEl) {
				inputEl.value = formatted;
			} else {
				// still update value so visual matches, but avoid moving caret unexpectedly
				inputEl.value = formatted;
			}
		}
	});
	
	// initialize input value
	inputEl.value = format(internal);
	
	// when user changes the input, update the object property
	const onInput = () => {
		const v = parse(inputEl.value);
		obj[prop] = v;
	};
	inputEl.addEventListener('input', onInput);
	
	// return an unbind function
	return function unbind() {
		inputEl.removeEventListener('input', onInput);
	};
}

const contexts = new Map(); // name -> object registered by the app
const unbinders = new WeakMap(); // element -> unbind function
const optionsBound = new WeakSet(); // elements with data-bind-options already processed
let domReady = document.readyState !== 'loading';


// Returns a parser function for an input element.
// Purpose: convert input string values to the desired JS value when writing
// into the bound state property.
// Examples:
// - Default number input: `data-bind-value="state.x"` on `<input type="range">` will use a numeric parser.
// - Color input (auto-detected): `<input type="color" data-bind-value="state.colorBegin">` parses hex -> [r,g,b].
// - Named parser override: `<input data-bind-parse="hexToRGB" ...>` will look up `hexToRGB`.
function pickParser(el) {
    const hint = el.dataset.bindParse;
	// named parser override (data-bind-parse="fnName")
	if (hint) {
		const fn = resolveNamedFunction(hint);
		if (typeof fn === 'function') return (v) => fn(v);
		console.warn(`[data-binding] parser not found: ${hint}`);
	}
	if (hint === 'int' || hint === 'integer') return (v) => parseInt(v ?? '', 10);
	if (hint === 'float' || hint === 'number') return (v) => parseFloat(v ?? '');
	if (el.type === 'number' || el.type === 'range') return (v) => parseFloat(v ?? '');
	// auto-detect color inputs
	if (el.type === 'color') return (v) => hexToRGB(v ?? '#000000');
	return (v) => v;
}


// Returns a formatter function for an input element.
// Purpose: convert a JS value from state into a string suitable for the
// input element when updating the UI.
// Examples:
// - Number inputs will format numbers to strings.
// - Color inputs (auto-detected) will format `[r,g,b]` arrays to `#RRGGBB`.
// - Named formatter override: `data-bind-format="RGBToHex"` will use that function.
function pickFormatter(el) {
    const hint = el.dataset.bindFormat;
	// named formatter override (data-bind-format="fnName")
	if (hint) {
		const fn = resolveNamedFunction(hint);
		if (typeof fn === 'function') return (v) => fn(v);
		console.warn(`[data-binding] formatter not found: ${hint}`);
	}
	if (hint === 'int' || hint === 'integer') return (v) => (v == null ? '' : String(Math.trunc(v)));
	if (hint === 'float' || hint === 'number') return (v) => (v == null ? '' : String(Number(v)));
	// auto-detect color inputs
	if (el.type === 'color') return (v) => (Array.isArray(v) ? RGBToHex(v) : (v == null ? '' : String(v)));
	return (v) => (v == null ? '' : String(v));
}

function resolveNamedFunction(name) {
	if (!name) return null;
	// dotted path: ctx.fn or ctx.sub.fn
	const parts = name.split('.').filter(Boolean);
	if (parts.length > 1) {
		const rootName = parts.shift();
		const root = contexts.get(rootName) ?? window[rootName];
		if (!root) return null;
		let cur = root;
		while (parts.length > 0) {
			cur = cur?.[parts.shift()];
			if (cur == null) return null;
		}
		return typeof cur === 'function' ? cur : null;
	}

	// single name: search registered contexts for a function property, then window, then local helpers
	for (const obj of contexts.values()) {
		if (obj && typeof obj[name] === 'function') return obj[name];
	}
	if (typeof window !== 'undefined' && typeof window[name] === 'function') return window[name];
	// built-in helpers
	if (name === 'hexToRGB') return hexToRGB;
	if (name === 'RGBToHex' || name === 'rgbToHex') return RGBToHex;
	return null;
}

function resolvePath(path) {
	const parts = path.split('.').filter(Boolean);
	if (parts.length === 0) return null;
	const rootName = parts.shift();
	const root = contexts.get(rootName) ?? window[rootName];
	if (!root) return null;
	let target = root;
	while (parts.length > 1) {
		target = target?.[parts.shift()];
		if (target == null) return null;
	}
	const prop = parts.shift();
	if (!prop) return null;
	return { target, prop };
}

// Generic updater: polls a read function and applies its result to the element.
// - `readFn` should return the raw value to be applied each frame
// - `applyFn` receives the raw value and should update the element accordingly
// - `options.format` (optional) will be used to format the raw value before apply
function bindStateUpdater(el, readFn, applyFn, options = {}) {
	if (!el || typeof readFn !== 'function' || typeof applyFn !== 'function') return;
	if (unbinders.has(el)) return;

	const format = options.format ?? ((v) => (v == null ? '' : String(v)));

	// initial apply
	try {
		const raw = readFn();
		applyFn(format(raw), raw);
	} catch (e) {
		console.warn('[data-binding] Error evaluating readFn', e);
	}

	let rafId = null;
	const tick = () => {
		try {
			const raw = readFn();
			applyFn(format(raw), raw);
		} catch (e) {
			console.warn('[data-binding] Error evaluating readFn', e);
		}
		rafId = requestAnimationFrame(tick);
	};
	rafId = requestAnimationFrame(tick);

	unbinders.set(el, () => cancelAnimationFrame(rafId));
}

// Usage: <span data-bind-text="state.t.toFixed(2)"></span>
// Evaluates the JavaScript expression in the attribute value against registered
// contexts (see `registerBindingContext`) and updates the element's innerText
// reactively.
function bindElementText(el) {
	const expr = el.getAttribute('data-bind-text');
	if (!expr || unbinders.has(el)) return;

	const contextNames = Array.from(contexts.keys());
	const contextValues = contextNames.map(name => contexts.get(name));

	let evalFn;
	try {
		evalFn = new Function(...contextNames, `return ${expr};`);
	} catch (e) {
		console.warn(`[data-binding] Invalid expression: ${expr}`, e);
		return;
	}

	const readFn = () => evalFn(...contextValues);
	const formatter = pickFormatter(el);
	const applyFn = (formatted /*, raw */) => { el.innerText = formatted; };

	bindStateUpdater(el, readFn, applyFn, { format: formatter });
}

// Usage: <kbd data-bind-class="pressed:state.keys.ArrowUp active:state.t>0.5"></kbd>
// The `data-bind-class` attribute accepts space-separated token pairs
// `className:expression`. Each expression is evaluated against registered
// contexts and the corresponding class is added/removed based on truthiness.
function bindElementClass(el) {
	const attrValue = el.getAttribute('data-bind-class');
	if (!attrValue || unbinders.has(el)) return;

	const tokens = attrValue.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return;

	const bindings = tokens.map((token) => {
		const idx = token.indexOf(':');
		if (idx === -1) return null;
		const className = token.substring(0, idx).trim();
		const expr = token.substring(idx + 1).trim();
		if (!className || !expr) return null;
		return { className, expr };
	}).filter(Boolean);

	if (bindings.length === 0) return;

	const contextNames = Array.from(contexts.keys());
	const contextValues = contextNames.map(name => contexts.get(name));

	const evalFns = bindings.map(({ className, expr }) => {
		try {
			const fn = new Function(...contextNames, `return ${expr};`);
			return { className, fn };
		} catch (e) {
			console.warn(`[data-binding] Invalid class expression: ${expr}`, e);
			return { className, fn: null };
		}
	});

	const readFn = () => evalFns.map(({ fn }) => {
		if (!fn) return false;
		try { return Boolean(fn(...contextValues)); } catch (e) { console.warn('[data-binding] Error evaluating class expr', e); return false; }
	});

	const applyFn = (_formatted, rawArray) => {
		for (let i = 0; i < evalFns.length; i++) {
			const { className } = evalFns[i];
			const truthy = rawArray[i];
			if (truthy) el.classList.add(className); else el.classList.remove(className);
		}
	};

	bindStateUpdater(el, readFn, applyFn, { format: (v) => v });
}

// Usage: <input data-bind-value="state.t"> after calling
// `registerBindingContext('state', appState)` from your module.
// Binds an input element's value two-way with the object property.
function bindElementValue(el) {
	const path = el.getAttribute('data-bind-value');
	if (!path || unbinders.has(el)) return;
	const resolved = resolvePath(path);
	if (!resolved) {
		console.warn(`[data-binding] Could not resolve path: ${path}`);
		return;
	}
	const { target, prop } = resolved;
	const unbind = bindProperty(target, prop, el, {
		parse: pickParser(el),
		format: pickFormatter(el)
	});
	unbinders.set(el, unbind);
}

// Usage: <select data-bind-options="state.items" data-bind-option-value="id" data-bind-option-content="label">
// Generates <option> elements from an array. `data-bind-option-value` names the property used
// as the option's value attribute; the special token `$` uses the item's index instead.
// `data-bind-option-content` names the property used for the option's text content; if omitted,
// String(item) is used. Re-generates options without polling when the array property is replaced.
function bindElementOptions(el) {
	const arrayPath = el.getAttribute('data-bind-options');
	if (!arrayPath || optionsBound.has(el)) return;

	const valueHint = el.getAttribute('data-bind-option-value') ?? '$';
	const contentProp = el.getAttribute('data-bind-option-content') ?? null;

	const resolved = resolvePath(arrayPath);
	if (!resolved) {
		console.warn(`[data-binding] Could not resolve options path: ${arrayPath}`);
		return;
	}

	const { target, prop } = resolved;

	function generateOptions(arr) {
		el.innerHTML = '';
		if (!Array.isArray(arr)) return;
		for (let i = 0; i < arr.length; i++) {
			const item = arr[i];
			const opt = document.createElement('option');
			opt.value = valueHint === '$' ? String(i) : String(item?.[valueHint] ?? i);
			opt.textContent = contentProp != null
				? String(item?.[contentProp] ?? item)
				: String(item);
			el.appendChild(opt);
		}
	}

	let internal = target[prop];
	generateOptions(internal);
	optionsBound.add(el);

	// Use an accessor so options are regenerated if the array reference is replaced
	const desc = Object.getOwnPropertyDescriptor(target, prop);
	if (desc && (!desc.configurable || desc.get || desc.set)) return;
	try {
		Object.defineProperty(target, prop, {
			configurable: true,
			enumerable: true,
			get() { return internal; },
			set(v) {
				internal = v;
				generateOptions(v);
			}
		});
	} catch (e) {
		// cannot wrap property — options won't update on reassignment
	}
}

// Simple two-way binding for existing <select> elements.
// Usage: <select data-bind-select="state.prop">...</select>
// Behavior: when the select changes, the bound property is set to the
// selected option's value (attempts JSON.parse, falls back to string).
// When the bound property changes, the select's value is updated.
function bindElementSelect(el) {
	const path = el.getAttribute('data-bind-select');
	if (!path || unbinders.has(el)) return;
	const resolved = resolvePath(path);
	if (!resolved) {
		console.warn(`[data-binding] Could not resolve select path: ${path}`);
		return;
	}
	// prefer accessor-based sync to avoid polling: try to replace the
	// property with a getter/setter that updates the select when changed.
	const parse = pickParser(el);
	const format = pickFormatter(el);

	let internal = resolved.target[resolved.prop];
	try {
		Object.defineProperty(resolved.target, resolved.prop, {
			configurable: true,
			enumerable: true,
			get() { return internal; },
			set(v) {
				internal = v;
				try { el.value = format(v); } catch { el.value = String(v); }
			}
		});
	} catch (e) {
		// cannot redefine the property: bind user changes only (no polling)
		el.value = format(internal);
		const onChange = () => {
			const opt = el.options[el.selectedIndex];
			if (!opt) return;
			const parsed = parse(opt.value);
			try { resolved.target[resolved.prop] = parsed; } catch (e) { /* ignore */ }
		};
		el.addEventListener('change', onChange);
		unbinders.set(el, () => { el.removeEventListener('change', onChange); unbinders.delete(el); });
		return;
	}

	// initialize select value from current property
	try { el.value = format(internal); } catch { el.value = String(internal); }

	// when user selects, parse and write back to the property
	const onChange = () => {
		const opt = el.options[el.selectedIndex];
		if (!opt) return;
		const parsed = parse(opt.value);
		try { resolved.target[resolved.prop] = parsed; } catch (e) { /* ignore write errors */ }
	};
	el.addEventListener('change', onChange);

	unbinders.set(el, () => { el.removeEventListener('change', onChange); unbinders.delete(el); });
}

// Usage: <input type="checkbox" data-bind-checked="state.flag">
// Binds an input's `checked` (boolean) to a property on a registered context.
// No polling: uses a property accessor when possible, otherwise listens to change events.
function bindElementChecked(el) {
	const path = el.getAttribute('data-bind-checked');
	if (!path || unbinders.has(el)) return;
	const resolved = resolvePath(path);
	if (!resolved) {
		console.warn(`[data-binding] Could not resolve path: ${path}`);
		return;
	}

	const { target, prop } = resolved;

	// initialize internal value
	let internal = target[prop];
	try {
		Object.defineProperty(target, prop, {
			configurable: true,
			enumerable: true,
			get() { return internal; },
			set(v) {
				internal = v;
				try { el.checked = Boolean(v); } catch (e) { /* ignore DOM write errors */ }
			}
		});
	} catch (e) {
		// cannot redefine property: fallback to listen-only binding
		try { el.checked = Boolean(internal); } catch (_) {}
		const onChange = () => {
			try { target[prop] = el.checked; } catch (e) { /* ignore write errors */ }
		};
		el.addEventListener('change', onChange);
		unbinders.set(el, () => { el.removeEventListener('change', onChange); unbinders.delete(el); });
		return;
	}

	// initialize element from current value
	try { el.checked = Boolean(internal); } catch (e) { /* ignore */ }

	// when user toggles the checkbox, write back to the property
	const onChange = () => {
		try { target[prop] = el.checked; } catch (e) { /* ignore write errors */ }
	};
	el.addEventListener('change', onChange);
	unbinders.set(el, () => { el.removeEventListener('change', onChange); unbinders.delete(el); });
}

export function applyDeclarativeBindings() {
	// generate options before binding select values so options exist when value is initialized
	document.querySelectorAll('[data-bind-options]').forEach(bindElementOptions);
	// lightweight select binding: two-way bind select's selected value
	document.querySelectorAll('[data-bind-select]').forEach(bindElementSelect);
	// regular value bindings
	document.querySelectorAll('[data-bind-value]').forEach(bindElementValue);
	document.querySelectorAll('[data-bind-text]').forEach(bindElementText);
	document.querySelectorAll('[data-bind-class]').forEach(bindElementClass);
	// checkbox checked bindings
	document.querySelectorAll('[data-bind-checked]').forEach(bindElementChecked);
}

export function registerBindingContext(name, obj) {
	if (!name || typeof obj !== 'object') {
		console.warn('[data-binding] registerBindingContext requires a name and object');
		return;
	}
	contexts.set(name, obj);
	if (domReady) applyDeclarativeBindings();
}

document.addEventListener('DOMContentLoaded', () => {
	domReady = true;
	applyDeclarativeBindings();
});
