const health = document.querySelector('#health');
const form = document.querySelector('#form');
const text = document.querySelector('#text');
const ingredients = document.querySelector('#ingredients');
const question = document.querySelector('#question');
const submit = document.querySelector('#submit');
const result = document.querySelector('#result');

function addText(parent, tag, value, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  parent.append(element);
  return element;
}

function showNotice(parent, value) {
  if (value) addText(parent, 'p', value, 'notice');
}

async function loadHealth() {
  try {
    const response = await fetch('/api/health');
    const body = await response.json();
    health.textContent = body.status === 'ok' ? `キットサーバー接続中 · ${body.mode} モード` : 'キットサーバーを確認できません。';
    health.className = body.status === 'ok' ? 'status ok' : 'status error';
  } catch {
    health.textContent = 'キットサーバーに接続できません。先に起動してください。';
    health.className = 'status error';
  }
}

function renderExpression(section, data) {
  addText(section, 'p', 'TEXT REVIEW · 表現チェック', 'result-kicker');
  const findings = Array.isArray(data.findings) ? data.findings : [];
  addText(section, 'h2', findings.length ? `${findings.length}件の確認候補` : '該当するルールはありません');
  if (findings.length) {
    const list = document.createElement('ul');
    for (const finding of findings) {
      const item = document.createElement('li');
      addText(item, 'span', finding.severity === 'high' ? '要確認' : '注意', `badge ${finding.severity === 'high' ? 'high' : 'caution'}`);
      addText(item, 'strong', finding.text || '対象箇所');
      addText(item, 'p', finding.message || '表現を確認してください。');
      if (finding.suggestions?.length) addText(item, 'p', `言い換え例：${finding.suggestions.join('、')}`, 'suggestion');
      if (finding.source) addText(item, 'p', `出典：${finding.source}`, 'source');
      list.append(item);
    }
    section.append(list);
  } else addText(section, 'p', 'このルール表に該当する表現が見つからなかったことを示します。');
  showNotice(section, data.notice);
}

function renderIngredients(section, data) {
  addText(section, 'p', 'INGREDIENTS · 成分表照合', 'result-kicker');
  addText(section, 'h2', '読み取った成分');
  const groups = [
    ['主な成分', data.keyIngredients],
    ['役割', data.roles?.map((role) => role.label ?? role.name ?? JSON.stringify(role))],
    ['未登録成分', data.unknown],
  ];
  for (const [label, values] of groups) {
    if (!Array.isArray(values) || values.length === 0) continue;
    const row = document.createElement('p');
    addText(row, 'strong', `${label}：`);
    row.append(document.createTextNode(values.join('、')));
    section.append(row);
  }
  if (!data.keyIngredients?.length && !data.roles?.length && !data.unknown?.length) addText(section, 'p', '成分表から登録済みの情報を読み取れませんでした。');
  addText(section, 'p', '成分名の照合結果です。配合量・製品での効果・安全性を示すものではありません。', 'subtle');
}

function renderConsultation(section, data, error) {
  addText(section, 'p', 'REFERENCE · 根拠資料への相談', 'result-kicker');
  if (error) { addText(section, 'p', error, 'unavailable'); return; }
  if (!data) return;
  addText(section, 'h2', data.kind === 'answer' ? '資料からの抜粋' : '回答を保留しました');
  addText(section, 'p', data.answer || '回答はありません。');
  for (const citation of data.citations ?? []) {
    const sources = (citation.sources ?? []).map((source) => `${source.url}${source.locator ? `（${source.locator}）` : ''}`).join(' · ');
    addText(section, 'p', `${citation.chunkId}${sources ? ` — ${sources}` : ''}`, 'source');
  }
  showNotice(section, data.expressionCheck?.notice);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = { text: text.value.trim(), ingredients: ingredients.value.trim(), question: question.value.trim() };
  if (!payload.text || !payload.ingredients) {
    result.replaceChildren();
    addText(result, 'p', '商品説明と全成分表示の両方を入力してください。', 'error-message');
    return;
  }
  submit.disabled = true;
  submit.textContent = '確認しています…';
  result.setAttribute('aria-busy', 'true');
  result.replaceChildren();
  addText(result, 'p', '入力された商品情報を確認しています。', 'subtle');
  try {
    const response = await fetch('/api/analyze-product', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? '確認に失敗しました。');
    result.replaceChildren();
    const expressionSection = document.createElement('section');
    expressionSection.className = 'result-section';
    renderExpression(expressionSection, body.expression);
    const ingredientSection = document.createElement('section');
    ingredientSection.className = 'result-section';
    renderIngredients(ingredientSection, body.ingredients);
    result.append(expressionSection, ingredientSection);
    if (payload.question) {
      const consultationSection = document.createElement('section');
      consultationSection.className = 'result-section';
      renderConsultation(consultationSection, body.consultation, body.consultationError);
      result.append(consultationSection);
    }
  } catch (error) {
    result.replaceChildren();
    addText(result, 'p', error instanceof Error ? error.message : '確認に失敗しました。', 'error-message');
  } finally {
    submit.disabled = false;
    submit.innerHTML = 'レビュー結果を見る <span aria-hidden="true">→</span>';
    result.setAttribute('aria-busy', 'false');
  }
});

loadHealth();
