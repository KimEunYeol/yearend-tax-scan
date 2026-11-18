/* 연말정산 놓친 돈 스캔 — 화면 */
(function () {
  'use strict';

  var E = window.TaxEngine;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var STORAGE_KEY = 'yearend-scan-2026-v1';

  var won = function (v) { return Math.round(v).toLocaleString('ko-KR'); };
  var manwon = function (v) {
    var m = v / 10000;
    return (Math.abs(m) >= 100 ? Math.round(m).toLocaleString('ko-KR') : (Math.round(m * 10) / 10).toLocaleString('ko-KR')) + '만원';
  };
  var pct = function (v) { return (v * 100).toFixed(1) + '%'; };

  /* ---------- 입력 ---------- */
  function digits(str) { return String(str || '').replace(/[^0-9]/g, ''); }

  function formatMoneyInput(el) {
    var d = digits(el.value);
    if (!d) { el.value = ''; return; }
    el.value = Number(d).toLocaleString('ko-KR');
  }

  function numOf(name) {
    var el = document.querySelector('[name="' + name + '"]');
    if (!el) return 0;
    if (el.type === 'checkbox') return el.checked;
    var d = digits(el.value);
    return d ? Number(d) : 0;
  }
  function rawNumOf(name) {
    var el = document.querySelector('[name="' + name + '"]');
    if (!el) return 0;
    if (el.type === 'number') return Number(el.value || 0);
    var dx = digits(el.value);
    return dx ? Number(dx) : 0;
  }

  function readInput() {
    var children = Math.max(0, rawNumOf('children'));
    var under8 = Math.min(Math.max(0, rawNumOf('childUnder8')), children);
    return {
      gross: numOf('gross'),
      withheld: numOf('withheld'),
      spouse: numOf('spouse'),
      children: children,
      childUnder8: under8,
      childrenForCredit: children - under8,
      childUnder18: children,
      seniors60: rawNumOf('seniors60'),
      seniors70: rawNumOf('seniors70'),
      disabled: rawNumOf('disabled'),
      rentAnnual: numOf('rentAnnual'),
      jeonseLoan: numOf('jeonseLoan'),
      housingSavings: numOf('housingSavings'),
      credit: numOf('credit'),
      debit: numOf('debit'),
      transit: numOf('transit'),
      market: numOf('market'),
      culture: numOf('culture'),
      medical: numOf('medical'),
      education: numOf('education'),
      insurancePremium: numOf('insurancePremium'),
      pensionAccount: numOf('pensionAccount'),
      hometownDonation: numOf('hometownDonation'),
      generalDonation: numOf('generalDonation'),
      married2026: numOf('married2026'),
      smeType: (document.querySelector('[name="smeType"]') || {}).value || 'none',
      pensionInsurance: digits((document.querySelector('[name="pensionInsurance"]') || {}).value || '') === '' ? null : numOf('pensionInsurance'),
      healthInsurance: digits((document.querySelector('[name="healthInsurance"]') || {}).value || '') === '' ? null : numOf('healthInsurance')
    };
  }

  /* ---------- 렌더 ---------- */
  function row(label, value, opts) {
    var tr = document.createElement('tr');
    if (opts && opts.strong) tr.className = 'table--strong';
    tr.innerHTML = '<td>' + label + '</td><td>' + value + '</td>';
    return tr;
  }

  function render() {
    if (!E) return;
    var input = readInput();
    var out = E.scan(input);
    var r = out.result;

    var refundPositive = r.refund >= 0;
    var card = $('#refundCard');
    card.classList.toggle('refund--pay', !refundPositive);
    $('#refundLabel').textContent = refundPositive ? '예상 환급액' : '예상 추가납부';
    $('#refundValue').textContent = (refundPositive ? '+' : '−') + won(Math.abs(r.refund)) + '원';
    $('#refundSub').textContent =
      '회사에서 뗀 세금 ' + won(r.withheld) + '원' + (r.withheldEstimated ? '(추정)' : '') +
      ' − 결정세액 ' + won(r.determinedTax) + '원';

    $('#statTax').textContent = won(r.determinedTax) + '원';
    $('#statTotal').textContent = won(r.totalTax) + '원';
    $('#statRate').textContent = pct(r.effectiveRate);
    $('#statNet').textContent = won(r.monthlyNet) + '원';

    // 놓친 돈
    var list = $('#missedList');
    list.innerHTML = '';
    out.items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'missed__item';
      li.innerHTML =
        '<div class="missed__row">' +
          '<p class="missed__title">' + item.title +
            '<span class="missed__badge">' + item.badge + '</span></p>' +
          '<span class="missed__gain">+' + won(item.gain) + '원</span>' +
        '</div>' +
        '<p class="missed__type">' + item.type + '</p>' +
        '<p class="missed__body">' + item.action + '</p>' +
        '<p class="missed__docs"><span><b>서류</b> ' + item.docs + '</span><span><b>기한</b> ' + item.deadline + '</span></p>';
      list.appendChild(li);
    });
    var sum = out.totalMissed;
    $('#missedSum').textContent = sum > 0 ? '+' + won(sum) + '원' : '0원';
    $('#missedNote').textContent = (out.sumIndividual > out.totalMissed + 1)
      ? '항목별 금액을 그대로 더하면 ' + won(out.sumIndividual) + '원이지만, 모두 반영하면 세금이 0원이 되는 지점까지만 실제로 돌아옵니다. 위 금액이 실제 합계입니다.'
      : '위 항목을 모두 반영했을 때 줄어드는 세금입니다.';
    $('#missedEmpty').hidden = out.items.length > 0;

    // 계산 내역
    var d = $('#tbodyDeduction');
    d.innerHTML = '';
    d.appendChild(row('근로소득공제', '−' + won(r.earnedIncomeDeduction)));
    d.appendChild(row('기본공제 (' + r.basicCount + '명)', '−' + won(r.basicDeduction)));
    d.appendChild(row('국민연금 (본인부담)', '−' + won(r.pensionInsurance)));
    d.appendChild(row('건강·요양·고용보험', '−' + won(r.healthInsurance)));
    if (r.housingDeduction) d.appendChild(row('주택자금 (전세대출·청약)', '−' + won(r.housingDeduction)));
    if (r.cardDeduction) d.appendChild(row('신용카드 등 사용액', '−' + won(r.cardDeduction)));
    d.appendChild(row('과세표준', won(r.taxBase) + '원', { strong: true }));

    var c = $('#tbodyCredit');
    c.innerHTML = '';
    if (r.reduction) c.appendChild(row('중소기업 취업자 감면', '−' + won(r.reduction)));
    if (r.earnedTaxCredit) c.appendChild(row('근로소득세액공제', '−' + won(r.earnedTaxCredit)));
    var cr = r.credits;
    if (r.usedStandardCredit) {
      c.appendChild(row('표준세액공제', '−' + won(cr.standard)));
    } else {
      if (cr.insurance) c.appendChild(row('보장성보험료', '−' + won(cr.insurance)));
      if (cr.medical) c.appendChild(row('의료비', '−' + won(cr.medical)));
      if (cr.education) c.appendChild(row('교육비', '−' + won(cr.education)));
      if (cr.donationGeneral) c.appendChild(row('일반 기부금', '−' + won(cr.donationGeneral)));
      if (cr.rent) c.appendChild(row('월세액', '−' + won(cr.rent)));
    }
    if (cr.pension) c.appendChild(row('연금계좌 (연금저축·IRP)', '−' + won(cr.pension)));
    if (cr.child) c.appendChild(row('자녀세액공제', '−' + won(cr.child)));
    if (cr.marriage) c.appendChild(row('결혼세액공제', '−' + won(cr.marriage)));
    if (cr.donationHometown) c.appendChild(row('고향사랑기부금', '−' + won(cr.donationHometown)));

    var t = $('#tbodyTax');
    t.innerHTML = '';
    t.appendChild(row('산출세액', won(r.calculatedTax) + '원'));
    t.appendChild(row('감면·공제 합계', '−' + won(r.calculatedTax - r.determinedTax) + '원'));
    t.appendChild(row('결정세액', won(r.determinedTax) + '원', { strong: true }));
    t.appendChild(row('개인지방소득세 (10%)', won(r.localTax) + '원'));
    t.appendChild(row('회사에서 뗀 세금', won(r.withheld) + '원' + (r.withheldEstimated ? ' (추정)' : '')));
    t.appendChild(row(refundPositive ? '환급액' : '추가납부', won(Math.abs(r.refund)) + '원', { strong: true }));

    $('#standardNote').textContent = r.usedStandardCredit
      ? '항목별 공제보다 표준세액공제(13만원)가 유리해 표준을 적용했습니다.'
      : '표준세액공제(13만원)와 비교해 항목별 공제가 유리해 항목별로 적용했습니다.';

    renderPrintSummary(input, r, out);

    // 고향사랑
    renderHometown();

    // 하단 바
    var sticky = $('#sticky');
    sticky.hidden = !(input.gross > 0);
    sticky.classList.toggle('sticky--pay', !refundPositive);
    $('#stickyValue').textContent = (refundPositive ? '+' : '−') + won(Math.abs(r.refund)) + '원';

    save(input);
    return { input: input, out: out };
  }

  function renderPrintSummary(input, r, out) {
    var rows = [
      ['연간 총급여', won(r.gross) + '원'],
      ['회사에서 뗀 소득세', won(r.withheld) + '원' + (r.withheldEstimated ? ' (추정)' : '')],
      ['과세표준', won(r.taxBase) + '원'],
      ['산출세액', won(r.calculatedTax) + '원'],
      ['감면·세액공제', '−' + won(r.calculatedTax - r.determinedTax) + '원'],
      ['결정세액 (지방세 포함)', won(r.totalTax) + '원'],
      [r.refund >= 0 ? '예상 환급액' : '예상 추가납부', won(Math.abs(r.refund)) + '원'],
      ['놓친 돈 (모두 반영 시)', '+' + won(out.totalMissed) + '원']
    ];
    var table = '<table><caption>입력 요약 · 2026년 귀속 연말정산</caption><tbody>';
    rows.forEach(function (row) {
      table += '<tr><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
    });
    table += '</tbody></table>';
    $('#printSummary').innerHTML = table;
  }

  function renderHometown() {
    var el = document.getElementById('hometownInput');
    var amount = Number(digits(el.value) || 0);
    var b = E.hometownBenefit(amount);
    var tb = $('#tbodyHometown');
    tb.innerHTML = '';
    tb.appendChild(row('세액공제 (국세)', won(b.creditNational) + '원'));
    tb.appendChild(row('지방소득세 포함', won(b.creditTotal) + '원'));
    tb.appendChild(row('답례품 (기부액 30%)', won(b.giftValue) + '원'));
    tb.appendChild(row('실제 부담', won(b.netCost) + '원', { strong: true }));
    tb.appendChild(row('총 혜택', won(b.benefit) + '원'));
  }

  /* ---------- 저장 ---------- */
  function save(input) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input)); } catch (e) {}
  }
  function restore() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    Object.keys(data).forEach(function (k) {
      var el = document.querySelector('[name="' + k + '"]');
      if (!el) return;
      var v = data[k];
      if (v === null || v === undefined) return;
      if (el.type === 'checkbox') { el.checked = !!v; return; }
      if (el.type === 'number') { el.value = v; return; }
      if (el.tagName === 'SELECT') { el.value = v; return; }
      if (v === 0) { el.value = el.hasAttribute('placeholder') ? '' : '0'; return; }
      el.value = Number(v).toLocaleString('ko-KR');
    });
  }

  /* ---------- 이벤트 ---------- */
  function init() {
    var form = $('#calc');

    $$('input[data-money]', form).forEach(function (el) {
      formatMoneyInput(el);
      el.addEventListener('input', function () {
        formatMoneyInput(el);
        render();
      });
    });

    $$('input[type="number"], input[type="checkbox"], select', form).forEach(function (el) {
      el.addEventListener('input', render);
      el.addEventListener('change', render);
    });

    $$('.chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetName = btn.getAttribute('data-set');
        var el = document.querySelector('[name="' + targetName + '"]') || document.getElementById(targetName);
        if (!el) return;
        el.value = Number(btn.getAttribute('data-value')).toLocaleString('ko-KR');
        if (el.hasAttribute('data-money')) formatMoneyInput(el);
        render();
      });
    });

    $('#reset').addEventListener('click', function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      window.location.reload();
    });
    $('#print').addEventListener('click', function () { window.print(); });

    var hometownEl = document.getElementById('hometownInput');
    formatMoneyInput(hometownEl);
    hometownEl.addEventListener('input', function () {
      formatMoneyInput(hometownEl);
      renderHometown();
    });

    restore();
    render();

    // D-day: 12월 31일까지
    var now = new Date();
    var end = new Date(now.getFullYear(), 11, 31);
    var days = Math.ceil((end - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    var dday = $('#dday');
    if (days >= 0) {
      dday.textContent = days === 0 ? 'D-DAY' : 'D—' + days;
      dday.title = '2026년 12월 31일까지 ' + days + '일';
    } else {
      dday.textContent = '정산 시즌';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__render = render;
})();
