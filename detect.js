(function() {
    const detectionLog = [];

    function recordDetection(type, details) {
        const logEntry = { type, details: details || {}, timestamp: Date.now() };
        detectionLog.push(logEntry);
        console.warn(`[AUTOMATION DETECTED] Type: ${type}`, details || '');
    }

    function isMethodNonNative(method) {
        if (!method || typeof method !== 'function') return false;
        return !/\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(method));
    }

    function getNonNativeMethodBody(method, maxLength = 200) {
        if (!method || typeof method !== 'function' || isMethodNonNative(method) === false) return "";
        try {
            const methodString = Function.prototype.toString.call(method);
            return methodString.replace(/^function\s*\(.*?\)\s*\{/, '').replace(/\s*\}$/, '').substring(0, maxLength);
        } catch (e) {
            return "";
        }
    }

    function checkNavigatorWebdriver() {
        if (navigator.webdriver === true) {
            recordDetection('navigator.webdriver', { value: true });
        }
        try {
            if (typeof navigator.__lookupGetter__ === 'function' && navigator.__lookupGetter__('webdriver')) {
                recordDetection('navigator.webdriver_getter', { present: true });
            }
            const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
            if (descriptor) {
                recordDetection('navigator.webdriver_descriptor', { descriptor: JSON.stringify(descriptor) });
            }
        } catch (e) { /* ignore */ }
    }

    function checkGlobalVariables() {
        const automationGlobals = [
            '_phantom', '__nightmare', '_selenium', 'callPhantom', 'callSelenium',
            '_Selenium_IDE_Recorder', 'domAutomation', 'domAutomationController',
            '_WEBDRIVER_ELEM_CACHE', 'wptagentGetInteractivePeriods', 'fSCInitialize',
            '__webdriverFunc', 'geb', 'awesomium', '$chrome_asyncScriptInfo',
            'webdriver',
            '$cdc_asdjflasutopfhvcZLmcfl_',
            '_evaluate', 'spawn', 'emit',
            'Cypress', 'Sahi', '_sahi', 'ubot', 'UBotCookies'
        ];
        
        for (const prop of automationGlobals) {
            if (window[prop] !== undefined) {
                recordDetection('global_variable', { property: prop, value: typeof window[prop] });
            }
        }
        
        for (const key of Object.keys(window)) {
            if (/^cdc_[a-zA-Z0-9]{22}_(Array|Promise|Symbol)$/.test(key)) {
                recordDetection('global_variable_cdc', { property: key });
            }
        }
    }

    function checkDocumentPropertiesAndAttributes() {
        const documentProps = [
            '__webdriver_script_fn', '__webdriver_script_f', '__$webdriverAsyncExecutor',
            '__webdriverevaluate', '__seleniumevaluate', '__webdriver_script_function',
            '__webdriver_script_func', '__fxdriver_evaluate', '__driver_unwrapped',
            '__webdriver_unwrapped', '__driver_evaluate', '__selenium_unwrapped',
            '__fxdriver_unwrapped', '$chrome_asyncScriptInfo', '$xwalk_asyncScriptInfo'
        ];
        
        for (const prop of documentProps) {
            if (document[prop] !== undefined) {
                recordDetection('document_property', { property: prop });
            }
        }
        
        for (const key of Object.keys(document)) {
            if (/\$[a-z]dc_/.test(key)) {
                recordDetection('document_property_pattern', { property: key });
            }
            
            try {
                if (document[key] && document[key]['_cacdc'] && document[key]['selenium-ide']) {
                    recordDetection('document_property_custom_attributes', { property: key, attributes: ['_cacdc', 'selenium-ide'] });
                }
            } catch(e) { /* ignore */ }
        }

        const attributesToCheck = ['selenium', 'webdriver', 'driver', 'cd_frame_id_'];
        for (const attr of attributesToCheck) {
            if (document.documentElement && document.documentElement.hasAttribute(attr)) {
                recordDetection('documentElement_attribute', { attribute: attr, value: document.documentElement.getAttribute(attr) });
            }
        }

        if (document.cookie.includes('ChromeDriverwjers908fljsdf37459fsdfgdfwru=')) {
            recordDetection('chromedriver_cookie');
        }
    }

    function setupStackTraceAnalysis() {
        const automationPatterns = /at\scallFunction\s\(\<anonymous|userscript\:Scraper|evaluateJavascriptFunction|evaluation_script|\.apply\.navigator|(at fn \(eval at evalFunc)|eval\sat\sevaluate|utilityscript.evaluate|pptr.evaluate/i;

        function getStack() {
            try {
                null[0](); // Force an error
            } catch (e) {
                return e.stack || "";
            }
            return "";
        }

        function checkStack(source) {
            const stack = getStack();
            if (automationPatterns.test(stack)) {
                recordDetection('stack_trace_automation', { source: source, stack: stack.substring(0, 200) });
                return true;
            }
            
            if (stack.includes('Taiko') || stack.includes('waitForPredicatePageFunction')) {
                recordDetection('stack_trace_taiko', { source: source, stack: stack.substring(0, 200) });
                return true;
            }
            return false;
        }

        const methodsToInstrument = {
            'Document.evaluate': Document.prototype.evaluate,
            'Element.getAttributeNode': Element.prototype.getAttributeNode,
            'Element.getClientRects': Element.prototype.getClientRects,
            'Document.querySelector': Document.prototype.querySelector,
            'Document.querySelectorAll': Document.prototype.querySelectorAll,
            'XMLSerializer.serializeToString': XMLSerializer.prototype.serializeToString,
            'IntersectionObserver.observe': window.IntersectionObserver ? IntersectionObserver.prototype.observe : null,
            'window.scrollBy': window.scrollBy,
            'window.scrollTo': window.scrollTo
        };

        for (const methodName in methodsToInstrument) {
            const originalMethod = methodsToInstrument[methodName];
            if (originalMethod && typeof originalMethod === 'function') {
                const parts = methodName.split('.');
                let obj = window;
                const actualMethodName = parts[parts.length-1];
                
                if (parts.length > 1) {
                    if (window[parts[0]] && window[parts[0]].prototype) {
                        obj = window[parts[0]].prototype;
                        obj[actualMethodName] = function(...args) {
                            checkStack(`call_to_${methodName}`);
                            return originalMethod.apply(this, args);
                        };
                    } else if (window[parts[0]]) {
                        obj = window[parts[0]];
                        obj[actualMethodName] = function(...args) {
                            checkStack(`call_to_${methodName}`);
                            return originalMethod.apply(this, args);
                        };
                    }
                } else if (methodName.startsWith('window.')) {
                    window[actualMethodName] = function(...args) {
                        checkStack(`call_to_${methodName}`);
                        return originalMethod.apply(this, args);
                    };
                }
            }
        }

        if (window.Promise) {
            const OriginalPromise = window.Promise;
            window.Promise = new Proxy(OriginalPromise, {
                construct: function(target, args) {
                    checkStack('Promise_constructor');
                    return Reflect.construct(target, args);
                }
            });
        }

        window.addEventListener('click', function(event) {
            if (event.isTrusted === false) {
                if (checkStack('untrusted_click_event')) {
                    recordDetection('untrusted_click_with_automation_stack', { target: event.target ? event.target.tagName : 'unknown' });
                }
            }
        }, true);
    }

    function checkErrorObjectManipulation() {
        const error = new Error();
        let detected = false;
        const originalStack = error.stack;

        try {
            Object.defineProperty(error, 'stack', {
                configurable: false,
                enumerable: false,
                get: function() {
                    detected = true;
                    recordDetection('error_stack_get_hooked');
                    return originalStack + '\n  at HookedGetter (evil.js:1:1)';
                }
            });
            console.log(error.stack);
        } catch (e) {
            // If defineProperty fails, this itself could be a sign or just normal browser behavior.
        }

        if (window.Worker && window.Blob && window.URL && window.URL.createObjectURL) {
            try {
                const workerScript = `
                    onmessage = function() {
                        let detectedInWorker = false;
                        const err = new Error('WorkerError');
                        const originalWorkerStack = err.stack;
                        try {
                            Object.defineProperty(err, 'stack', {
                                configurable: false,
                                enumerable: false,
                                get: function() {
                                    detectedInWorker = true;
                                    return originalWorkerStack + '\\n  at HookedGetterInWorker (worker.js:1:1)';
                                }
                            });
                            try { console.log(err.stack); } catch(e){}
                            postMessage(detectedInWorker);
                        } catch (e) {
                            postMessage(false);
                        }
                    };
                `;
                const blob = new Blob([workerScript], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);
                const worker = new Worker(url);
                worker.onmessage = function(e) {
                    if (e.data === true) {
                        recordDetection('error_stack_get_hooked_worker');
                    }
                    worker.terminate();
                    URL.revokeObjectURL(url);
                };
                worker.postMessage({});
            } catch (e) {
                console.error("Worker check failed to setup:", e);
            }
        }
    }

    function checkMutationObserverAttributes() {
        if (window.MutationObserver && document.body) {
            const observer = new MutationObserver(function(mutations) {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'selenium-ide-indicator') {
                        recordDetection('mutation_selenium_ide_indicator');
                        observer.disconnect();
                        return;
                    }
                }
            });
            observer.observe(document.body, { attributes: true });
        }
    }

    function listenWebDriverEvents() {
        const webdriverEvents = [
            'driver-evaluate', 'webdriver-evaluate', 'webdriver-evaluate-response',
            'webdriverCommand', 'selenium-evaluate'
        ];
        
        for (const eventName of webdriverEvents) {
            document.addEventListener(eventName, function(event) {
                recordDetection('webdriver_event', { type: event.type });
            }, true);
        }
    }

    function checkCEF() {
        if (typeof window.cefQuery === 'function' || typeof window.cefQueryCancel === 'function') {
            recordDetection('cef_properties', {
                cefQuery: typeof window.cefQuery,
                cefQueryCancel: typeof window.cefQueryCancel
            });
        }
    }

    function checkModifiedNativeFunctions() {
        const functionsToCheck = {
            'navigator.permissions.query': navigator.permissions ? navigator.permissions.query : null,
            'document.cookie_getter': Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ? 
                Object.getOwnPropertyDescriptor(Document.prototype, 'cookie').get : null,
            'document.cookie_setter': Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ? 
                Object.getOwnPropertyDescriptor(Document.prototype, 'cookie').set : null,
            'HTMLIFrameElement.contentWindow': Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow') ? 
                Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get : null,
            'Canvas.getContext': HTMLCanvasElement.prototype.getContext,
            'Canvas.toDataURL': HTMLCanvasElement.prototype.toDataURL,
            'WebGL.getParameter': window.WebGLRenderingContext ? WebGLRenderingContext.prototype.getParameter : null,
            'Date.getTimezoneOffset': Date.prototype.getTimezoneOffset,
            'Intl.DateTimeFormat': window.Intl ? Intl.DateTimeFormat : null,
            'document.createElement': document.createElement
        };

        for (const name in functionsToCheck) {
            const func = functionsToCheck[name];
            if (func && isMethodNonNative(func)) {
                recordDetection('modified_native_function', { name: name, body: getNonNativeMethodBody(func) });
            }
        }
    }
    
    function checkElectron() {
        try {
            if (window.close && typeof window.close === 'function' && window.close.toString().includes("ELECTRON")) {
                recordDetection('electron_close_method');
            }
        } catch(e) { /*ignore*/ }
    }

    function checkPrototypeChain() {
        if (Navigator.prototype && Object.getPrototypeOf(navigator) !== Navigator.prototype) {
            recordDetection('navigator_prototype_modified');
        }
    }
    
    function checkClonedPrototypes() {
        const props = Object.getOwnPropertyNames(window);
        const cdcArray = props.find(p => /^cdc_[a-zA-Z0-9]{22}_Array$/.test(p));
        const cdcSymbol = props.find(p => /^cdc_[a-zA-Z0-9]{22}_Symbol$/.test(p));
        const cdcPromise = props.find(p => /^cdc_[a-zA-Z0-9]{22}_Promise$/.test(p));

        if (cdcArray && window[cdcArray] === window.Array &&
            cdcSymbol && window[cdcSymbol] === window.Symbol &&
            cdcPromise && window[cdcPromise] === window.Promise) {
            recordDetection('cloned_prototypes_cdc_pattern', {array: cdcArray, symbol: cdcSymbol, promise: cdcPromise});
        }
    }

    function runChecks() {
        console.log("Starting automation framework detection checks...");

        checkNavigatorWebdriver();
        checkGlobalVariables();
        checkDocumentPropertiesAndAttributes();
        listenWebDriverEvents();
        checkCEF();
        checkModifiedNativeFunctions();
        checkElectron();
        checkPrototypeChain();
        checkClonedPrototypes();
        
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setupStackTraceAnalysis();
            checkErrorObjectManipulation();
            checkMutationObserverAttributes();
        } else {
            window.addEventListener('DOMContentLoaded', () => {
                setupStackTraceAnalysis();
                checkErrorObjectManipulation();
                checkMutationObserverAttributes();
            });
        }

        setTimeout(() => {
            if (detectionLog.length > 0) {
                console.warn("--- Automation Detection Summary ---");
                detectionLog.forEach(log => console.warn(`[DETECTED] Type: ${log.type}`, log.details));
                console.warn("--- End of Summary ---");
            } else {
                console.log("No direct automation framework artifacts detected by this script.");
            }
        }, 2000);
    }
    
    runChecks();
})();
