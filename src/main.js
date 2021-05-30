import { main, elStatus, createInterpreterWorker, killInterpreterWorker, selectEsolang, interpreterWorker } from './app.js';
import { createFieldset } from './utils.js';
import { langOptions } from './esolangs/config.js';
import UserControl from "./classes/UserControl.js";
import IOConsole from "./classes/Console.js";

export var userControl, ioconsole;

function _main() {  
    // == SETUP HTML ==
    document.body.appendChild(main);

    let fieldset = createFieldset(main, 'Config');
    main.insertAdjacentElement('afterbegin', fieldset);
    let select = document.createElement("select"), p = document.createElement("p");
    fieldset.appendChild(p);
    p.insertAdjacentHTML('beforeend', 'Esolang: ');
    p.appendChild(select);
    select.insertAdjacentHTML('beforeend', `<option value=''>- Select One -</option>`);
    for (const name of Object.keys(langOptions)) {
        select.insertAdjacentHTML('beforeend', `<option value='${name}'>${name.replace(/\_/g, ' ')}</option>`);
    }
    select.addEventListener('change', () => {
        if (select.value.length !== 0) selectEsolang(select.value);
    });
    p.appendChild(select);
    let btnTerminate = document.createElement('button');
    btnTerminate.innerText = `Restart`;
    btnTerminate.title = "Terminate process and restart";
    btnTerminate.addEventListener('click', () => {
        killInterpreterWorker();
        ioconsole.print("\n> restart\n... Killed worker thread");
        createInterpreterWorker();
    });
    p.appendChild(btnTerminate);
    let btnClearScreen = document.createElement('button');
    btnClearScreen.innerText = `Clear Console`;
    btnClearScreen.addEventListener('click', () => ioconsole.clear());
    p.appendChild(btnClearScreen);
    let btnEditConsole = document.createElement('button');
    btnEditConsole.innerText = `Edit Console`;
    btnEditConsole.addEventListener('click', () => editConsoleUI());
    p.appendChild(btnEditConsole);
    p = document.createElement("p");
    fieldset.appendChild(p);
    p.innerText = "Current Status: ";
    elStatus.innerText = '-';
    p.appendChild(elStatus);

    // == Setup interpreterWorker
    createInterpreterWorker();

    // == User Control and Console
    let div = document.createElement("div");
    document.body.appendChild(div);

    fieldset = createFieldset(div, 'User Control');
    userControl = new UserControl(fieldset);

    fieldset = createFieldset(div, 'Console');
    ioconsole = new IOConsole(fieldset);

    // == Callbacks ==
    userControl.onChange(code => interpreterWorker.postMessage({ cmd: 'loadCode', code, }));
    userControl.onButtonPress((btn, args, obj) => {
        interpreterWorker.postMessage({ cmd: 'btnPress', btn, args });
    });
}

window.addEventListener('load', async () => {
    await _main();

    selectEsolang("length", false);
});