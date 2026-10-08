import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightCode } from "../lib/code-highlighting";
import { normalizeCodeLanguage } from "../lib/code-languages";

test("auto detects a distinctive Python snippet without assigning a language to ordinary text", () => {
  assert.equal(
    highlightCode(
      'def greet(name):\n    message = f"Hello, {name}"\n    print(message)\n    return message',
    ).language,
    "python",
  );
  assert.equal(highlightCode("Some ordinary prose.").language, "");
  assert.equal(highlightCode("x = 1").language, "");
});

test("manual language and plain text override automatic detection", () => {
  const code = "SELECT id, name FROM users WHERE active = true ORDER BY name;";
  assert.equal(highlightCode(code, "sql").language, "sql");
  assert.match(highlightCode(code, "sql").html, /hljs-keyword/);
  assert.equal(highlightCode(code, "plaintext").html, code);
  assert.equal(normalizeCodeLanguage("tsx"), "typescript");
  assert.equal(normalizeCodeLanguage("auto"), "");
});

test("unsupported labels remain plain and retain their label", () => {
  const highlighted = highlightCode(
    "<script>alert('example')</script>",
    "custom-language",
  );
  assert.equal(highlighted.language, "custom-language");
  assert.ok(!highlighted.html.includes("<script>"));
});

test("highlighted HTML escapes authored markup instead of creating executable elements", () => {
  const result = highlightCode(
    '<img src=x onerror="alert(1)">\n<script>alert(1)</script>',
    "html",
  );
  assert.ok(!result.html.includes("<img"));
  assert.ok(!result.html.includes("<script"));
  assert.match(result.html, /&lt;/);
});

test("large files retain every character and skip expensive highlighting", () => {
  const code = "<script>" + " ".repeat(100_001) + "</script>";
  const result = highlightCode(code, "javascript");
  assert.equal(result.language, "javascript");
  assert.equal(
    result.html,
    code.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
  );
});
