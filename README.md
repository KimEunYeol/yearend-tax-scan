# 연말정산 놓친 돈 스캔

2026년 귀속 연말정산에서 아직 신청하지 않아 버리고 있는 공제·감면을 금액으로 계산해 보여주는 정적 웹앱입니다.

- 서비스: https://kimeunyeol.github.io/yearend-tax-scan/
- 서버·DB·외부 API를 쓰지 않습니다. 입력값은 브라우저 localStorage에만 남고 어디로도 전송되지 않습니다.

## 구성

```
index.html            화면 (입력 폼 · 결과 · 놓친 돈 스캔 · FAQ)
privacy.html          개인정보처리방침
assets/engine.js      계산 엔진 (순수 함수)
assets/app.js         화면 조작 · 저장 · 렌더
assets/style.css      스타일 (인쇄 스타일 포함)
robots.txt, sitemap.xml
```

로컬 실행: `python3 -m http.server 8080` 후 http://localhost:8080 접속.

## 계산 기준

소득세법(2026.1.1 시행)·조세특례제한법과 2025년 12월 개정세법을 반영한 참고용 계산기입니다. 법적 효력이 없고 실제 세액은 회사 원천징수와 홈택스 간소화 자료에 따라 달라집니다.
