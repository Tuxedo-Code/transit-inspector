import { describe, expect, it } from "vitest";
import { findForbiddenApis } from "./privacy";

describe("findForbiddenApis", () => {
  it.each([
    ['chrome.devtools.inspectedWindow.eval("1")', "inspectedWindow"],
    ["chrome.tabs.create({ url })", "chrome.tabs"],
    ["chrome.windows.create({ url })", "chrome.windows"],
    ["chrome.runtime.sendMessage(id, data)", "chrome.runtime"],
    ["chrome.scripting.executeScript(options)", "chrome.scripting"],
    ["window.open(url)", "window.open"],
    ["location.assign(url)", "location.assign"],
    ["location.replace(url)", "location.replace"],
    ['location.href="https://example.com"', "location.href="],
    ['link.rel="dns-prefetch"', "dns-prefetch"],
    ['link.rel="preconnect"', "preconnect"],
  ])("catches %s", (code, api) => {
    const found = findForbiddenApis(code);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(`\`${api}\``);
  });

  it("allows what the extension uses", () => {
    const code = [
      "chrome.devtools.network.getHAR(cb)",
      'chrome.devtools.panels.create("Transit", "", "panel.html")',
      "chrome.devtools.panels.setThemeChangeHandler(cb)",
      "const url = location.href",
      "if (location.href==url) {}",
      "new XMLHttpRequest",
    ].join(";");
    expect(findForbiddenApis(code)).toEqual([]);
  });
});
