/**
 * TODO WORKER — Notion 체크리스트 DB 연동
 * Cloudflare Worker
 *
 * ── 설정 ────────────────────────────────────────────────
 *   NOTION_API_KEY  → Notion Integration Secret
 *   DATABASE_ID     → 체크리스트 DB ID
 *
 * ── Notion DB 구조 ─────────────────────────────────────
 *   Name  (title)    — 할 일 내용
 *   완료  (checkbox) — 체크 여부
 *   날짜  (date)     — 날짜 (선택)
 *
 * ── 엔드포인트 ─────────────────────────────────────────
 *   GET  /todos          → 할 일 목록
 *   POST /todos          → 새 할 일 추가   { text }
 *   PATCH /todos/:id     → 완료 상태 변경  { done }
 * ────────────────────────────────────────────────────── */

const NV = '2022-06-28';

export default {
  async fetch(request, env) {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers });

    const url   = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    // parts[0] = 'todos', parts[1] = id (PATCH 시)

    try {
      if (parts[0] !== 'todos')
        return new Response('Not found', { status: 404 });

      /* GET /todos */
      if (request.method === 'GET') {
        const todos = await getTodos(env);
        return new Response(JSON.stringify({ todos }), { status: 200, headers });
      }

      /* POST /todos */
      if (request.method === 'POST') {
        const { text } = await request.json();
        if (!text?.trim()) throw new Error('text is empty');
        const page = await createTodo(env, text.trim());
        return new Response(JSON.stringify({ ok: true, id: page.id }), { status: 200, headers });
      }

      /* PATCH /todos/:id */
      if (request.method === 'PATCH' && parts[1]) {
        const { done } = await request.json();
        await updateTodo(env, parts[1], done);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      }

      return new Response('Method not allowed', { status: 405 });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }
};

/* ── 할 일 목록 가져오기 ── */
async function getTodos(env) {
  const res = await notionPost(env,
    `databases/${env.DATABASE_ID}/query`,
    {
      page_size: 100,
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      filter: { property: 'Name', title: { is_not_empty: true } }
    }
  );

  return res.results.map(page => ({
    id:   page.id,
    text: page.properties['Name']?.title?.[0]?.plain_text || '',
    done: page.properties['완료']?.checkbox || false,
    date: page.properties['날짜']?.date?.start || null,
  })).filter(t => t.text);
}

/* ── 새 할 일 추가 ── */
async function createTodo(env, text) {
  const res = await notionFetch(env, 'pages', 'POST', {
    parent: { database_id: env.DATABASE_ID },
    properties: {
      Name:  { title: [{ type: 'text', text: { content: text } }] },
      완료: { checkbox: false },
    }
  });
  return res;
}

/* ── 완료 상태 변경 ── */
async function updateTodo(env, pageId, done) {
  await notionFetch(env, `pages/${pageId}`, 'PATCH', {
    properties: { 완료: { checkbox: !!done } }
  });
}

/* ── Notion 헬퍼 ── */
function nh(env) {
  return {
    'Authorization':  `Bearer ${env.NOTION_API_KEY}`,
    'Notion-Version': NV,
    'Content-Type':   'application/json',
  };
}

async function notionFetch(env, endpoint, method, body) {
  const res = await fetch(`https://api.notion.com/v1/${endpoint}`, {
    method,
    headers: nh(env),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Notion ${res.status}`);
  }
  return res.json();
}

async function notionPost(env, endpoint, body) {
  return notionFetch(env, endpoint, 'POST', body);
}
