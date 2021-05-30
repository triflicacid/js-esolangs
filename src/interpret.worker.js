import BrainfuckInterpreter from "./esolangs/Brainfuck/Interpreter.js";
import ElementInterpreter from "./esolangs/Element/Interpreter.js";
import LengthInterpreter from "./esolangs/Length/Interpreter.js";
import BefungeInterpreter from "./esolangs/Befunge/Interpreter.js";
import { num } from "./utils.js";

var interpreter; // Code interpreter
var activeBlocker; // Blocker object. May be resolve by cmd:'unblock'
var interpreting = false;
const statusStack = [];
var codeCache; // Store code from 'loadCode' event

function pushStatus(status) {
    statusStack.push(status);
    self.postMessage({ cmd: 'status', status });
}
function popStatus() {
    let status = '-';
    if (statusStack.length !== 0) {
        statusStack.pop();
        if (statusStack.length !== 0) status = statusStack[0];
    }
    self.postMessage({ cmd: 'status', status });
}

/** Create esolang interpreter  */
function createInterpreter(lang, opts) {
    let i;
    if (lang === "brainfuck") {
        i = new BrainfuckInterpreter(opts.numType, opts.reelLength);
        if (opts.updateVisuals) {
            i._callbackUpdateInstructionPointer = value => {
                self.postMessage({ cmd: 'updateInstructionPtr', value });
                self.postMessage({ cmd: 'updateObject', name: 'pointers', action: 'set', key: 'ip', value });
            };
            i._callbackUpdateDataPointer = value => {
                self.postMessage({ cmd: 'updateDataPtr', value });
                self.postMessage({ cmd: 'updateObject', name: 'pointers', action: 'set', key: 'data', value });
            };
            i._callbackSetData = value => self.postMessage({ cmd: 'updateData', value });
            i._callbackSetAllData = value => self.postMessage({ cmd: 'updateAllData', value });
        }
        i._callbackInput = inputBlocker => {
            pushStatus('Requesting GETCH');
            activeBlocker = inputBlocker;
            self.postMessage({ cmd: 'reqGetch' });
        };
    } else if (lang === 'element') {
        i = new ElementInterpreter();
        i.autovivification = opts.autovivification === true;
        if (opts.updateVisuals) {
            i._callbackUpdateStack = (stack, type, value) => self.postMessage({ cmd: 'updateStack', stack, type, value });
            i._callbackUpdateVars = (symbol, action, value) => self.postMessage({ cmd: 'updateObject', name: 'vars', key: symbol, action, value });
            i._callbackUpdatePos = value => self.postMessage({ cmd: 'updateObject', name: 'pointers', action: 'set', key: 'ip', value });
        }
        i._callbackInput = inputBlocker => {
            pushStatus('Requesting Input');
            activeBlocker = inputBlocker;
            self.postMessage({ cmd: 'reqInput' });
        };
    } else if (lang === 'length') {
        i = new LengthInterpreter();
        i.comments = opts.comments === true;
        i.debug = opts.debug === true;
        if (opts.updateVisuals) {
            i._callbackUpdateStack = (type, value) => self.postMessage({ cmd: 'updateStack', type, value });
            i._callbackUpdateLineN = value => self.postMessage({ cmd: 'updateObject', name: 'pointers', action: 'set', key: 'ip', value });
        }
        i._callbackInput = inputBlocker => {
            pushStatus('Requesting GETCH');
            activeBlocker = inputBlocker;
            self.postMessage({ cmd: 'reqGetch' });
        };
    } else if (lang === 'befunge') {
        i = new BefungeInterpreter();
        i.debug = opts.debug === true;
        i.wrapLimit = num(opts.wrapLimit);
        i.selfModification = opts.selfModification === true;
        if (opts.updateVisuals) {
            i._callbackUpdateStack = (type, value) => self.postMessage({ cmd: 'updateStack', type, value });
            i._callbackUpdatePtr = (key, value) => self.postMessage({ cmd: 'updateObject', name: 'pointers', action: 'set', key, value });
        }
        i._callbackInput = (mode, inputBlocker) => {
            activeBlocker = inputBlocker;
            if (mode === 'getch') {
                pushStatus('Requesting GETCH');
                self.postMessage({ cmd: 'reqGetch' });
            } else {
                pushStatus('Requesting Input');
                self.postMessage({ cmd: 'reqInput' });
            }
        };
    } else {
        throw new TypeError(`Unknown language '${lang}'`);
    }
    // Add callback handler for output (as it is so common)
    if (i._callbackOutput) i._callbackOutput = msg => self.postMessage({ cmd: 'print', msg });
    postMessage("Created interpreter for " + lang);

    // Load code if there is any in the cache
    if (codeCache !== undefined) {
        loadCode(codeCache);
        codeCache = undefined;
    }

    return i;
}

