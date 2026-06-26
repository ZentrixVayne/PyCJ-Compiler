/**
 * PyCJ Language Engine Core Specification (v1.8.7 - Stable Expression Engine)
 * Added: Empty initial slot validation for loops e.g., for ( , i <= 50 , i ++)
 * Added: True/False capitalized casing support during code parsing
 * Added: Multi-argument resolution support inside .add(...) method configurations
 * FIXED: Context-isolated Floor Division (//) translation layer without keyword corruption
 * FIXED: Accurate evaluation bounds for mathematical operands preventing calculation doubling
 * FIXED: Advanced parser support for multi-line block comments
 * FIXED: Hardened grammar interceptor ensuring native JS blocks throw clear PyCJ errors
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
            if (Array.isArray(arg)) return '[' + arg.join(', ') + ']';
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

    printSuccess: function(exitValue = 0) {
        const consoleEl = document.getElementById('console');
        if (!consoleEl) return;

        const line = document.createElement('div');
        line.className = 'console-success-box';
        line.textContent = '✨ Program executed successfully.';
        consoleEl.appendChild(line);

        const returnLine = document.createElement('div');
        returnLine.className = 'console-return-line';
        returnLine.textContent = `[Process completed with exit code ${exitValue}]`;
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

    validateStructuralIntegrity(rawLines) {
        let braceTracker = [];
        let inBlockComment = false;
        
        for (let i = 0; i < rawLines.length; i++) {
            let lineText = rawLines[i].trim();
            
            if (lineText.includes('/*')) inBlockComment = true;
            if (inBlockComment) {
                if (lineText.includes('*/')) inBlockComment = false;
                continue;
            }

            if (lineText.startsWith('#') || lineText.startsWith('//') || lineText === '') {
                continue;
            }

            lineText = lineText.replace(/([pP]?)(["'])(?:\\.|[^\\])*?\2/g, '');

            for (let charIdx = 0; charIdx < lineText.length; charIdx++) {
                let char = lineText[charIdx];
                if (char === '{') {
                    braceTracker.push({ lineNum: i + 1, originalText: rawLines[i].trim() });
                } else if (char === '}') {
                    if (braceTracker.length === 0) {
                        this.raiseError(
                            "Syntax Scope Error", 
                            "Unexpected closing brace '}' without a matching structural open block condition.", 
                            i + 1, 
                            "Remove the erroneous closing '}' brace or verify its corresponding logical container."
                        );
                    }
                    braceTracker.pop();
                }
            }
        }

        if (braceTracker.length > 0) {
            let missingClosureBlock = braceTracker.pop();
            this.raiseError(
                "Missing Structural Closure", 
                `The block initialized here remains unclosed at compilation EOF.`, 
                missingClosureBlock.lineNum, 
                `Append a closing curly brace '}' below this block alignment to preserve scope symmetry.`
            );
        }
    }

    parseFloorDivision(expr) {
        while (expr.includes('//')) {
            let idx = expr.indexOf('//');
            
            // Look backward for the left-hand operand
            let leftIdx = idx - 1;
            let parenDepth = 0;
            while (leftIdx >= 0) {
                let char = expr[leftIdx];
                if (char === ')') parenDepth++;
                else if (char === '(') {
                    parenDepth--;
                    if (parenDepth < 0) break;
                }
                
                if (parenDepth === 0) {
                    if (char === ';' || char === ',' || char === '=' || char === '+' || char === '-' || char === '*' || char === '/' || char === '<' || char === '>' || char === '&' || char === '|' || char === '!') {
                        if (!(char === '/' && expr[leftIdx - 1] === '/')) {
                            break;
                        }
                    }
                }
                leftIdx--;
            }
            leftIdx = leftIdx + 1;
            
            // Look forward for the right-hand operand
            let rightIdx = idx + 2;
            parenDepth = 0;
            while (rightIdx < expr.length) {
                let char = expr[rightIdx];
                if (char === '(') parenDepth++;
                else if (char === ')') {
                    parenDepth--;
                    if (parenDepth < 0) break;
                }
                
                if (parenDepth === 0 && (char === ';' || char === ',' || char === '=' || char === '+' || char === '-' || char === '*' || char === '/' || char === '<' || char === '>' || char === '&' || char === '|' || char === '!')) {
                    if (!(char === '/' && expr[rightIdx + 1] === '/')) {
                        break;
                    }
                }
                rightIdx++;
            }
            
            let leftSide = expr.substring(leftIdx, idx).trim();
            let rightSide = expr.substring(idx + 2, rightIdx).trim();
            let replacement = `Math.floor(${leftSide} / ${rightSide})`;
            
            expr = expr.substring(0, leftIdx) + replacement + expr.substring(rightIdx);
        }
        return expr;
    }

    compile() {
        let workingSource = this.source;

        if (workingSource.includes('/*')) {
            let openIdx = workingSource.indexOf('/*');
            while (openIdx !== -1) {
                let closeIdx = workingSource.indexOf('*/', openIdx);
                if (closeIdx === -1) break;
                let segments = workingSource.substring(openIdx, closeIdx + 2).split('\n');
                let emptyLines = segments.map(() => "").join('\n');
                workingSource = workingSource.substring(0, openIdx) + emptyLines + workingSource.substring(closeIdx + 2);
                openIdx = workingSource.indexOf('/*');
            }
        }

        const rawLines = workingSource.split('\n');
        this.validateStructuralIntegrity(rawLines);

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

            if (operationalText.match(/\bconsole\s*\.\s*[a-zA-Z_]/i) || operationalText.match(/\bdocument\s*\.\s*[a-zA-Z_]/i) || operationalText.match(/\bwindow\s*\.\s*[a-zA-Z_]/i)) {
                this.raiseError(
                    "Invalid JavaScript Syntax",
                    `Native JavaScript API call context discovered ("${operationalText}"). PyCJ runs on its own standalone grammar rules.`,
                    currentLineNumber,
                    "This environment is PyCJ, not JavaScript! Use 'output(...)' to print data to the terminal console safely."
                );
            }

            currentLineText = currentLineText.replace(/\bTrue\b/g, 'true');
            currentLineText = currentLineText.replace(/\bFalse\b/g, 'false');

            currentLineText = currentLineText.replace(/\band\b/gi, '&&');
            currentLineText = currentLineText.replace(/\bor\b/gi, '||');
            currentLineText = currentLineText.replace(/\bnot\b/gi, '!');

            let hadInternalMethodCall = false;
            if (currentLineText.includes('.max(') || currentLineText.includes('.min(') || currentLineText.includes('.add(') || currentLineText.includes('.remove(')) {
                hadInternalMethodCall = true;
            }

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
                        cleanExpr = this.parseFloorDivision(cleanExpr);
                        return `\${${cleanExpr}}`;
                    });
                    return `\`${mappedBody}\``;
                }
                return str;
            });

            let generatedStatement = false;
            let currentLineAssembled = "";

            if (operationalText === "break") {
                this.raiseError("Invalid JavaScript Syntax", "Raw JavaScript 'break' keyword detected.", currentLineNumber, "Did you mean to use the custom structural command 'stop' instead?");
            }
            else if (operationalText === "continue") {
                this.raiseError("Invalid JavaScript Syntax", "Raw JavaScript 'continue' keyword detected.", currentLineNumber, "Did you mean to use the custom structural command 'move' instead?");
            }
            else if (operationalText === "pass") {
                const indentation = currentLineText.match(/^(\s*)/)[1] || '';
                currentLineAssembled = `${indentation}// pass statement`;
                generatedStatement = true;
            }
            else if (operationalText === "stop") {
                const indentation = currentLineText.match(/^(\s*)/)[1] || '';
                if (!this.blockStack.includes('normal')) {
                    this.raiseError("Scope Error", "The 'stop' command can only be called from inside an iterative container loop.", currentLineNumber, "Embed inside a 'for' or 'repeat' conditional statement.");
                }
                currentLineAssembled = `${indentation}break;`;
                generatedStatement = true;
            }
            else if (operationalText === "move") {
                const indentation = currentLineText.match(/^(\s*)/)[1] || '';
                if (!this.blockStack.includes('normal')) {
                    this.raiseError("Scope Error", "The 'move' command can only be called from inside an iterative container loop.", currentLineNumber, "Embed inside a 'for' or 'repeat' conditional statement.");
                }
                currentLineAssembled = `${indentation}continue;`;
                generatedStatement = true;
            }

            else if (operationalText.match(/^output\s*\(([\s\S]*)\)/i)) {
                const outputMatch = operationalText.match(/^output\s*\(([\s\S]*)\)/i);
                let innerArgs = outputMatch[1];
                
                innerArgs = this.parseFloorDivision(innerArgs);

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

            else if (operationalText.match(/^ask\s+(str|string|int|float|bool)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)/i)) {
                const askMatch = operationalText.match(/^ask\s+(str|string|int|float|bool)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)/i);
                let [_, dataType, identifier, promptMsg] = askMatch;
                
                if (dataType.toLowerCase() === 'string') dataType = 'str';
                if (!promptMsg || promptMsg.trim() === '""' || promptMsg.trim() === "''") promptMsg = '""';
                
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
                let retVal = operationalText.toLowerCase().startsWith('return ') ? operationalText.substring(7).trim() : "0";
                
                retVal = this.parseFloorDivision(retVal);

                stringBank.forEach((str, index) => {
                    retVal = retVal.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });
                const indentation = currentLineText.match(/^(\s*)/)[1];
                
                if (this.blockStack[this.blockStack.length - 1] === 'global') {
                    currentLineAssembled = `${indentation}window.PyCJTerminalIO.printSuccess(${retVal}); return;`;
                } else {
                    currentLineAssembled = `${indentation}return ${retVal};`;
                }
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

                        initialization = this.parseFloorDivision(initialization);
                        condition = this.parseFloorDivision(condition);
                        increment = this.parseFloorDivision(increment);

                        condition = condition.replace(/(?<![<>=!])=(?![=])/g, "=== ");

                        let loopVarName = "";
                        if (initialization.toLowerCase().startsWith('imagine ')) {
                            let rawVarExpr = initialization.substring(8).trim();
                            let nameMatch = rawVarExpr.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
                            if (nameMatch) {
                                loopVarName = nameMatch[1];
                            }
                            initialization = 'let ' + rawVarExpr;
                        } else if (initialization === "") {
                            initialization = "";
                        }

                        stringBank.forEach((str, index) => {
                            if (initialization) initialization = initialization.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                            condition = condition.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                            increment = increment.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                        });

                        let hasBracket = operationalText.endsWith('{');
                        const indentation = currentLineText.match(/^(\s*)/)[1];
                        
                        currentLineAssembled = `${indentation}for (${initialization}; ${condition}; ${increment}) { if (++__pycj_loop_guard > 1000) throw new Error("Infinite limit reached! Process halted to prevent crash.");`;
                        
                        if (!hasBracket) pendingSingleLineClosures++;
                        generatedStatement = false;
                        
                        this.scopes.push(new Set());
                        this.blockStack.push('normal');
                        if (loopVarName) this.addVariableToLocalScope(loopVarName);
                    } else {
                        this.raiseError("Syntax Error", "For loop requires exactly 3 sections split by commas.", currentLineNumber, "Format correctly: for (imagine i = 1 , i <= 5 , i ++)");
                    }
                }
            }

            else if (operationalText.toLowerCase().startsWith('repeat ')) {
                let loopCond = operationalText.substring(7).trim();
                let hasBracket = loopCond.endsWith('{');
                if (hasBracket) loopCond = loopCond.slice(0, -1).trim();

                loopCond = this.parseFloorDivision(loopCond);
                loopCond = loopCond.replace(/(?<![<>=!])=(?![=])/g, "=== ");

                stringBank.forEach((str, index) => {
                    loopCond = loopCond.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });
                const indentation = currentLineText.match(/^(\s*)/)[1];
                
                currentLineAssembled = `${indentation}while (${loopCond}) { if (++__pycj_loop_guard > 1000) throw new Error("Infinite limit reached! Process halted to prevent crash.");`;
                
                if (!hasBracket) pendingSingleLineClosures++;
                generatedStatement = false;
                this.scopes.push(new Set());
                this.blockStack.push('normal');
            }

            else if (operationalText.toLowerCase().startsWith('if ')) {
                let cond = operationalText.substring(3).trim();
                let hasBracket = cond.endsWith('{');
                if (hasBracket) cond = cond.slice(0, -1).trim();

                cond = this.parseFloorDivision(cond);
                cond = cond.replace(/(?<![<>=!])=(?![=])/g, "=== ");

                stringBank.forEach((str, index) => {
                    cond = cond.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });
                const indentation = currentLineText.match(/^(\s*)/)[1];
                currentLineAssembled = `${indentation}if (${cond}) {`;
                
                if (!hasBracket) pendingSingleLineClosures++;
                generatedStatement = false;
                this.scopes.push(new Set());
                this.blockStack.push('normal');
            }

            else if (operationalText.toLowerCase().startsWith('elif ')) {
                let cond = operationalText.substring(5).trim();
                let hasBracket = cond.endsWith('{');
                if (hasBracket) cond = cond.slice(0, -1).trim();

                cond = this.parseFloorDivision(cond);
                cond = cond.replace(/(?<![<>=!])=(?![=])/g, "=== ");

                stringBank.forEach((str, index) => {
                    cond = cond.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                });
                const indentation = currentLineText.match(/^(\s*)/)[1];
                currentLineAssembled = `${indentation}else if (${cond}) {`;
                
                if (!hasBracket) pendingSingleLineClosures++;
                generatedStatement = false;
                this.scopes.push(new Set());
                this.blockStack.push('normal');
            }

            else if (operationalText.toLowerCase().startsWith('else')) {
                let checkText = operationalText.substring(4).trim();
                let hasBracket = checkText.endsWith('{');
                const indentation = currentLineText.match(/^(\s*)/)[1];
                currentLineAssembled = `${indentation}else {`;
                
                if (!hasBracket) pendingSingleLineClosures++;
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
                
                if (/^[a-zA-Z_][a-zA-Z0-9_\.\[\]\s]*$/.test(leftHandSideIdent) || leftHandSideIdent.includes('.')) {
                    let rightHandSideVal = parts.slice(1).join('=').trim();
                    
                    rightHandSideVal = this.parseFloorDivision(rightHandSideVal);

                    stringBank.forEach((str, index) => {
                        rightHandSideVal = rightHandSideVal.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, str);
                    });
                    const indentation = currentLineText.match(/^(\s*)/)[1];
                    
                    let currentBlock = this.blockStack[this.blockStack.length - 1];
                    
                    if (currentBlock === 'structure' && hasImagineKeyword) {
                        currentLineAssembled = `${indentation}__struct_obj.${leftHandSideIdent} = ${rightHandSideVal};`;
                    } 
                    else {
                        if (leftHandSideIdent.includes('.') || leftHandSideIdent.includes('[')) {
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
                let checkStr = operationalText;
                stringBank.forEach((str, index) => {
                    checkStr = checkStr.replaceAll(`__PYCJ_STR_TOKEN_${index}__`, '');
                });
                checkStr = checkStr.trim();

                if (checkStr !== "" && checkStr !== "}" && !hadInternalMethodCall) {
                    this.raiseError(
                        "Invalid PyCJ Grammar Syntax",
                        `Unrecognized statement context found ("${operationalText}"). This engine strictly rejects native foreign structures.`,
                        currentLineNumber,
                        "Verify your instruction set follows PyCJ keywords. If trying to output text data, use 'output(...)' instead of JavaScript targets."
                    );
                }

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
                    
                    if (this.scopes.length > 1) this.scopes.pop();
                    pendingSingleLineClosures--;
                }
            }
        }

        // Check if there is an explicit top-level return statement.
        // If not, append the final default success sequence.
        const combinedResult = compiledJSOutput.join('\n');
        if (!combinedResult.includes('window.PyCJTerminalIO.printSuccess')) {
            return combinedResult + '\nwindow.PyCJTerminalIO.printSuccess(0);';
        }
        return combinedResult;
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
            if (msgEl && messageHtml) msgEl.innerHTML = messageHtml;

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

        const unifiedTokensRegex = /(\/\/.*|#.*)|(p?".*?"|'.*?')|\b(imagine|repeat|for|if|elif|else|ask|and|or|not|function|return|structure|pass|stop|move)\b|\b(output|add|remove|max|min)\b|\b(str|string|int|float|bool)\b|\b(\d+(?:\.\d+)?)\b/gi;

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

        const defaultSyntaxShowcase = `# =========================================================\n# PyCJ Structural Syntax Testing Suite\n# =========================================================\n\nstructure student() {\n    imagine name = "Arshman"\n    imagine age = 15\n    imagine marks = [10, 20, 30]\n}\n\nimagine s = student()\noutput(s.name)\n\nimagine arr = []\narr.add(10, 20, 30)\noutput(p"Max element is: {arr.max()}")\n\nimagine i = 10\nfor (, i <= 15, i++) {\n    output(p"Iterating: {i}")\n}`;

        if (editor) {
            const savedAutosave = localStorage.getItem('pycj-autosave') === 'true';
            if (autosaveToggle) autosaveToggle.checked = savedAutosave;

            if (savedAutosave) {
                editor.value = localStorage.getItem('pycj-saved-code') || defaultSyntaxShowcase;
            } else {
                editor.value = defaultSyntaxShowcase;
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
                            let __has_returned = false;
                            ${executableJSCode}
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
