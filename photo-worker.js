/**
 * PHOTO WORKER — Notion 이미지 DB 연동
 * Cloudflare Worker
 *
 * ── 설정 ────────────────────────────────────────────────
 * Cloudflare Dashboard → Workers → Settings → Variables:
 *
 *   NOTION_API_KEY  → Notion Integration Secret
 *   DATABASE_ID     → 사진 DB 32자리 ID
 *
 * ── Notion DB 권장 구조 ─────────────────────────────────
 *   방법 A — 커버 이미지 사용 (가장 간단)
 *     각 페이지에 커버 이미지 설정 → Worker가 자동 추출
 *
 *   방법 B — 속성 사용
 *     사진 (Files & Media) — 이미지 파일 첨부
 *     제목 (title)          — 사진 설명
 *     날짜 (date)           — 촬영일
 *
 * ── 주의사항 ─────────────────────────────────────────────
 *   Notion 내부 업로드 파일의 URL은 1시간 후 만료됩니다.
 *   안정적인 운영을 위해 외부 이미지 URL 사용을 권장합니다.
 *   (Unsplash, Imgur, Google Drive 공개 링크 등)
 * ────────────────────────────────────────────────────────
 */

const NV = '2022-06-28';

export default {
  async fetch(request, env) {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers });

    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');

    if (path !== '/photos')
      return new Response('Not found', { status: 404 });

    try {
      const photos = await getPhotos(env);
      return new Response(JSON.stringify({ photos }), { status: 200, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }
};

/* ── Notion DB에서 이미지 목록 추출 ── */
async function getPhotos(env) {
  const res = await fetch(`https://api.notion.com/v1/databases/${env.DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization':  `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': NV,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify({
      page_size: 50,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    })
  });

  if (!res.ok) throw new Error(`Notion API ${res.status}`);

  const data = await res.json();

  return data.results
    .map(page => {
      let url = null;

      /* 방법 A: 커버 이미지 */
      if (page.cover) {
        url = page.cover.type === 'external'
          ? page.cover.external.url
          : page.cover.file?.url;
      }

      /* 방법 B: '사진' 속성 (Files & Media) */
      if (!url) {
        const files = page.properties['사진']?.files;
        if (files?.length) {
          const f = files[0];
          url = f.type === 'external' ? f.external.url : f.file?.url;
        }
      }

      /* 방법 C: '이미지' 속성 */
      if (!url) {
        const files = page.properties['이미지']?.files;
        if (files?.length) {
          const f = files[0];
          url = f.type === 'external' ? f.external.url : f.file?.url;
        }
      }

      if (!url) return null;

      /* 메타데이터 */
      const title = page.properties['Name']?.title?.[0]?.plain_text
                 || page.properties['제목']?.title?.[0]?.plain_text
                 || '';

      const dateRaw = page.properties['날짜']?.date?.start
                   || page.created_time;

      const date = new Date(dateRaw).toLocaleDateString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).replace(/\. /g, '.').replace(/\.$/, '');

      return { url, title, date };
    })
    .filter(Boolean);
}
