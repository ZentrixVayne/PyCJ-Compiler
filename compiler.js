/**
 * PyCJ Language Engine Core Specification (v1.6 Final - Arrays Patched)
 * Added: Model Versioning (v1 vs v1.1) and LocalStorage Persistence.
 * Added: Automatic Version Upgrade Handlers via Custom Themed Modal.
 * Fixed: Fully implemented missing layout tabs, hamburger, theme toggles, code vault copying, and welcome lifecycle handlers.
 * Fixed: Auto-closing mapping for curly braces {}.
 * Added: Professional Array Manipulation (add, remove, max, min) across global scope, structures, and p-strings.
 */

window.PyCJTerminalIO = {
    clear: function() {
        const consoleEl = document.getElementById('console');
        if (consoleEl) consoleEl.innerHTML = '';
    },

    printLoader: function() {
        const consoleEl = document.getElementById('console');
        if (!consoleEl) return;
        
        const loader = document.createElement('div');
        loader.id = 'terminal-loader';
        loader.className = 'console-line terminal-loading-state';
        loader.innerHTML = `<span class="spinner-icon">⏳</span> Compiling source code structures safely...`;
        consoleEl.appendChild(loader);
    },

    removeLoader: function() {
        const loader = document.getElementById('terminal-loader');
        if (loader) loader.remove();
    },

    printStdout: function(...args) {
        const consoleEl = document.getElementById('console');
        if (!consoleEl) return;

        const fullText = args.map(arg => {
            if (arg === null) return 'null';
            if (arg === undefined) return 'undefined';
            if (typeof arg === 'object') return JSON.stringify(arg);
            return String(arg);
        }).join(' ');

        const rows = fullText.split('\n');
        rows.forEach(rowText => {
            const line = document.createElement('div');
            line.className = 'console-line';
            line.textContent = rowText;
            consoleEl.appendChild(line);
        });

        consoleEl.scrollTop = consoleEl.scrollHeight;
    },

    printError: function(errType, msg, lineNum, fix) {
        const consoleEl = document.getElementById('console');
        if (!consoleEl) return;

        const box = document.createElement('div');
        box.className = 'console-error-box';
        box.innerHTML = `
            <div class="error-title">[${errType}] Line ${lineNum}</div>
            <div class="error-msg">${msg}</div>
            <div class="error-fix">💡 Fix Strategy: ${fix}</div>
        `;
        consoleEl.appendChild(box);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    },

    printSuccess: function() {
        const consoleEl = document.getElementById('console');
        if (!consoleEl) return;

        const line = document.createElement('div');
        line.className = 'console-success-box';
        line.textContent = '✨ Program executed successfully.';
        consoleEl.appendChild(line);

        const returnLine = document.createElement('div');
        returnLine.className = 'console-return-line';
        returnLine.textContent = '[Process completed with exit code 0]';
        consoleEl.appendChild(returnLine);
        
        consoleEl.scrollTop = consoleEl.scrollHeight;
    },

    promptInput: function(type, promptText) {
        return new Promise((resolve) => {
            const consoleEl = document.getElementById('console');
            if (!consoleEl) return resolve(null);

            const container = document.createElement('div');
            container.className = 'console-input-container';

            const promptLabel = document.createElement('span');
            promptLabel.className = 'console-prompt-text';
            promptLabel.textContent = promptText;

            const inputField = document.createElement('input');
            inputField.type = 'text';
            inputField.className = 'console-input-field';

            container.appendChild(promptLabel);
            container.appendChild(inputField);
            consoleEl.appendChild(container);

            inputField.focus();
            consoleEl.scrollTop = consoleEl.scrollHeight;

            inputField.addEventListener('keydown', function handleInput(e) {
                if (e.key === 'Enter') {
                    const rawVal = inputField.value;
                    inputField.disabled = true;
                    inputField.removeEventListener('keydown', handleInput);

                    let processedValue = rawVal;
                    if (type === 'int') {
                        processedValue = parseInt(rawVal, 10);
                        if (isNaN(processedValue)) processedValue = 0;
                    } else if (type === 'float') {
                        processedValue = parseFloat(rawVal);
                        if (isNaN(processedValue)) processedValue = 0.0;
                    } else if (type === 'bool') {
                        const sanitized = rawVal.trim().toLowerCase();
                        processedValue = (sanitized === 'true' || sanitized === '1' || sanitized === 'yes');
                    }
                    
                    container.remove();
                    window.PyCJTerminalIO.printStdout(`${promptText}${rawVal}`);
                    resolve(processedValue);
                }
            });
        });
    }
};

class PyCJCompiler {
    constructor(sourceCode, version = 'v1') {
        this.source = sourceCode;
        this.scopes = [new Set()]; 
        this.blockStack = ['global']; 
        this.version = version; 
    }

    raiseError(type, message, line, fix) {
        const err = new Error(message);
        err.type = type;
        err.line = line;
        err.fix = fix;
        throw err;
    }

