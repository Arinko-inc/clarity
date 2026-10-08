import { ArinkoName } from "@clarity-types/arinko"; // ARINKO
import { Event } from "@clarity-types/data";
import { active } from "@src/core";
import { schedule } from "@src/core/task";
import encode from "@src/layout/encode";

export const elements: string[] = [];

const definedElements = new Set<string>();
function register(tag: string) {
    if (!definedElements.has(tag)) {
        definedElements.add(tag);
        elements.push(tag);
        schedule(encode.bind(this, Event.CustomElement));
    }
}

export function check(tag: string) {
    if (window.customElements?.get && window.customElements.get(tag)) {
        register(tag);
    }
}

export function start() {
    // Wrap in try-catch to handle Safari iOS where window properties or customElements.define may be readonly
    try {
        window[ArinkoName.Hooks] = window[ArinkoName.Hooks] || {}; // ARINKO
        if (window.customElements?.define && !window[ArinkoName.Hooks].define) { // ARINKO
            window[ArinkoName.Hooks].define = window.customElements.define; // ARINKO
            window.customElements.define = function () {
                if (active()) {
                    register(arguments[0]);
                }
                return window[ArinkoName.Hooks].define.apply(this, arguments); // ARINKO
            };
        }
    } catch (e) {
        // customElements.define or window properties are readonly in this environment (e.g., Safari iOS WKWebView)
    }
}

export function reset() {
    elements.length = 0;
}

export function stop() {
    reset();
    definedElements.clear();
}