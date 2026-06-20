/**
 * PyCJ Language Engine Core Specification (v1.2 Stable)
 * Scoped Scope: Variables, Input/Output, Conditionals, and Loops.
 * Added: Compilation Loader Animation, Clean Return Value Outputs, First-Time Tutorial Download.
 * Added: Infinite Loop Safeguard (Loop Guard Counter).
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

        const line = document.createElement('div');
        line.className = 'console-line';
        line.textContent = args.map(arg => {
            if (arg === null) return 'null';
            if (arg === undefined) return 'undefined';
            if (typeof arg === 'object') return JSON.stringify(arg);
            return String(arg);
        }).join(' ');

        consoleEl.appendChild(line);
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
    constructor(sourceCode) {
        this.source = sourceCode;
        this.scopes = [new Set()]; 
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
        const lines = this.source.split('\n');
        const compiledJSOutput = [];
        
        // --- LOOP GUARD INJECTION ---
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

            currentLineText = currentLineText.replace(/\band\b/gi, '&&');
            currentLineText = currentLineText.replace(/\bor\b/gi, '||');
            currentLineText = currentLineText.replace(/\bnot\b/gi, '!');
            operationalText = currentLineText.trim();

            stringBank = stringBank.map(str => {
                if (/^p"/i.test(str)) {
                    let body = str.slice(2, -1);
                    let mappedBody = body.replace(/\{([^}]+)\}/g, (match, expr) => {
                        let cleanExpr = expr.replace(/\band\b/gi, '&&')
                                            .replace(/\bor\b/gi, '||')
                                            .replace(/\bnot\b/gi, '!');
                        return `\${${cleanExpr}}`;
                    });
                    return `\`${mappedBody}\``;
                }
                return str;
            });

            let generatedStatement = false;
            let currentLineAssembled = "";

            const outputMatch = operationalText.match(/^output\s*\((.*)\)/i);
            if (outputMatch) {
                let innerArgs = outputMatch[1];
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
            } else if (operationalText.toLowerCase().startsWith('ask ')) {
                this.raiseError("Malformed Input Statement", "Interactive input declaration contains format configuration structure mismatches.", currentLineNumber, "Follow format structure rules explicitly: ask int age = \"Age: \"");
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
                        if (loopVarName) {
                            this.addVariableToLocalScope(loopVarName);
                        }
                    } else {
                        this.raiseError("Syntax Error Loop Frame", "The custom for loop construct requires exactly 3 sections split by commas.", currentLineNumber, "Structure expression layout correctly: for (imagine i = 1 , i <= 5 , i ++)");
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
                    
                    if (this.hasVariableInLocalScope(leftHandSideIdent)) {
                        currentLineAssembled = `${indentation}${leftHandSideIdent} = ${rightHandSideVal};`;
                    } else {
                        if (hasImagineKeyword || !this.hasVariableInAnyScope(leftHandSideIdent)) {
                            this.addVariableToLocalScope(leftHandSideIdent);
                            currentLineAssembled = `${indentation}let ${leftHandSideIdent} = ${rightHandSideVal};`;
                        } else {
                            currentLineAssembled = `${indentation}${leftHandSideIdent} = ${rightHandSideVal};`;
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
                    compiledJSOutput.push(`${indentation}}`);
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
    syncSyntaxHighlighting: function() {
        const editor = document.getElementById('editor');
        const highlightContent = document.getElementById('highlight-content');
        if (!editor || !highlightContent) return;

        let txt = editor.value;
        txt = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (txt.endsWith('\n') || txt === '') {
            txt += ' ';
        }

        const unifiedTokensRegex = /(\/\/.*|#.*)|(p?".*?"|'.*?')|\b(imagine|repeat|for|if|elif|else|ask|and|or|not)\b|\b(output)\b|\b(str|int|float|bool)\b|\b(\d+(?:\.\d+)?)\b/gi;

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

        const activePairs = {
            '(': ')',
            '[': ']',
            '"': '"',
            "'": "'"
        };

        if (activePairs[e.key] !== undefined) {
            e.preventDefault();
            const closureSymbol = activePairs[e.key];
            editor.value = val.substring(0, start) + e.key + closureSymbol + val.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 1;
            this.syncSyntaxHighlighting();
            return;
        }

        if (e.key === '{') {
            e.preventDefault();
            editor.value = val.substring(0, start) + "{}" + val.substring(end);
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
                while (lineStartIdx >= 0 && val[lineStartIdx] !== '\n') {
                    lineStartIdx--;
                }
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
            while (lineStartIdx >= 0 && val[lineStartIdx] !== '\n') {
                lineStartIdx--;
            }
            lineStartIdx++;

            const lineContent = val.substring(lineStartIdx, start);
            const indentMatch = lineContent.match(/^(\s*)/);
            let indentStr = indentMatch ? indentMatch[1] : '';

            if (lineContent.trim().endsWith('{')) {
                indentStr += '    ';
            } else if (lineContent.trim().toLowerCase().startsWith('if ') || 
                       lineContent.trim().toLowerCase().startsWith('elif ') || 
                       lineContent.trim().toLowerCase().startsWith('else') ||
                       lineContent.trim().toLowerCase().startsWith('for ') ||
                       lineContent.trim().toLowerCase().startsWith('repeat ')) {
                indentStr += '    ';
            }

            editor.value = val.substring(0, start) + '\n' + indentStr + val.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 1 + indentStr.length;
            this.syncSyntaxHighlighting();
        }
    },

    initSystemCoreLifecycles: function() {
        const editor = document.getElementById('editor');
        const runBtn = document.getElementById('run-btn');
        const themeBtn = document.getElementById('theme-toggle');
        const openVaultBtn = document.getElementById('open-vault-btn');
        const closeVaultBtn = document.getElementById('close-vault-btn');
        const vaultModal = document.getElementById('vault-modal');
        const menuToggle = document.getElementById('menu-toggle');
        const controlCluster = document.getElementById('control-cluster');
        const toast = document.getElementById('toast-notification');
        const autosaveToggle = document.getElementById('persistence-toggle');

        const welcomeModal = document.getElementById('welcome-modal');
        const closeWelcomeBtn = document.getElementById('close-welcome-btn');
        const welcomeDismissBtn = document.getElementById('welcome-dismiss-btn');
        const welcomeDownloadBtn = document.getElementById('welcome-download-btn');
        const downloadBookBtn = document.getElementById('download-book-btn');

        if (!localStorage.getItem('pycj-welcome-seen')) {
            if (welcomeModal) welcomeModal.classList.add('active');
        }

        const closeWelcomeOverlay = () => {
            if (welcomeModal) welcomeModal.classList.remove('active');
            localStorage.setItem('pycj-welcome-seen', 'true');
        };

        if (closeWelcomeBtn) closeWelcomeBtn.addEventListener('click', closeWelcomeOverlay);
        if (welcomeDismissBtn) welcomeDismissBtn.addEventListener('click', closeWelcomeOverlay);

        const triggerBookDownload = () => {
            const link = document.createElement('a');
            link.href = './PyCJ Simple Book.pdf'; 
            link.download = 'PyCJ Simple Book.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            closeWelcomeOverlay();
        };

        if (welcomeDownloadBtn) welcomeDownloadBtn.addEventListener('click', triggerBookDownload);
        if (downloadBookBtn) downloadBookBtn.addEventListener('click', triggerBookDownload);

        const savedTheme = localStorage.getItem('pycj-theme') || 'dark-theme';
        if (savedTheme === 'light-theme') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }

        const savedAutosave = localStorage.getItem('pycj-autosave') === 'true';
        if (autosaveToggle) {
            autosaveToggle.checked = savedAutosave;
        }

        const syntaxExplanationCode = `# =========================================================\n` +
            `# ⚡ PYCJ COMPREHENSIVE SYNTAX GUIDE ⚡\n` +
            `# =========================================================\n\n` +
            `# 1. Variable Declarations\n` +
            `imagine developerName = "Arshman"\n` +
            `imagine systemLatency = 0.12\n` +
            `imagine workspaceActive = true\n\n` +
            `# 2. Console Text Streams (I/O) & Interpolation\n` +
            `output("Welcome to your upgraded PyCJ environment.")\n` +
            `output(p"Active backend session managed by: {developerName}")\n\n` +
            `# 3. Conditional Statement Matrix\n` +
            `if systemLatency < 0.20 {\n` +
            `    output("Performance State: High-Efficiency Grid Optima.")\n` +
            `} else {\n` +
            `    output("Performance State: Standard Nominal Threshold.")\n` +
            "}\n\n" +
            `# 4. Loops and Iterative Structural Elements\n` +
            `output("Launching sequence pipeline calculations:")\n` +
            `for (imagine stepIndex = 1 , stepIndex <= 3 , stepIndex ++)\n` +
            `    output(p" -> Processing core block iteration: #{stepIndex}")\n\n` +
            `output("✨ Core system validation evaluation processing finalized successfully.");`;

        if (editor) {
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

        if (autosaveToggle) {
            autosaveToggle.addEventListener('change', () => {
                localStorage.setItem('pycj-autosave', autosaveToggle.checked);
                if (autosaveToggle.checked && editor) {
                    localStorage.setItem('pycj-saved-code', editor.value);
                }
            });
        }

        if (runBtn) runBtn.addEventListener('click', () => this.triggerCompilationPipelineRuntime());
        
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                document.body.classList.toggle('light-theme');
                const nextTheme = document.body.classList.contains('light-theme') ? 'light-theme' : 'dark-theme';
                localStorage.setItem('pycj-theme', nextTheme);
            });
        }

        if (openVaultBtn && vaultModal) {
            openVaultBtn.addEventListener('click', () => vaultModal.classList.add('active'));
        }
        if (closeVaultBtn && vaultModal) {
            closeVaultBtn.addEventListener('click', () => vaultModal.classList.remove('active'));
        }

        document.querySelectorAll('.vault-card').forEach(card => {
            card.addEventListener('click', () => {
                const snippet = card.getAttribute('data-snippet');
                if (editor && snippet) {
                    const cursorPosition = editor.selectionStart;
                    const existingText = editor.value;
                    editor.value = existingText.substring(0, cursorPosition) + "\n" + snippet + "\n" + existingText.substring(cursorPosition);
                    this.syncSyntaxHighlighting();
                    if (autosaveToggle && autosaveToggle.checked) {
                        localStorage.setItem('pycj-saved-code', editor.value);
                    }
                }
                if (vaultModal) vaultModal.classList.remove('active');
                if (toast) {
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 2000);
                }
            });
        });

        if (menuToggle && controlCluster) {
            menuToggle.addEventListener('click', () => controlCluster.classList.toggle('mobile-open'));
        }

        const tabCode = document.getElementById('tab-code');
        const tabConsole = document.getElementById('tab-console');
        const workspace = document.getElementById('workspace');

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

        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.triggerCompilationPipelineRuntime();
            }
        });

        this.syncSyntaxHighlighting();
    },

    triggerCompilationPipelineRuntime: async function() {
        if (window.innerWidth <= 950) {
            const tabCode = document.getElementById('tab-code');
            const tabConsole = document.getElementById('tab-console');
            const workspace = document.getElementById('workspace');
            
            if (tabCode && tabConsole && workspace) {
                tabConsole.classList.add('active');
                tabCode.classList.remove('active');
                workspace.classList.add('show-console');
                workspace.classList.remove('show-editor');
            }
        }

        window.PyCJTerminalIO.clear();
        window.PyCJTerminalIO.printLoader(); 
        
        const editor = document.getElementById('editor');
        if (!editor) return;
        const src = editor.value;

        setTimeout(async () => {
            window.PyCJTerminalIO.removeLoader();

            try {
                const compilerInstance = new PyCJCompiler(src);
                const executableJSCode = compilerInstance.compile();

                const sandboxAsyncShell = new Function(`
                    return (async () => {
                        try {
                            ${executableJSCode}
                            window.PyCJTerminalIO.printSuccess();
                        } catch(runtimeError) {
                            window.PyCJTerminalIO.printError(
                                "Runtime Error",
                                runtimeError.message,
                                "Execution Phase",
                                "Check your loops. Did you create an infinite sequence?"
                            );
                        }
                    })();
                `);

                await sandboxAsyncShell();

            } catch (compilerFaultException) {
                window.PyCJTerminalIO.printError(
                    compilerFaultException.type || "Compiler Error",
                    compilerFaultException.message,
                    compilerFaultException.line || "Analysis Phase",
                    compilerFaultException.fix || "Verify grammar syntax alignment patterns and check loop frame layouts."
                );
            }
        }, 1000);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    PyCJStudioIDE.initSystemCoreLifecycles();
});