    hasVariableInAnyScope(id) {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            if (this.scopes[i].has(id)) return true;
        }
        return false;
    }

    hasVariableInLocalScope(id) {
        return this.scopes[this.scopes.length - 1].has(id);
    }

    addVariableToLocalScope(id) {
        this.scopes[this.scopes.length - 1].add(id);
    }

    smartCommaSplit(str) {
        let parts = [];
        let current = "";
        let depth = 0;
        for (let i = 0; i < str.length; i++) {
            let char = str[i];
            if (char === '(' || char === '[' || char === '{') depth++;
            else if (char === ')' || char === ']' || char === '}') depth--;
            
            if (char === ',' && depth === 0) {
                parts.push(current);
                current = "";
            } else {
                current += char;
            }
        }
        parts.push(current);
        return parts;
    }

    compile() {
        const rawLines = this.source.split('\n');
        const lines = [];
        let accumulatedLine = "";

        for (let i = 0; i < rawLines.length; i++) {
            let line = rawLines[i];
            let trimmed = line.trim();
            accumulatedLine += (accumulatedLine ? "\n" : "") + line;

            let pCount = 0;
            let inString = false;
            let stringChar = null;
            for (let j = 0; j < accumulatedLine.length; j++) {
                let c = accumulatedLine[j];
                if ((c === '"' || c === "'") && (j === 0 || accumulatedLine[j-1] !== '\\')) {
                    if (!inString) {
                        inString = true;
                        stringChar = c;
                    } else if (c === stringChar) {
                        inString = false;
                    }
                }
                if (!inString) {
                    if (c === '(') pCount++;
                    if (c === ')') pCount--;
                }
            }

            if (pCount <= 0 || trimmed.endsWith('{')) {
                lines.push(accumulatedLine);
                accumulatedLine = "";
            }
        }
        if (accumulatedLine) {
            lines.push(accumulatedLine);
        }

        const compiledJSOutput = [];
        compiledJSOutput.push("let __pycj_loop_guard = 0;");
        
        let pendingSingleLineClosures = 0;

        for (let idx = 0; idx < lines.length; idx++) {
            const currentLineNumber = idx + 1;
            let currentLineText = lines[idx];
            let operationalText = currentLineText.trim();

            if (operationalText === "}" || operationalText.startsWith("}")) {
                if (operationalText.replace(/#.*/, '').replace(/\/\/.*/, '').trim() === "}") {
                    if (this.scopes.length > 1) {
                        this.scopes.pop();
                        let bType = this.blockStack.pop();
                        if (bType === 'structure') {
                            const indentation = currentLineText.match(/^(\s*)/)[1] || '';
                            compiledJSOutput.push(`${indentation}    return __struct_obj;\n${currentLineText}`);
                            continue;
                        }
                    }
                    compiledJSOutput.push(currentLineText);
                    continue;
                }
            }

            if (operationalText.startsWith('#') || operationalText.startsWith('//') || operationalText === "") {
                compiledJSOutput.push(currentLineText);
                continue;
            }

            if (operationalText.endsWith(';')) {
                operationalText = operationalText.slice(0, -1).trim();
            }

            let stringBank = [];
            currentLineText = currentLineText.replace(/([pP]?)(["'])(?:\\.|[^\\])*?\2/g, (match) => {
                stringBank.push(match);
                return `__PYCJ_STR_TOKEN_${stringBank.length - 1}__`;
            });
            operationalText = currentLineText.trim();

            // Core Logic Translations
            currentLineText = currentLineText.replace(/\band\b/gi, '&&');
            currentLineText = currentLineText.replace(/\bor\b/gi, '||');
            currentLineText = currentLineText.replace(/\bnot\b/gi, '!');

            // PyCJ Professional Array Method Translations
            currentLineText = currentLineText.replace(/([a-zA-Z_][a-zA-Z0-9_\.]*)\.max\([^)]*\)/g, 'Math.max(...$1)');
            currentLineText = currentLineText.replace(/([a-zA-Z_][a-zA-Z0-9_\.]*)\.min\([^)]*\)/g, 'Math.min(...$1)');
            currentLineText = currentLineText.replace(/([a-zA-Z_][a-zA-Z0-9_\.]*)\.add\(([^)]+)\)/g, '$1.push($2)');
            currentLineText = currentLineText.replace(/([a-zA-Z_][a-zA-Z0-9_\.]*)\.remove\(([^)]+)\)/g, '(function(a,v){let i=a.indexOf(v);if(i!==-1)a.splice(i,1);return a;})($1,$2)');

            operationalText = currentLineText.trim();

            stringBank = stringBank.map(str => {
                if (/^p"/i.test(str)) {
                    let body = str.slice(2, -1);
                    let mappedBody = body.replace(/\{([^}]+)\}/g, (match, expr) => {
                        let cleanExpr = expr.replace(/\band\b/gi, '&&')
                                            .replace(/\bor\b/gi, '||')
                                            .replace(/\bnot\b/gi, '!')
                                            .replace(/([a-zA-Z_][a-zA-Z0-9_\.]*)\.max\([^)]*\)/g, 'Math.max(...$1)')
                                            .replace(/([a-zA-Z_][a-zA-Z0-9_\.]*)\.min\([^)]*\)/g, 'Math.min(...$1)')
                                            .replace(/([a-zA-Z_][a-zA-Z0-9_\.]*)\.add\(([^)]+)\)/g, '$1.push($2)')
                                            .replace(/([a-zA-Z_][a-zA-Z0-9_\.]*)\.remove\(([^)]+)\)/g, '(function(a,v){let i=a.indexOf(v);if(i!==-1)a.splice(i,1);return a;})($1,$2)');
                        return `\${${cleanExpr}}`;
                    });
                    return `\`${mappedBody}\``;
                }
                return str;
            });

            let generatedStatement = false;
            let currentLineAssembled = "";

            const outputMatch = operationalText.match(/^output\s*\(([\s\S]*)\)/i);
            if (outputMatch) {
                let innerArgs = outputMatch[1];
                
                if (innerArgs.includes('\\n')) {
                    innerArgs = innerArgs.replace(/\\n/g, ' + "\\n" + ');
                }

                stringBank.forEach((str, index) => {
                    innerArgs = innerArgs.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });
                const indentation = currentLineText.match(/^(\s*)/)[1];
                currentLineAssembled = `${indentation}window.PyCJTerminalIO.printStdout(${innerArgs});`;
                generatedStatement = true;
            }

            else if (operationalText.match(/^ask\s+(str|int|float|bool)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)/i)) {
                const askMatch = operationalText.match(/^ask\s+(str|int|float|bool)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)/i);
                let [_, dataType, identifier, promptMsg] = askMatch;
                
                stringBank.forEach((str, index) => {
                    promptMsg = promptMsg.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });
                const indentation = currentLineText.match(/^(\s*)/)[1];

                if (this.hasVariableInLocalScope(identifier)) {
                    currentLineAssembled = `${indentation}${identifier} = await window.PyCJTerminalIO.promptInput('${dataType.toLowerCase()}', ${promptMsg});`;
                } else {
                    this.addVariableToLocalScope(identifier);
                    currentLineAssembled = `${indentation}let ${identifier} = await window.PyCJTerminalIO.promptInput('${dataType.toLowerCase()}', ${promptMsg});`;
                }
                generatedStatement = true;
            } 

            else if (operationalText.toLowerCase().startsWith('function ')) {
                if (this.version === 'v1') {
                    this.raiseError("Version Error", "Functions are not available in v1.", currentLineNumber, "SWITCH_V1_1");
                }

                const funcMatch = operationalText.match(/^function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*\{?/i);
                if (funcMatch) {
                    let funcName = funcMatch[1];
                    let args = funcMatch[2];
                    let hasBracket = operationalText.endsWith('{');
                    const indentation = currentLineText.match(/^(\s*)/)[1];
                    
                    currentLineAssembled = `${indentation}function ${funcName}(${args}) {`;
                    
                    if (!hasBracket) pendingSingleLineClosures++;
                    generatedStatement = false;
                    this.scopes.push(new Set());
                    this.blockStack.push('function');
                    
                    let argList = this.smartCommaSplit(args);
                    argList.forEach(arg => {
                        let argName = arg.trim();
                        if (argName) this.addVariableToLocalScope(argName);
                    });
                }
            }

            else if (operationalText.toLowerCase().startsWith('return ') || operationalText.toLowerCase() === 'return') {
                let retVal = operationalText.toLowerCase().startsWith('return ') ? operationalText.substring(7).trim() : "";
                stringBank.forEach((str, index) => {
                    retVal = retVal.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });
                const indentation = currentLineText.match(/^(\s*)/)[1];
                currentLineAssembled = retVal ? `${indentation}return ${retVal};` : `${indentation}return;`;
                generatedStatement = true;
            }

            else if (operationalText.toLowerCase().startsWith('structure ')) {
                if (this.version === 'v1') {
                    this.raiseError("Version Error", "Structures are not available in v1.", currentLineNumber, "SWITCH_V1_1");
                }

                const structMatch = operationalText.match(/^structure\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{?/i);
                if (structMatch) {
                    let structName = structMatch[1];
                    let hasBracket = operationalText.endsWith('{');
                    const indentation = currentLineText.match(/^(\s*)/)[1];
                    
                    currentLineAssembled = `${indentation}function ${structName}() {\n${indentation}    let __struct_obj = {};`;
                    
                    if (!hasBracket) pendingSingleLineClosures++;
                    generatedStatement = false;
                    this.scopes.push(new Set());
                    this.blockStack.push('structure');
                }
            }

            else if (operationalText.toLowerCase().startsWith('for ') || operationalText.toLowerCase().startsWith('for(')) {
                const forMatch = operationalText.match(/^for\s*\(([^)]+)\)/i);
                if (forMatch) {
                    let innerContent = forMatch[1];
                    let loopParts = this.smartCommaSplit(innerContent);
                    
                    if (loopParts.length === 3) {
                        let initialization = loopParts[0].trim();
                        let condition = loopParts[1].trim();
                        let increment = loopParts[2].trim();

                        let loopVarName = "";
                        if (initialization.toLowerCase().startsWith('imagine ')) {
                            let rawVarExpr = initialization.substring(8).trim();
                            let nameMatch = rawVarExpr.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
                            if (nameMatch) {
                                loopVarName = nameMatch[1];
                            }
                            initialization = 'let ' + rawVarExpr;
                        }

                        stringBank.forEach((str, index) => {
                            initialization = initialization.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                            condition = condition.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                            increment = increment.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                        });

                        let hasBracket = operationalText.endsWith('{');
                        const indentation = currentLineText.match(/^(\s*)/)[1];
                        
                        currentLineAssembled = `${indentation}for (${initialization}; ${condition}; ${increment}) { if (++__pycj_loop_guard > 1000) throw new Error("Infinite limit reached! Process halted to prevent crash.");`;
                        
                        if (!hasBracket) {
                            pendingSingleLineClosures++;
                        }
                        generatedStatement = false;
                        
                        this.scopes.push(new Set());
                        this.blockStack.push('normal');
                        if (loopVarName) {
                            this.addVariableToLocalScope(loopVarName);
                        }
                    } else {
                        this.raiseError("Syntax Error", "For loop requires exactly 3 sections split by commas.", currentLineNumber, "Format correctly: for (imagine i = 1 , i <= 5 , i ++)");
                    }
                }
            }

            else if (operationalText.toLowerCase().startsWith('repeat ')) {
                let loopCond = operationalText.substring(7).trim();
                let hasBracket = loopCond.endsWith('{');
                if (hasBracket) {
                    loopCond = loopCond.slice(0, -1).trim();
                }
                stringBank.forEach((str, index) => {
                    loopCond = loopCond.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });
                const indentation = currentLineText.match(/^(\s*)/)[1];
                
                currentLineAssembled = `${indentation}while (${loopCond}) { if (++__pycj_loop_guard > 1000) throw new Error("Infinite limit reached! Process halted to prevent crash.");`;
                
                if (!hasBracket) {
                    pendingSingleLineClosures++;
                }
                generatedStatement = false;
                this.scopes.push(new Set());
                this.blockStack.push('normal');
            }

            else if (operationalText.toLowerCase().startsWith('if ')) {
                let cond = operationalText.substring(3).trim();
                let hasBracket = cond.endsWith('{');
                if (hasBracket) cond = cond.slice(0, -1).trim();
                stringBank.forEach((str, index) => {
                    cond = cond.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });
                const indentation = currentLineText.match(/^(\s*)/)[1];
                currentLineAssembled = `${indentation}if (${cond}) {`;
                
                if (!hasBracket) {
                    pendingSingleLineClosures++;
                }
                generatedStatement = false;
                this.scopes.push(new Set());
                this.blockStack.push('normal');
            }

            else if (operationalText.toLowerCase().startsWith('elif ')) {
                let cond = operationalText.substring(5).trim();
                let hasBracket = cond.endsWith('{');
                if (hasBracket) cond = cond.slice(0, -1).trim();
                stringBank.forEach((str, index) => {
                    cond = cond.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });
                const indentation = currentLineText.match(/^(\s*)/)[1];
                currentLineAssembled = `${indentation}else if (${cond}) {`;
                
                if (!hasBracket) {
                    pendingSingleLineClosures++;
                }
                generatedStatement = false;
                this.scopes.push(new Set());
                this.blockStack.push('normal');
            }

            else if (operationalText.toLowerCase().startsWith('else')) {
                let checkText = operationalText.substring(4).trim();
                let hasBracket = checkText.endsWith('{');
                const indentation = currentLineText.match(/^(\s*)/)[1];
                currentLineAssembled = `${indentation}else {`;
                
                if (!hasBracket) {
                    pendingSingleLineClosures++;
                }
                generatedStatement = false;
                this.scopes.push(new Set());
                this.blockStack.push('normal');
            }

            else if (operationalText.includes('=') && (!operationalText.match(/==|!=|<=|>=/) || operationalText.split('=')[0].toLowerCase().includes('imagine'))) {
                const parts = operationalText.split('=');
                let leftHandSideIdent = parts[0].trim();
                let hasImagineKeyword = false;
                
                if (leftHandSideIdent.toLowerCase().startsWith('imagine ')) {
                    leftHandSideIdent = leftHandSideIdent.substring(8).trim();
                    hasImagineKeyword = true;
                }
                
                if (/^[a-zA-Z_][a-zA-Z0-9_\.]*$/.test(leftHandSideIdent)) {
                    let rightHandSideVal = parts.slice(1).join('=').trim();
                    stringBank.forEach((str, index) => {
                        rightHandSideVal = rightHandSideVal.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                    });
                    const indentation = currentLineText.match(/^(\s*)/)[1];
                    
                    let currentBlock = this.blockStack[this.blockStack.length - 1];
                    
                    if (currentBlock === 'structure') {
                        currentLineAssembled = `${indentation}__struct_obj.${leftHandSideIdent} = ${rightHandSideVal};`;
                    } 
                    else {
                        if (leftHandSideIdent.includes('.')) {
                            currentLineAssembled = `${indentation}${leftHandSideIdent} = ${rightHandSideVal};`;
                        } else if (this.hasVariableInLocalScope(leftHandSideIdent)) {
                            currentLineAssembled = `${indentation}${leftHandSideIdent} = ${rightHandSideVal};`;
                        } else {
                            if (hasImagineKeyword || !this.hasVariableInAnyScope(leftHandSideIdent)) {
                                this.addVariableToLocalScope(leftHandSideIdent);
                                currentLineAssembled = `${indentation}let ${leftHandSideIdent} = ${rightHandSideVal};`;
                            } else {
                                currentLineAssembled = `${indentation}${leftHandSideIdent} = ${rightHandSideVal};`;
                            }
                        }
                    }
                    generatedStatement = true;
                }
            }

            if (!currentLineAssembled) {
                let lineToAssemble = currentLineText;
                stringBank.forEach((str, index) => {
                    lineToAssemble = lineToAssemble.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });

                let syntaxCheck = lineToAssemble.trim();
                if (syntaxCheck !== "" && !syntaxCheck.endsWith('{') && !syntaxCheck.endsWith('}') && !syntaxCheck.endsWith(';')) {
                    lineToAssemble += ';';
                }
                currentLineAssembled = lineToAssemble;
                if (syntaxCheck !== "" && syntaxCheck !== "}") {
                    generatedStatement = true;
                }
            }

            compiledJSOutput.push(currentLineAssembled);

            if (generatedStatement && pendingSingleLineClosures > 0) {
                const indentation = currentLineText.match(/^(\s*)/)[1];
                while (pendingSingleLineClosures > 0) {
                    let bType = this.blockStack.pop();
                    if (bType === 'structure') {
                        compiledJSOutput.push(`${indentation}    return __struct_obj;\n${indentation}}`);
                    } else {
                        compiledJSOutput.push(`${indentation}}`);
                    }
                    
                    if (this.scopes.length > 1) {
                        this.scopes.pop();
                    }
                    pendingSingleLineClosures--;
                }
            }
        }

        return compiledJSOutput.join('\n');
    }
}

