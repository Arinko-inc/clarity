import { Config, Time } from "@clarity-types/core";
import { Setting } from "@clarity-types/data";
import * as arinkoDefaults from "@src/arinko/defaults"; // ARINKO

let config: Config = {
    projectId: null,
    delay: 1 * Time.Second,
    maxDelay: null, // ARINKO: src/arinko/delay.ts
    flushOnHide: true, // ARINKO: src/arinko/hide.ts
    lean: false,
    lite: false,
    track: true,
    content: true,
    drop: [],
    mask: [],
    unmask: arinkoDefaults.Unmask, // ARINKO: was []
    regions: [],
    cookies: [],
    fraud: true,
    checksum: [],
    report: null,
    upload: arinkoDefaults.Upload, // ARINKO: was null
    fallback: null,
    upgrade: null,
    action: null,
    dob: null,
    delayDom: false,
    throttleDom: true,
    conversions: false,
    includeSubdomains: true,
    modules: [],
    diagnostics: false,
    restart: Setting.RestartDelay,
};

export default config;