globalThis.onmessage = async (event) => {
    const data = event.data;
    if (data.cmd) {
        if (data.cmd === 'setEsolang') {
            try {
                interpreter = createInterpreter(data.lang, data.opts);
                const payload = { cmd: 'setEsolang', lang: data.lang, updateVisuals: data.opts.updateVisuals };
                if (data.opts.updateVisuals && interpreter instanceof BrainfuckInterpreter) payload.numArray = interpreter._data;
                self.postMessage(payload); // Render stuff on main thread
            } catch (e) {
                console.error(e);
                let error = new Error(`Error whilst creating interpreter for '${data.lang}':\n${e}`);
                postMessage({ cmd: 'error', error });
            }
        } else if (data.cmd === 'loadCode') {
            loadCode(data.code);
        } else if (data.cmd === 'btnPress') {
            // Press button in CodeInput
            switch (data.btn) {
                case 'reset':
                    interpreter.reset();
                    postMessage({ cmd: 'print', msg: `> interpreter reset --lang ${interpreter.LANG}\n` });
                    break;
                case 'minify': {
                    postMessage({ cmd: 'print', msg: `> interpreter minify --lang ${interpreter.LANG} --file ./userInput\n` });
                    if (typeof interpreter.minifyCode === 'function') {
                        let code = interpreter.minifyCode(data.args.code);
                        postMessage({ cmd: 'minifiedCode', code, });
                    } else {
                        postMessage({ cmd: 'error', error: new TypeError(`Unable to minify code: interpreter provides no method`) });
                    }
                    break;
                }
                case 'interpret':
                    // Interpret until termination
                    await interpret(data.args.code);
                    break;
                case 'step':
                    await step();
                    break;
                case 'textToCode': {
                    textToCode(data.args.text);
                    break;
                }
                default:
                    throw new Error(`cmd:'buttonPress': Unknown button '${data.btn}'`);
            }   
        } else if (data.cmd === 'unblock') {
            // Request unblock of "activeBlocker"
            if (activeBlocker) {
                activeBlocker.unblock(data.value);
                activeBlocker = undefined;
                if (data.unpushStatus !== false) popStatus();
            } else {
                throw new Error(`Command 'unblock': no active block to unblock`);
            }
        } else {
            console.log(event);
            throw new Error(`Worker: unknown command '${data.cmd}'`);
        }
    } else {
        console.log(event);
        throw new Error(`Worker: Unknown event`);
    }
};

/** Try loading code */
function loadCode(code) {
    if (interpreter) {
        try {
            interpreter.setCode(code);
        } catch (e) {
            const error = new Error(`Error whilst loading ${interpreter.LANG} code:\n${e}`);
            postMessage({ cmd: 'error', error });
        }
    } else {
        codeCache = code;
    }
}

/** Interpret code given */
async function interpret(code) {
    if (interpreting) throw new Error(`Worker is already busy interpreting!`);
    postMessage({ cmd: 'print', msg: `\n> interpreter execute --lang ${interpreter.LANG} --file ./userInput\n` });
    pushStatus(`Interpreting ${interpreter.LANG}`);
    interpreting = true;
    if (typeof code === 'string') loadCode(code);
    let error, timeStart = Date.now();
    try {
        await interpreter.interpret(code);
    } catch (e) {
        error = e;
    }
    if (error) self.postMessage({ cmd: 'error', error });
    let timeEnd = Date.now() - timeStart, str = `Execution terminated with exit code ${error === undefined ? 0 : 1} (${timeEnd} ms)`;
    postMessage({ cmd: 'print', msg: '\n... ' + str });
    popStatus();
    interpreting = false;
}

/** Interpret: One Step */
async function step() {
    // Interpret one step only
    if (interpreting) throw new Error(`Worker is already busy interpreting!`);
    pushStatus(`Stepping ${interpreter.LANG}`);
    interpreting = true;
    let error, cont;
    try {
        cont = await interpreter.step();
    } catch (e) {
        error = e;
    }
    popStatus();
    if (error) self.postMessage({ cmd: 'error', error });
    if (!cont) self.postMessage({ cmd: 'print', msg: `Unable to complete step\n` });
    interpreting = false;
}

function textToCode(text) {
    postMessage({ cmd: 'print', msg: "> interpreter --from-text ./userText.txt --lang " + interpreter.LANG + "\n" });
    if (interpreter && typeof interpreter.constructor.textToCode === 'function') {
        let code = interpreter.constructor.textToCode(text);
        postMessage({ cmd: 'textToCode', lang: interpreter.LANG, code });
    } else {
        let error = new Error(`${interpreter.LANG} interpreter provides no text-to-code functionality`);
        postMessage({ cmd: 'error', error });
    }
}