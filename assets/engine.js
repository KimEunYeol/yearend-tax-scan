/*!
 * 연말정산 놓친 돈 스캔 — 계산 엔진
 * 기준: 2026년 귀속 연말정산 (2027년 1~2월 회사 정산)
 * 법령: 소득세법(2026.1.1 시행, 법률 제21221호), 조세특례제한법, 2025.12 개정세법
 *
 * 화면과 분리된 순수 함수 모음. 브라우저(window.TaxEngine)와 테스트에서 같이 씁니다.
 * 금액 단위: 원. 모든 반올림은 원 단위.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TaxEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var R = {
    year: 2026,
    label: '2026년 귀속 (2027년 1~2월 정산)',

    // 소득세법 §55 기본세율 (2026년)
    taxBrackets: [
      { upTo: 14000000, rate: 0.06, cumulative: 0 },
      { upTo: 50000000, rate: 0.15, cumulative: 1260000 },
      { upTo: 88000000, rate: 0.24, cumulative: 5760000 },
      { upTo: 150000000, rate: 0.35, cumulative: 15440000 },
      { upTo: 300000000, rate: 0.38, cumulative: 19940000 },
      { upTo: 500000000, rate: 0.40, cumulative: 25940000 },
      { upTo: 1000000000, rate: 0.42, cumulative: 35940000 },
      { upTo: Infinity, rate: 0.45, cumulative: 65940000 }
    ],

    // 소득세법 §47 근로소득공제
    earnedDeduction: [
      { upTo: 5000000, base: 0, rate: 0.70, from: 0 },
      { upTo: 15000000, base: 3500000, rate: 0.40, from: 5000000 },
      { upTo: 45000000, base: 7500000, rate: 0.15, from: 15000000 },
      { upTo: 100000000, base: 12000000, rate: 0.05, from: 45000000 },
      { upTo: Infinity, base: 14750000, rate: 0.02, from: 100000000 }
    ],
    earnedDeductionCap: 20000000,

    // 소득세법 §50 기본공제 / §51 추가공제
    personalBase: 1500000,
    senior70Extra: 1000000,
    disabledExtra: 2000000,

    // 4대보험 본인부담 (2025년 요율 기준, 직접 입력하면 그 값 사용)
    rates: {
      pension: 0.045,          // 국민연금 근로자 4.5%
      health: 0.03545,         // 건강보험 근로자 3.545%
      longTermCare: 0.004591,  // 노인장기요양 근로자 0.4591%
      employment: 0.009        // 고용보험 근로자 0.9%
    },

    // 조특법 §126의2 신용카드 등 사용금액 소득공제
    card: {
      thresholdRate: 0.25,
      rates: { credit: 0.15, debit: 0.30, market: 0.40, transit: 0.40, culture: 0.30 },
      baseLimitLow: 3000000,      // 총급여 7,000만 이하
      baseLimitHigh: 2500000,     // 총급여 7,000만 초과
      childBonus: 500000,         // 2026년 귀속: 18세 미만 자녀 1명당
      childBonusMax: 1000000,
      childBonusHigh: 250000,
      childBonusHighMax: 500000,
      extraLimit: { market: 1000000, transit: 1000000, culture: 1000000 }
    },

    // 소득세법 §52④ 주택임차차입금 / 조특법 §87 주택마련저축
    housing: { savingsRate: 0.40, savingsCap: 3000000, loanRate: 0.40, combinedCap: 4000000 },

    // 소득세법 §59의4 월세액 세액공제
    rent: { limit: 10000000, rateLow: 0.17, rateHigh: 0.15, grossCap: 80000000, lowGrossCap: 55000000 },

    // 소득세법 §59의3 연금계좌 세액공제
    pensionAccount: { limit: 9000000, rateLow: 0.15, rateHigh: 0.12, lowGrossCap: 55000000 },

    // 소득세법 §59의4② 보장성보험료
    insurance: { rate: 0.12, limit: 1000000, disabledRate: 0.15 },

    // 소득세법 §59의4③ 의료비
    medical: { rate: 0.15, thresholdRate: 0.03, limit: 7000000 },

    // 소득세법 §59의4④ 교육비
    education: { rate: 0.15 },

    // 소득세법 §59의4⑤ 기부금 / 조특법 §58 고향사랑기부금
    donation: {
      generalRate: 0.15,
      generalHighRate: 0.30,
      generalBreak: 10000000,
      hometown: { full: 100000, mid: 100000, midRate: 0.40, overRate: 0.15, limit: 20000000 }
    },

    // 소득세법 §59의2 자녀세액공제
    child: { one: 250000, two: 550000, extra: 400000 },

    // 조특법 §95의2 결혼세액공제 (2024.1.1~2026.12.31 혼인신고)
    marriage: 500000,

    // 소득세법 §59의4① 표준세액공제
    standardCredit: 130000,

    // 소득세법 §59 근로소득세액공제
    earnedCredit: {
      breakTax: 1300000,
      lowRate: 0.55,
      base: 715000,
      highRate: 0.30,
      caps: [
        { upTo: 33000000, cap: 740000 },
        { upTo: 70000000, cap: 660000 },
        { upTo: 120000000, cap: 500000 },
        { upTo: Infinity, cap: 200000 }
      ]
    },

    // 조특법 §30 중소기업 취업자 소득세 감면
    sme: {
      cap: 2000000,
      rates: { youth: 0.90, senior: 0.70, disabled: 0.70, career: 0.70 },
      labels: { youth: '청년(15~34세)', senior: '60세 이상', disabled: '장애인', career: '경력단절 근로자' }
    },

    // 지방소득세 (개인지방소득세 10%)
    localRate: 0.10
  };

  function n(v) {
    var x = Number(v);
    return isFinite(x) ? x : 0;
  }
  function floorWon(v) { return Math.floor(v); }
  function manwonText(v) { return Math.round(v / 10000).toLocaleString('ko-KR') + '만원'; }

  /* ---------- 1. 근로소득공제 ---------- */
  function earnedDeduction(gross) {
    if (gross <= 0) return 0;
    var row = R.earnedDeduction.find(function (b) { return gross <= b.upTo; });
    var amount = row.base + (gross - row.from) * row.rate;
    return Math.min(floorWon(amount), R.earnedDeductionCap);
  }

  /* ---------- 2. 산출세액 ---------- */
  function taxOnBase(base) {
    if (base <= 0) return 0;
    var b = R.taxBrackets.find(function (x) { return base <= x.upTo; });
    return Math.max(0, floorWon(base * b.rate - b.cumulative));
  }

  function rateOnBase(base) {
    var b = R.taxBrackets.find(function (x) { return base <= x.upTo; });
    return b.rate;
  }

  /* ---------- 3. 인적공제 ---------- */
  function personalDeduction(p) {
    var count = 1
      + (p.spouse ? 1 : 0)
      + Math.max(0, n(p.children))
      + Math.max(0, n(p.seniors60))
      + Math.max(0, n(p.disabled));
    var amount = count * R.personalBase
      + Math.max(0, n(p.seniors70)) * R.senior70Extra
      + Math.max(0, n(p.disabled)) * R.disabledExtra;
    return { count: count, amount: amount };
  }

  /* ---------- 4. 신용카드 등 소득공제 ---------- */
  function cardDeduction(gross, p) {
    var use = {
      credit: Math.max(0, n(p.credit)),
      debit: Math.max(0, n(p.debit)),
      market: Math.max(0, n(p.market)),
      transit: Math.max(0, n(p.transit)),
      culture: Math.max(0, n(p.culture))
    };
    var threshold = floorWon(gross * R.card.thresholdRate);
    var need = threshold;
    var moved = {};
    // 최저사용금액(총급여 25%)은 신용카드 → 체크·현금 → 전통시장 → 대중교통 → 도서·공연 순으로 차감
    ['credit', 'debit', 'market', 'transit', 'culture'].forEach(function (k) {
      var take = Math.min(use[k], need);
      moved[k] = take;
      need -= take;
    });

    var isLow = gross <= 70000000;
    var baseLimit = isLow ? R.card.baseLimitLow : R.card.baseLimitHigh;
    var bonusPer = isLow ? R.card.childBonus : R.card.childBonusHigh;
    var bonusMax = isLow ? R.card.childBonusMax : R.card.childBonusHighMax;
    var childBonus = Math.min(Math.max(0, n(p.childUnder18)) * bonusPer, bonusMax);
    var limit = baseLimit + childBonus;

    var excessCredit = Math.max(0, use.credit - moved.credit);
    var excessDebit = Math.max(0, use.debit - moved.debit);
    var basePart = excessCredit * R.card.rates.credit + excessDebit * R.card.rates.debit;
    basePart = Math.min(floorWon(basePart), limit);

    var extra = 0;
    var extraDetail = {};
    ['market', 'transit', 'culture'].forEach(function (k) {
      var excess = Math.max(0, use[k] - moved[k]);
      var part = Math.min(floorWon(excess * R.card.rates[k]), R.card.extraLimit[k]);
      extraDetail[k] = part;
      extra += part;
    });

    return {
      threshold: threshold,
      limit: limit,
      childBonus: childBonus,
      basePart: basePart,
      extraDetail: extraDetail,
      amount: basePart + extra
    };
  }

  /* ---------- 5. 주택자금 ---------- */
  function housingDeduction(p) {
    var savings = Math.min(Math.max(0, n(p.housingSavings)), R.housing.savingsCap) * R.housing.savingsRate;
    var loan = Math.max(0, n(p.jeonseLoan)) * R.housing.loanRate;
    return Math.min(floorWon(savings + loan), R.housing.combinedCap);
  }

  /* ---------- 6. 근로소득세액공제 ---------- */
  function earnedTaxCredit(calculatedTax, gross) {
    if (calculatedTax <= 0) return 0;
    var c = R.earnedCredit;
    var raw = calculatedTax <= c.breakTax
      ? calculatedTax * c.lowRate
      : c.base + (calculatedTax - c.breakTax) * c.highRate;
    var cap = c.caps.find(function (x) { return gross <= x.upTo; }).cap;
    return floorWon(Math.min(raw, cap));
  }

  /* ---------- 7. 기부금 ---------- */
  function donationCredits(p, gross) {
    var hometown = Math.max(0, n(p.hometownDonation));
    var general = Math.max(0, n(p.generalDonation));

    var hPart = 0;
    var remaining = Math.min(hometown, R.donation.hometown.limit);
    var first = Math.min(remaining, R.donation.hometown.full);
    hPart += first;
    remaining -= first;
    var second = Math.min(remaining, R.donation.hometown.mid);
    hPart += floorWon(second * R.donation.hometown.midRate);
    remaining -= second;
    hPart += floorWon(Math.max(0, remaining) * R.donation.hometown.overRate);

    var gPart = 0;
    if (general > 0) {
      var low = Math.min(general, R.donation.generalBreak);
      gPart += floorWon(low * R.donation.generalRate);
      gPart += floorWon(Math.max(0, general - R.donation.generalBreak) * R.donation.generalHighRate);
    }
    return { hometown: hPart, general: gPart, total: hPart + gPart };
  }

  /* ---------- 8. 자녀세액공제 ---------- */
  function childCredit(p) {
    var k = Math.max(0, n(p.childrenForCredit));
    if (k <= 0) return 0;
    if (k === 1) return R.child.one;
    if (k === 2) return R.child.two;
    return R.child.two + (k - 2) * R.child.extra;
  }

  /* ---------- 9. 간이세액 추정 (기납부세액) ---------- */
  function estimateWithheld(input, basic) {
    // 회사가 간이세액표로 떼는 금액의 근사: 기본공제·연금보험료·표준세액공제만 반영
    var gross = Math.max(0, n(input.gross));
    var eid = earnedDeduction(gross);
    var earned = Math.max(0, gross - eid);
    var base = earned
      - basic.count * R.personalBase
      - basic.pension
      - R.standardCredit;
    base = Math.max(0, base);
    var tax = taxOnBase(base);
    var credit = earnedTaxCredit(tax, gross);
    var netTax = Math.max(0, tax - credit);
    var ratio = [0.8, 1, 1.2].indexOf(n(input.withholdingRatio)) >= 0 ? n(input.withholdingRatio) : 1;
    return Math.round(netTax * ratio / 1000) * 1000;
  }

  /* ---------- 메인 계산 ---------- */
  function compute(rawInput) {
    var input = rawInput || {};
    var gross = Math.max(0, n(input.gross));

    var eid = earnedDeduction(gross);
    var earned = Math.max(0, gross - eid);

    var basic = {
      count: personalDeduction(input).count,
      amount: personalDeduction(input).amount
    };

    var pensionIns = input.pensionInsurance === undefined || input.pensionInsurance === null || input.pensionInsurance === ''
      ? floorWon(gross * R.rates.pension)
      : Math.max(0, n(input.pensionInsurance));
    var healthIns = input.healthInsurance === undefined || input.healthInsurance === null || input.healthInsurance === ''
      ? floorWon(gross * (R.rates.health + R.rates.longTermCare + R.rates.employment))
      : Math.max(0, n(input.healthInsurance));
    basic.pension = pensionIns;

    var housing = housingDeduction(input);
    var card = cardDeduction(gross, input);

    // 소득공제
    var specialIncome = pensionIns + healthIns + housing; // 연금보험료공제 + 특별소득공제
    var otherIncome = card.amount;                        // 그 밖의 소득공제
    var taxBaseItemized = Math.max(0, earned - basic.amount - specialIncome - otherIncome);
    var taxBaseStandard = Math.max(0, earned - basic.amount - pensionIns - otherIncome);

    var calculatedTax = taxOnBase(taxBaseItemized); // 산출세액은 과세표준에 따라 달라짐

    // 중소기업 취업자 소득세 감면
    var smeType = input.smeType || 'none';
    var smeEligible = smeType !== 'none' && !!R.sme.rates[smeType];
    var reduction = smeEligible
      ? Math.min(floorWon(calculatedTax * R.sme.rates[smeType]), R.sme.cap)
      : 0;
    var taxAfterReduction = Math.max(0, calculatedTax - reduction);
    var earnedCr = Math.min(earnedTaxCredit(calculatedTax, gross), taxAfterReduction);

    // 항목별 세액공제
    var insuranceCr = Math.min(floorWon(Math.max(0, n(input.insurancePremium)) * R.insurance.rate), R.insurance.limit);
    var disabledInsCr = Math.min(floorWon(Math.max(0, n(input.disabledInsurancePremium)) * R.insurance.disabledRate), R.insurance.limit);

    var medicalBase = Math.max(0, n(input.medical)) - floorWon(gross * R.medical.thresholdRate);
    medicalBase = Math.max(0, Math.min(medicalBase, R.medical.limit));
    var medicalCr = floorWon(medicalBase * R.medical.rate);

    var educationCr = floorWon(Math.max(0, n(input.education)) * R.education.rate);

    var don = donationCredits(input, gross);

    var rentAnnual = Math.max(0, n(input.rentAnnual));
    var rentCr = 0;
    if (gross <= R.rent.grossCap && rentAnnual > 0 && input.renter !== false) {
      var rate = gross <= R.rent.lowGrossCap ? R.rent.rateLow : R.rent.rateHigh;
      rentCr = floorWon(Math.min(rentAnnual, R.rent.limit) * rate);
    }

    var pensionCr = 0;
    var pensionPaid = Math.max(0, n(input.pensionAccount));
    if (pensionPaid > 0) {
      var prate = gross <= R.pensionAccount.lowGrossCap ? R.pensionAccount.rateLow : R.pensionAccount.rateHigh;
      pensionCr = floorWon(Math.min(pensionPaid, R.pensionAccount.limit) * prate);
    }

    var childCr = childCredit(input);
    var marriageCr = input.married2026 ? R.marriage : 0;

    var specialCredits = insuranceCr + disabledInsCr + medicalCr + educationCr + don.general;

    // 표준세액공제 비교 (소득세법 §59의4①)
    var itemizedCredits = specialCredits + rentCr + pensionCr + childCr + marriageCr + don.hometown;
    var standardCredits = R.standardCredit + pensionCr + childCr + marriageCr + don.hometown;

    var taxItemized = Math.max(0, taxAfterReduction - earnedCr - itemizedCredits);
    var taxStandardBase = taxOnBase(taxBaseStandard);
    // 표준 모드에서는 산출세액이 달라질 수 있으므로 별도 계산
    var reductionStd = smeEligible ? Math.min(floorWon(taxStandardBase * R.sme.rates[smeType]), R.sme.cap) : 0;
    var earnedCrStd = Math.min(earnedTaxCredit(taxStandardBase, gross), Math.max(0, taxStandardBase - reductionStd));
    var taxStandard = Math.max(0, taxStandardBase - reductionStd - earnedCrStd - standardCredits);

    var useStandard = taxStandard < taxItemized;
    var determinedTax = useStandard ? taxStandard : taxItemized;
    var localTax = floorWon(determinedTax * R.localRate);

    // 기납부세액
    var withheldGiven = n(input.withheld);
    var withheld = withheldGiven > 0 ? withheldGiven : estimateWithheld(input, basic);

    var refund = withheld - determinedTax;

    // 실수령액 (연간 기준 월 평균)
    var monthlyNet = Math.floor((gross - pensionIns - healthIns - determinedTax - localTax) / 12);

    var marginalRate = rateOnBase(taxBaseItemized);

    // 상세 내역
    return {
      year: R.year,
      input: input,
      gross: gross,
      earnedIncomeDeduction: eid,
      earnedIncome: earned,
      basicDeduction: basic.amount,
      basicCount: basic.count,
      pensionInsurance: pensionIns,
      healthInsurance: healthIns,
      housingDeduction: housing,
      cardDeduction: card.amount,
      cardDetail: card,
      taxBase: useStandard ? taxBaseStandard : taxBaseItemized,
      taxBaseItemized: taxBaseItemized,
      taxBaseStandard: taxBaseStandard,
      calculatedTax: useStandard ? taxStandardBase : calculatedTax,
      reduction: useStandard ? reductionStd : reduction,
      smeType: smeEligible ? smeType : 'none',
      earnedTaxCredit: useStandard ? earnedCrStd : earnedCr,
      credits: {
        insurance: insuranceCr + disabledInsCr,
        medical: medicalCr,
        education: educationCr,
        donationGeneral: don.general,
        donationHometown: don.hometown,
        rent: rentCr,
        pension: pensionCr,
        child: childCr,
        marriage: marriageCr,
        standard: useStandard ? R.standardCredit : 0,
        total: useStandard ? standardCredits : itemizedCredits
      },
      usedStandardCredit: useStandard,
      determinedTax: determinedTax,
      localTax: localTax,
      totalTax: determinedTax + localTax,
      withheld: withheld,
      withheldEstimated: withheldGiven <= 0,
      refund: refund,
      monthlyNet: monthlyNet,
      marginalRate: marginalRate,
      effectiveRate: gross > 0 ? (determinedTax + localTax) / gross : 0
    };
  }

  /* ---------- 고향사랑기부 손익 ---------- */
  function hometownBenefit(amount) {
    var a = Math.max(0, n(amount));
    var creditNat = 0;
    var remaining = Math.min(a, R.donation.hometown.limit);
    var first = Math.min(remaining, 100000); creditNat += first; remaining -= first;
    var second = Math.min(remaining, 100000); creditNat += Math.floor(second * 0.4); remaining -= second;
    creditNat += Math.floor(Math.max(0, remaining) * 0.15);
    var local = Math.floor(creditNat * 0.1);
    var gift = Math.min(Math.floor(a * 0.3), 20000000);
    var creditTotal = creditNat + local;
    return {
      amount: a,
      creditNational: creditNat,
      creditLocal: local,
      creditTotal: creditTotal,
      giftValue: gift,
      netCost: a - creditTotal - gift,
      benefit: creditTotal + gift
    };
  }

  /* ---------- 놓친 돈 스캔 ---------- */
  function scan(input) {
    var base = compute(input);
    var items = [];
    var patches = {};

    function add(item, patch) {
      items.push(item);
      patches = Object.assign(patches, patch || {});
    }

    // 1) 중소기업 취업자 소득세 감면
    if (base.smeType === 'none') {
      var best = 'youth';
      var bestGain = 0;
      ['youth', 'senior', 'disabled', 'career'].forEach(function (t) {
        var r = compute(Object.assign({}, input, { smeType: t }));
        var g = base.determinedTax - r.determinedTax;
        if (g > bestGain) { bestGain = g; best = t; }
      });
      if (bestGain > 0) {
        add({
          id: 'sme',
          title: '중소기업 취업자 소득세 감면',
          gain: bestGain,
          badge: '신청 안 하면 사라짐',
          type: R.sme.labels[best] + ' 기준 최대',
          action: '34세 이하·60세 이상·장애인·경력단절 근로자라면 대상입니다. 회사에 「중소기업 취업자 소득세 감면신청서」를 내면 되고, 기한을 놓쳤어도 소급 신청이 됩니다.',
          docs: '감면신청서, 병역복무기간 증명서(해당 시)',
          deadline: '청년 5년 · 그 외 3년'
        }, { smeType: best });
      }
    }

    // 2) 월세 세액공제 미반영
    if (n(input.rentAnnual) === 0 && base.gross <= R.rent.grossCap) {
      var rentGain = base.determinedTax - compute(Object.assign({}, input, { rentAnnual: R.rent.limit })).determinedTax;
      if (rentGain > 0) {
        add({
          id: 'rent',
          title: '월세 세액공제',
          gain: rentGain,
          badge: '계약서·전입신고 확인',
          type: '연 1,000만원 한도까지',
          action: '월세를 내고 있다면 연 1,000만원까지 15~17% 세액공제됩니다. 임대차계약서 주소와 주민등록 주소가 같아야 합니다.',
          docs: '주민등록등본, 임대차계약서 사본, 계좌이체 내역',
          deadline: '12/31 납부분까지'
        }, { rentAnnual: R.rent.limit });
      }
    }

    // 3) 연금저축·IRP 추가 납입
    var paid = Math.max(0, n(input.pensionAccount));
    if (paid < R.pensionAccount.limit) {
      var addAmount = R.pensionAccount.limit - paid;
      var prate = base.gross <= R.pensionAccount.lowGrossCap ? R.pensionAccount.rateLow : R.pensionAccount.rateHigh;
      var pGain = floorWon(addAmount * prate);
      if (pGain > 0) {
        add({
          id: 'pension',
          title: '연금저축·IRP 추가 납입',
          gain: pGain,
          badge: '12/31 입금 마감',
          type: manwonText(addAmount) + ' 더 넣으면 (한도 900만)',
          action: '연금저축 600만원 + IRP 300만원까지 세액공제됩니다. 12월 31일까지 입금된 금액만 인정됩니다.',
          docs: '연금저축·IRP 납입증명서',
          deadline: '12/31 입금분까지'
        }, { pensionAccount: R.pensionAccount.limit });
      }
    }

    // 4) 고향사랑기부
    var hd = Math.max(0, n(input.hometownDonation));
    if (hd < 200000) {
      var hGain = base.determinedTax - compute(Object.assign({}, input, { hometownDonation: 200000 })).determinedTax;
      if (hGain > 0) {
        add({
          id: 'hometown',
          title: '고향사랑기부 20만원',
          gain: hGain,
          badge: '답례품 최대 6만원',
          type: (200000 - hd).toLocaleString('ko-KR') + '원 추가 기부 시',
          action: '10만원까지 전액, 10~20만원 구간은 40%(지방세 포함 44%) 세액공제됩니다. 기부액의 30%는 답례품으로 돌아옵니다.',
          docs: '고향사랑e음 기부 영수증',
          deadline: '12/31 기부분까지'
        }, { hometownDonation: 200000 });
      }
    }

    // 5) 신용카드 → 체크카드 전환
    var excessCredit = Math.max(0, n(input.credit) - base.gross * R.card.thresholdRate);
    if (excessCredit > 0) {
      var move = Math.min(excessCredit, 1000000);
      var cGain = base.determinedTax - compute(Object.assign({}, input, {
        credit: Math.max(0, n(input.credit) - move),
        debit: n(input.debit) + move
      })).determinedTax;
      if (cGain > 0) {
        add({
          id: 'card',
          title: '신용카드 → 체크카드 전환',
          gain: cGain,
          badge: '총급여 25% 초과분',
          type: manwonText(move) + ' 전환 시',
          action: '총급여의 25%까지는 신용카드, 그 초과분은 체크카드·현금영수증이 두 배(15% → 30%) 공제됩니다.',
          docs: '카드사용내역(간소화 서비스에서 자동)',
          deadline: '12/31 사용분까지'
        }, { credit: Math.max(0, n(input.credit) - move), debit: n(input.debit) + move });
      }
    }

    // 6) 부양가족 기본공제 누락
    if (n(input.seniors60) === 0) {
      var sGain = base.determinedTax - compute(Object.assign({}, input, { seniors60: 1 })).determinedTax;
      if (sGain > 0) {
        add({
          id: 'parents',
          title: '부모님 부양가족 공제',
          gain: sGain,
          badge: '소득 100만원 이하 요건',
          type: '60세 이상 1명 추가 시',
          action: '같은 주소에 살지 않아도 부양하고 있다면 공제 대상이 될 수 있습니다. 형제자매 중 한 사람만 받을 수 있습니다.',
          docs: '가족관계증명서, (필요 시) 부양 증빙',
          deadline: '연말정산 서류 제출 시'
        }, { seniors60: 1 });
      }
    }

    // 7) 결혼세액공제
    if (!input.married2026) {
      var mGain = base.determinedTax - compute(Object.assign({}, input, { married2026: true })).determinedTax;
      if (mGain > 0) {
        add({
          id: 'marriage',
          title: '결혼세액공제',
          gain: mGain,
          badge: '2026년이 마지막 해',
          type: '2024~2026년 혼인신고',
          action: '2024.1.1~2026.12.31 혼인신고한 부부는 1인당 50만원(부부 합산 최대 100만원), 평생 1회 세액공제됩니다.',
          docs: '혼인관계증명서',
          deadline: '2026년 혼인신고분까지'
        }, { married2026: true });
      }
    }

    // 8) 보장성보험 100만원 한도
    var insPaid = n(input.insurancePremium);
    if (insPaid > 0 && insPaid < R.insurance.limit) {
      var iGain = floorWon((R.insurance.limit - insPaid) * R.insurance.rate);
      if (iGain > 0) {
        add({
          id: 'insurance',
          title: '보장성보험 100만원 채우기',
          gain: iGain,
          badge: '연말 납입분 인정',
          type: manwonText(R.insurance.limit - insPaid) + ' 추가 납입 시',
          action: '보장성보험료는 100만원까지 12% 세액공제됩니다. 연말에 몰아 납입해도 됩니다.',
          docs: '보장성보험료 납입증명서',
          deadline: '12/31 납입분까지'
        }, { insurancePremium: R.insurance.limit });
      }
    }

    items.sort(function (a, b) { return b.gain - a.gain; });

    var combined = compute(Object.assign({}, input, patches));
    var sumIndividual = items.reduce(function (s, x) { return s + x.gain; }, 0);
    var totalMissed = Math.max(0, base.determinedTax - combined.determinedTax);

    return {
      result: base,
      items: items,
      totalMissed: totalMissed,
      sumIndividual: sumIndividual,
      combinedTax: combined.determinedTax
    };
  }

  return {
    RULES: R,
    compute: compute,
    scan: scan,
    hometownBenefit: hometownBenefit,
    earnedDeduction: earnedDeduction,
    taxOnBase: taxOnBase,
    estimateWithheld: estimateWithheld,
    rateOnBase: rateOnBase
  };
});