const PyCJStudioIDE = {
    showCustomConfirm: function(messageHtml) {
        return new Promise((resolve) => {
            const modal = document.getElementById('upgrade-modal');
            const msgEl = document.getElementById('upgrade-message');
            const confirmBtn = document.getElementById('upgrade-confirm-btn');
            const cancelBtn = document.getElementById('upgrade-cancel-btn');
            const closeBtn = document.getElementById('close-upgrade-btn');

            if (!modal) return resolve(false);

            if (msgEl && messageHtml) {
                msgEl.innerHTML = messageHtml;
            }

            modal.classList.add('active');

            const cleanupAndResolve = (result) => {
                modal.classList.remove('active');
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
                resolve(result);
            };

            const onConfirm = () => cleanupAndResolve(true);
            const onCancel = () => cleanupAndResolve(false);

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
        });
    },

    syncSyntaxHighlighting: function() {
        const editor = document.getElementById('editor');
        const highlightContent = document.getElementById('highlight-content');
        if (!editor || !highlightContent) return;

        let txt = editor.value;
        txt = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (txt.endsWith('\n') || txt === '') {
            txt += ' ';
        }

        const unifiedTokensRegex = /(\/\/.*|#.*)|(p?".*?"|'.*?')|\b(imagine|repeat|for|if|elif|else|ask|and|or|not|function|return|structure)\b|\b(output|add|remove|max|min)\b|\b(str|int|float|bool)\b|\b(\d+(?:\.\d+)?)\b/gi;

        let HTMLOutput = txt.replace(unifiedTokensRegex, (match, comment, string, keyword, builtin, datatype, number) => {
            if (comment !== undefined) return `<span class="token-comment">${match}</span>`;
            if (string !== undefined) return `<span class="token-string">${match}</span>`;
            if (keyword !== undefined) return `<span class="token-keyword">${match}</span>`;
            if (builtin !== undefined) return `<span class="token-builtin">${match}</span>`;
            if (datatype !== undefined) return `<span class="token-datatype">${match}</span>`;
            if (number !== undefined) return `<span class="token-number">${match}</span>`;
            return match;
        });

        highlightContent.innerHTML = HTMLOutput;
        this.syncScrollPositions();
    },

    syncScrollPositions: function() {
        const editor = document.getElementById('editor');
        const highlightContent = document.getElementById('highlight-content');
        if (!editor || !highlightContent) return;
        
        highlightContent.scrollTop = editor.scrollTop;
        highlightContent.scrollLeft = editor.scrollLeft;
    },

    handleKeyboardInteractions: function(e) {
        const editor = e.target;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const val = editor.value;
        
        const currentChar = val.charAt(start - 1);
        const nextChar = val.charAt(start);

        if (e.key === 'Tab') {
            e.preventDefault();
            editor.value = val.substring(0, start) + "    " + val.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 4;
            this.syncSyntaxHighlighting();
            return;
        }

        const closingChars = ['}', ')', ']', '"', "'"];
        if (closingChars.includes(e.key) && start === end && nextChar === e.key) {
            e.preventDefault();
            editor.selectionStart = editor.selectionEnd = start + 1;
            return;
        }

        const activePairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };

        if (activePairs[e.key] !== undefined) {
            e.preventDefault();
            const closureSymbol = activePairs[e.key];
            editor.value = val.substring(0, start) + e.key + closureSymbol + val.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 1;
            this.syncSyntaxHighlighting();
            return;
        }

        if (e.key === 'Backspace' && start === end) {
            if ((currentChar === '{' && nextChar === '}') ||
                (currentChar === '(' && nextChar === ')') ||
                (currentChar === '[' && nextChar === ']') ||
                (currentChar === '"' && nextChar === '"') ||
                (currentChar === "'" && nextChar === "'")) {
                e.preventDefault();
                editor.value = val.substring(0, start - 1) + val.substring(start + 1);
                editor.selectionStart = editor.selectionEnd = start - 1;
                this.syncSyntaxHighlighting();
                return;
            }
        }

        if (e.key === 'Enter' && start === end) {
            if (currentChar === '{' && nextChar === '}') {
                e.preventDefault();
                let lineStartIdx = start - 2;
                while (lineStartIdx >= 0 && val[lineStartIdx] !== '\n') lineStartIdx--;
                lineStartIdx++;
                const upperLineContent = val.substring(lineStartIdx, start - 1);
                const indentMatch = upperLineContent.match(/^(\s*)/);
                const baseIndentation = indentMatch ? indentMatch[1] : '';
                const activeInnerTab = baseIndentation + '    ';

                editor.value = val.substring(0, start) + '\n' + activeInnerTab + '\n' + baseIndentation + val.substring(start);
                editor.selectionStart = editor.selectionEnd = start + 1 + activeInnerTab.length;
                this.syncSyntaxHighlighting();
                return;
            }

            e.preventDefault();
            let lineStartIdx = start - 1;
            while (lineStartIdx >= 0 && val[lineStartIdx] !== '\n') lineStartIdx--;
            lineStartIdx++;

            const lineContent = val.substring(lineStartIdx, start);
            const indentMatch = lineContent.match(/^(\s*)/);
            let indentStr = indentMatch ? indentMatch[1] : '';

            if (lineContent.trim().endsWith('{')) {
                indentStr += '    ';
            } else if (lineContent.trim().toLowerCase().match(/^(if|elif|else|for|repeat|function|structure)\b/)) {
                indentStr += '    ';
            }

            editor.value = val.substring(0, start) + '\n' + indentStr + val.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 1 + indentStr.length;
            this.syncSyntaxHighlighting();
        }
    },

    initUserInterfaceControls: function() {
        const themeBtn = document.getElementById('theme-toggle');
        const openVaultBtn = document.getElementById('open-vault-btn');
        const closeVaultBtn = document.getElementById('close-vault-btn');
        const vaultModal = document.getElementById('vault-modal');
        const welcomeModal = document.getElementById('welcome-modal');
        const closeWelcomeBtn = document.getElementById('close-welcome-btn');
        const welcomeDismissBtn = document.getElementById('welcome-dismiss-btn');
        const helpBtn = document.getElementById('help-btn');
        const welcomeDocsBtn = document.getElementById('welcome-docs-btn');
        const menuToggle = document.getElementById('menu-toggle');
        const controlCluster = document.getElementById('control-cluster');
        const tabCode = document.getElementById('tab-code');
        const tabConsole = document.getElementById('tab-console');
        const workspace = document.getElementById('workspace');
        const autosaveToggle = document.getElementById('persistence-toggle');
        const editor = document.getElementById('editor');

        const savedTheme = localStorage.getItem('pycj-theme') || 'dark-theme';
        document.body.className = savedTheme;
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                if (document.body.classList.contains('dark-theme')) {
                    document.body.className = 'light-theme';
                    localStorage.setItem('pycj-theme', 'light-theme');
                } else {
                    document.body.className = 'dark-theme';
                    localStorage.setItem('pycj-theme', 'dark-theme');
                }
            });
        }

        const welcomeDismissed = localStorage.getItem('pycj-welcome-dismissed') === 'true';
        if (welcomeModal && !welcomeDismissed) {
            setTimeout(() => welcomeModal.classList.add('active'), 600);
        }
        const dismissWelcome = () => {
            if (welcomeModal) welcomeModal.classList.remove('active');
            localStorage.setItem('pycj-welcome-dismissed', 'true');
        };
        if (closeWelcomeBtn) closeWelcomeBtn.addEventListener('click', dismissWelcome);
        if (welcomeDismissBtn) welcomeDismissBtn.addEventListener('click', dismissWelcome);

        if (openVaultBtn && vaultModal) {
            openVaultBtn.addEventListener('click', () => vaultModal.classList.add('active'));
        }
        if (closeVaultBtn && vaultModal) {
            closeVaultBtn.addEventListener('click', () => vaultModal.classList.remove('active'));
        }
        if (vaultModal) {
            vaultModal.addEventListener('click', (e) => {
                if (e.target === vaultModal) vaultModal.classList.remove('active');
            });
        }

        const vaultCards = document.querySelectorAll('.vault-card');
        const toast = document.getElementById('toast-notification');
        vaultCards.forEach(card => {
            card.addEventListener('click', () => {
                const snippet = card.getAttribute('data-snippet');
                if (snippet) {
                    navigator.clipboard.writeText(snippet).then(() => {
                        if (toast) {
                            toast.classList.add('show');
                            setTimeout(() => toast.classList.remove('show'), 2500);
                        }
                    });
                }
            });
        });

        // Redirects users directly to your official PyCJ documentation domain
        const triggerDocsRedirect = () => {
            window.open("https://pycjdocumentation.vercel.app/", "_blank");
        };
        if (helpBtn) helpBtn.addEventListener('click', triggerDocsRedirect);
        if (welcomeDocsBtn) {
            welcomeDocsBtn.addEventListener('click', () => {
                triggerDocsRedirect();
                dismissWelcome();
            });
        }

        if (tabCode && tabConsole && workspace) {
            tabCode.addEventListener('click', () => {
                tabCode.classList.add('active');
                tabConsole.classList.remove('active');
                workspace.classList.add('show-editor');
                workspace.classList.remove('show-console');
            });
            tabConsole.addEventListener('click', () => {
                tabConsole.classList.add('active');
                tabCode.classList.remove('active');
                workspace.classList.add('show-console');
                workspace.classList.remove('show-editor');
            });
        }

        if (menuToggle && controlCluster) {
            menuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                controlCluster.classList.toggle('mobile-open');
            });
            document.addEventListener('click', () => {
                controlCluster.classList.remove('mobile-open');
            });
        }

        if (autosaveToggle && editor) {
            autosaveToggle.addEventListener('change', (e) => {
                localStorage.setItem('pycj-autosave', e.target.checked);
                if (e.target.checked) {
                    localStorage.setItem('pycj-saved-code', editor.value);
                }
            });
        }
    },

    initSystemCoreLifecycles: function() {
        const editor = document.getElementById('editor');
        const runBtn = document.getElementById('run-btn');
        const controlCluster = document.getElementById('control-cluster');
        const autosaveToggle = document.getElementById('persistence-toggle');

        let modelSelector = document.getElementById('model-selector');
        if (!modelSelector) {
            modelSelector = document.createElement('select');
            modelSelector.id = 'model-selector';
            modelSelector.title = 'Select Compiler Version';
            modelSelector.innerHTML = '<option value="v1">PyCJ v1</option><option value="v1.1">PyCJ v1.1</option>';
            
            modelSelector.style.padding = '6px 12px';
            modelSelector.style.margin = '0 10px';
            modelSelector.style.borderRadius = '5px';
            modelSelector.style.background = 'var(--btn-secondary, #2d2d2d)';
            modelSelector.style.color = 'var(--text-heading, #ffffff)';
            modelSelector.style.border = '1px solid var(--border-color, #444)';
            modelSelector.style.cursor = 'pointer';
            modelSelector.style.fontWeight = 'bold';

            if (controlCluster) {
                controlCluster.appendChild(modelSelector);
            }
        }

        const savedVersion = localStorage.getItem('pycj-version') || 'v1';
        modelSelector.value = savedVersion;

        modelSelector.addEventListener('change', (e) => {
            localStorage.setItem('pycj-version', e.target.value);
        });

        const syntaxExplanationCode = `# =========================================================
# Category 1: PyCJ v1 Fundamentals (Variables, Arrays, Loops)
# =========================================================

# 1. Variables and Data Types
imagine userName = "Developer"
imagine scores = [85, 92, 78, 99, 90]

# 2. P-Strings (String Interpolation)
imagine intro = p"Welcome {userName} to the PyCJ Language Platform!"
output(intro)

# 3. Professional Array Operations
scores.add(88)
imagine highestScore = scores.max()
imagine lowestScore = scores.min()
output(p"Scores Array after add: {scores}")
output(p"Highest score: {highestScore}, Lowest score: {lowestScore}")

# 4. Conditional Control Flow (if, elif, else)
if highestScore >= 90 {
    output("Excellent performance detected!")
} elif highestScore >= 70 {
    output("Good performance.")
} else {
    output("Needs improvement.")
}

# 5. Iteration Loops (for & repeat)
output("Running a sequential loop from 1 to 3:")
for (imagine i = 1, i <= 3, i++) {
    output(p"Loop index count: {i}")
}

imagine count = 3
output("Running a repeat condition loop:")
repeat count > 0 {
    output(p"Countdown: {count}")
    count = count - 1
}

# =========================================================
# Category 2: PyCJ v1.1 Advanced Features (Functions & Objects)
# =========================================================
# NOTE: Executing below will prompt a version update to v1.1!

# 1. Modular Reusable Functions
function calculateBonus(baseScore, modifier) {
    imagine finalScore = baseScore + modifier
    return finalScore
}

imagine adjustedScore = calculateBonus(highestScore, 5)
output(p"Adjusted top score with function bonus: {adjustedScore}")

# 2. Structure Definitions (Custom Objects / Data Maps)
structure PlayerProfile {
    name = userName
    rank = "Elite Tier"
    active = true
}

imagine player = PlayerProfile()
output(p"Player Structure Created -> Name: {player.name}, Rank: {player.rank}")`;

        if (editor) {
            const savedAutosave = localStorage.getItem('pycj-autosave') === 'true';
            if (autosaveToggle) autosaveToggle.checked = savedAutosave;

            if (savedAutosave) {
                editor.value = localStorage.getItem('pycj-saved-code') || syntaxExplanationCode;
            } else {
                editor.value = syntaxExplanationCode;
            }

            editor.addEventListener('input', () => {
                this.syncSyntaxHighlighting();
                if (autosaveToggle && autosaveToggle.checked) {
                    localStorage.setItem('pycj-saved-code', editor.value);
                }
            });
            editor.addEventListener('scroll', () => this.syncScrollPositions());
            editor.addEventListener('keydown', (e) => this.handleKeyboardInteractions(e));
        }

        if (runBtn) runBtn.addEventListener('click', () => this.triggerCompilationPipelineRuntime());
        
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.triggerCompilationPipelineRuntime();
            }
        });

        this.syncSyntaxHighlighting();
        this.initUserInterfaceControls();
    },

    triggerCompilationPipelineRuntime: async function() {
        if (window.innerWidth <= 950) {
            const tabConsole = document.getElementById('tab-console');
            const tabCode = document.getElementById('tab-code');
            const workspace = document.getElementById('workspace');
            if (tabConsole && workspace) {
                tabConsole.classList.add('active');
                if(tabCode) tabCode.classList.remove('active');
                workspace.classList.add('show-console');
                workspace.classList.remove('show-editor');
            }
        }

        window.PyCJTerminalIO.clear();
        window.PyCJTerminalIO.printLoader(); 
        
        const editor = document.getElementById('editor');
        if (!editor) return;
        const src = editor.value;

        const currentVersion = localStorage.getItem('pycj-version') || 'v1';

        setTimeout(async () => {
            window.PyCJTerminalIO.removeLoader();

            try {
                const compilerInstance = new PyCJCompiler(src, currentVersion);
                const executableJSCode = compilerInstance.compile();

                const sandboxAsyncShell = new Function(`
                    return (async () => {
                        try {
                            ${executableJSCode}
                            window.PyCJTerminalIO.printSuccess();
                        } catch(runtimeError) {
                            window.PyCJTerminalIO.printError("Runtime Error", runtimeError.message, "Execution Phase", "Check logic values.");
                        }
                    })();
                `);

                await sandboxAsyncShell();

            } catch (compilerFaultException) {
                if (compilerFaultException.fix === "SWITCH_V1_1") {
                    
                    const switchConfirmed = await PyCJStudioIDE.showCustomConfirm(
                        "Advanced features detected (Functions/Structures).<br><br>Do you want to let us upgrade your workspace to PyCJ v1.1 to run this code?"
                    );
                    
                    if (switchConfirmed) {
                        localStorage.setItem('pycj-version', 'v1.1');
                        const modelSelector = document.getElementById('model-selector');
                        if (modelSelector) modelSelector.value = 'v1.1';
                        
                        window.PyCJTerminalIO.clear();
                        return PyCJStudioIDE.triggerCompilationPipelineRuntime(); 
                    } else {
                        window.PyCJTerminalIO.printError(
                            "Version Restriction",
                            compilerFaultException.message,
                            compilerFaultException.line || "Analysis Phase",
                            "Change the version dropdown to v1.1 to enable this feature."
                        );
                        return;
                    }
                }

                window.PyCJTerminalIO.printError(
                    compilerFaultException.type || "Compiler Error",
                    compilerFaultException.message,
                    compilerFaultException.line || "Analysis Phase",
                    compilerFaultException.fix || "Verify grammar syntax alignment."
                );
            }
        }, 800);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    PyCJStudioIDE.initSystemCoreLifecycles();
});
