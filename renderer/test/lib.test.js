import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CodeHighlighter } from '../src/lib/CodeHighlighter.js';
import { Html } from '../src/lib/Html.js';
import { RichText } from '../src/lib/RichText.js';

test('Html.escape neutralizes markup-significant characters', () => {
  assert.equal(
    Html.escape(`<a href="x" onclick='y'> & done`),
    '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt; &amp; done',
  );
});

test('Html.el renders attributes, drops empty ones, honours void elements', () => {
  assert.equal(
    Html.el('img', { src: 'a.png', alt: 'A part', hidden: true, title: null }),
    '<img src="a.png" alt="A part" hidden>',
  );
  assert.equal(Html.el('p', { class: 'x' }, 'one', ['two', 'three']), '<p class="x">onetwothree</p>');
});

test('Html.el refuses to emit inline styles', () => {
  assert.throws(() => Html.el('div', { style: 'color: red' }), /inline styles/);
});

test('RichText renders the restricted inline vocabulary', () => {
  assert.equal(
    RichText.render('Measure **V~out~** with `analogRead()` — see [Ohm](../knowledge/#ohms-law), R^2^ fit, *carefully*.'),
    'Measure <strong>V<sub>out</sub></strong> with <code>analogRead()</code> — see ' +
      '<a href="../knowledge/#ohms-law">Ohm</a>, R<sup>2</sup> fit, <em>carefully</em>.',
  );
});

test('RichText escapes rather than parses author-supplied HTML', () => {
  assert.equal(
    RichText.render('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;',
  );
});

test('RichText refuses unsafe link protocols', () => {
  const rendered = RichText.render('[x](javascript:alert(1)) and [y](https://mcmaster.ca)');
  assert.ok(!rendered.includes('href="javascript:'));
  assert.ok(rendered.includes('<a href="https://mcmaster.ca">y</a>'));
});

test('RichText code spans suppress inner formatting', () => {
  assert.equal(RichText.render('`a ** b` **c**'), '<code>a ** b</code> <strong>c</strong>');
});

test('RichText.plain strips formatting for titles and labels', () => {
  assert.equal(RichText.plain('The **divider** `Vout` [rule](#x)'), 'The divider Vout rule');
});

test('CodeHighlighter tokenizes Arduino source deterministically', () => {
  const source = '// setup\nconst int LED = 13; // pin\nvoid setup() { pinMode(LED, OUTPUT); }';
  const first = CodeHighlighter.highlight(source, 'arduino');
  assert.equal(first, CodeHighlighter.highlight(source, 'arduino'));
  assert.ok(first.includes('<span class="c-code__comment">// setup</span>'));
  assert.ok(first.includes('<span class="c-code__keyword">const</span>'));
  assert.ok(first.includes('<span class="c-code__type">void</span>'));
  assert.ok(first.includes('<span class="c-code__number">13</span>'));
});

test('CodeHighlighter escapes unknown languages as plain text', () => {
  assert.equal(CodeHighlighter.highlight('<b>&</b>', 'labview'), '&lt;b&gt;&amp;&lt;/b&gt;');
});

test('CodeHighlighter handles strings with escapes', () => {
  const html = CodeHighlighter.highlight('Serial.println("a \\" b");', 'arduino');
  assert.ok(html.includes('<span class="c-code__string">&quot;a \\&quot; b&quot;</span>'));
});
