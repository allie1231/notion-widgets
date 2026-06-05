# notion-widgets

스튜디오 잇재 노션 위젯 모음. GitHub Pages로 호스팅해서 Notion embed로 사용.

## 위젯 목록

| 위젯 | 경로 | 설명 |
|------|------|------|
| VHS Clock | `/widgets/vhs-clock/` | VHS 타임스탬프 스타일 시계 |
| Receipt Log | `/widgets/receipt-log/` | 영수증 감성 데일리 플래너 (localStorage 저장) |
| Tamagotchi | `/widgets/tamagotchi/` | 픽셀 캐릭터 습관 트래커 |
| iPod Timer | `/widgets/ipod-timer/` | 아이팟 클래식 스타일 포모도로 타이머 |
| Typewriter | `/widgets/typewriter/` | 타자기 애니메이션 명언 위젯 |
| Reading | `/widgets/reading/` | 독서 트래커 (Notion DB 연동) |

---

## 세팅 방법

### 1. GitHub Pages 활성화

`Settings → Pages → Source: Deploy from branch → main / (root)`

활성화 후 URL: `https://{username}.github.io/{repo-name}/`

### 2. Notion 연동 세팅 (독서 위젯용)

#### 2-1. Notion Integration 생성
1. [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations) 접속
2. **New integration** 생성
3. **Internal Integration Secret** 복사 (이게 `NOTION_TOKEN`)
4. Reading List DB와 Quotes DB 각각에서 **... → Connections → 내 integration 추가**

#### 2-2. DB ID 확인
- DB 페이지 열기 → URL에서 추출
- `https://notion.so/{workspace}/{DB_ID}?v=...` 형식에서 32자리 ID 복사

#### 2-3. GitHub Secrets 등록
`Settings → Secrets and variables → Actions → New repository secret`

| Secret 이름 | 값 |
|-------------|---|
| `NOTION_TOKEN` | Notion Integration Secret |
| `READING_DB_ID` | 독서 목록 DB ID |
| `QUOTES_DB_ID` | Afterline quotes DB ID |

#### 2-4. 수동 실행으로 첫 데이터 동기화
`Actions → Sync Notion Data → Run workflow`

이후 매일 오전 6시(KST) 자동 실행.

---

### 3. Notion에 embed

각 위젯을 Notion 페이지에 추가하는 방법:

1. `/embed` 블록 입력
2. URL 입력: `https://{username}.github.io/{repo-name}/widgets/vhs-clock/`
3. 크기 조절

#### 권장 위젯 크기

| 위젯 | 권장 높이 |
|------|----------|
| VHS Clock | 180px |
| Receipt Log | 380px |
| Tamagotchi | 420px |
| iPod Timer | 380px |
| Typewriter | 220px |
| Reading | 360px |

---

### 4. 타자기 명언 커스터마이징

`/widgets/typewriter/index.html` 상단의 `QUOTES` 배열 수정:

```js
const QUOTES = [
  {
    text: "여기에 문장을 입력하세요",
    author: "저자명",
    source: "출처"
  },
  // ...
];
```

### 5. 다마고찌 기본 습관 변경

`/widgets/tamagotchi/index.html`의 `DEFAULT_HABITS` 배열 수정:

```js
const DEFAULT_HABITS = [
  '할 일 1',
  '할 일 2',
  // ...
];
```

---

## 기술 스택

- 순수 HTML / CSS / JS (빌드 불필요)
- Google Fonts (오프라인 fallback 포함)
- GitHub Actions (Python 3, 외부 패키지 불필요)
- localStorage (영수증·다마고찌 상태 보존)
