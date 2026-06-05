/**
 * MEMO OS WORKER
 * Cloudflare Worker — Notion 메모 DB 연동
 *
 * ── 설정 ────────────────────────────────────────────────
 * Cloudflare Dashboard → Workers → Settings → Variables:
 *
 *   NOTION_API_KEY  → Notion Integration Secret
 *   DATABASE_ID     → 메모 DB 32자리 ID
 *
 * Notion DB 필수 속성:
 *   Name  (title)  — 메모 내용  ← 이름 그대로 유지
 *   태그  (select) — MEMO / IDEA / TODO / QUOTE / WORK
 *
 * ──────────────────────────────────────────────────────── */

const NOTION_VERSION = '2022-06-28';

export default {
  async fetch(request, env) {

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers });

    /* ── POST: 메모 저장 ── */
    if (request.method === 'POST') {
      try {
        const { text, tag } = await request.json();
        if (!text?.trim()) throw new Error('text is empty');

        const result = await createMemo(env, text.trim(), tag || 'MEMO');
        return new Response(JSON.stringify({ ok: true, id: result.id }), { status: 200, headers });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
      }
    }

    /* ── GET: 최근 메모 조회 ── */
    if (request.method === 'GET') {
      try {
        const memos = await getMemos(env);
        return new Response(JSON.stringify({ memos }), { status: 200, headers });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
};

/* ── Notion 페이지 생성 (메모 저장) ── */
async function createMemo(env, text, tag) {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(env),
    body: JSON.stringify({
      parent: { database_id: env.DATABASE_ID },
      properties: {
        Name: {
          title: [{ type: 'text', text: { content: text } }]
        },
        태그: {
          select: { name: tag }
        },
      }
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Notion ${res.status}`);
  }
  return res.json();
}

/* ── Notion DB 쿼리 (최근 메모 20개) ── */
async function getMemos(env) {
  const res = await fetch(
    `https://api.notion.com/v1/databases/${env.DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: notionHeaders(env),
      body: JSON.stringify({
        page_size: 20,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        filter: {
          property: 'Name',
          title: { is_not_empty: true }
        }
      })
    }
  );

  if (!res.ok) throw new Error(`Notion ${res.status}`);

  const data = await res.json();
  return data.results
    .map(page => ({
      id:   page.id,
      text: page.properties.Name?.title?.[0]?.plain_text || '',
      tag:  page.properties.태그?.select?.name || 'MEMO',
      date: fmt(page.created_time, 'date'),
      time: fmt(page.created_time, 'time'),
    }))
    .filter(m => m.text)
    .reverse(); // 오래된 것부터 표시 (채팅 순서)
}

/* ── Helpers ── */
function notionHeaders(env) {
  return {
    'Authorization': `Bearer ${env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function fmt(iso, type) {
  const d = new Date(iso);
  return type === 'date'
    ? d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}
