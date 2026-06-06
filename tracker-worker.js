/**
 * TRACKER WORKER — 에너지 + 습관 통합
 * Cloudflare Worker · Notion DB 연동
 *
 * ── 환경 변수 설정 ─────────────────────────────────────────
 * Cloudflare Dashboard → Workers → Settings → Variables:
 *
 *   NOTION_API_KEY  → Notion Integration Secret
 *   ENERGY_DB_ID    → 에너지 DB 32자리 ID
 *   HABIT_DB_ID     → 습관 DB 32자리 ID
 *
 * ── Notion DB 구조 ─────────────────────────────────────────
 *
 * 에너지 DB:
 *   날짜 (title)  — "2026-06-05" 형식
 *   에너지 (select) — LOW / MEDIUM / HIGH
 *
 * 습관 DB:
 *   날짜 (title)  — "2026-06-05" 형식
 *   습관 (select) — 체크된 습관 이름
 *   완료 (checkbox) — true/false
 *
 * ── 엔드포인트 ──────────────────────────────────────────────
 *   GET  /energy → 이번 주 에너지 데이터 반환
 *   POST /energy → 오늘 에너지 저장 { date, energy }
 *   GET  /habit  → 이번 주 습관 체크 반환
 *   POST /habit  → 습관 체크 저장 { date, habit, checked }
 * ────────────────────────────────────────────────────────── */

const NV = '2022-06-28';

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

    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/$/, ''); // '/energy' or '/habit'

    try {
      /* ── /energy ── */
      if (path === '/energy') {
        if (request.method === 'GET') {
          const data = await getEnergy(env);
          return new Response(JSON.stringify({ data }), { status: 200, headers });
        }
        if (request.method === 'POST') {
          const { date, energy } = await request.json();
          await saveEnergy(env, date, energy);
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
        }
      }

      /* ── /habit ── */
      if (path === '/habit') {
        if (request.method === 'GET') {
          const checks = await getHabits(env);
          return new Response(JSON.stringify({ checks }), { status: 200, headers });
        }
        if (request.method === 'POST') {
          const { date, habit, checked } = await request.json();
          await saveHabit(env, date, habit, checked);
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
        }
      }

      return new Response('Not found', { status: 404 });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }
};

/* ── ENERGY ────────────────────────────────────────────── */

async function getEnergy(env) {
  const days = weekDays();
  const res  = await notionQuery(env, env.ENERGY_DB_ID, {
    page_size: 7,
    filter: {
      and: [
        { property: '날짜', title: { is_not_empty: true } },
      ]
    }
  });

  const data = {};
  for (const page of res.results) {
    const date   = page.properties['날짜']?.title?.[0]?.plain_text;
    const energy = page.properties['에너지']?.select?.name;
    if (date && energy && days.includes(date)) data[date] = energy;
  }
  return data;
}

async function saveEnergy(env, date, energy) {
  // 같은 날짜 페이지가 있으면 업데이트, 없으면 생성
  const existing = await findPage(env, env.ENERGY_DB_ID, '날짜', date);
  if (existing) {
    await notionUpdate(env, existing, { '에너지': { select: { name: energy } } });
  } else {
    await notionCreate(env, env.ENERGY_DB_ID, {
      '날짜':  { title: [{ text: { content: date } }] },
      '에너지': { select: { name: energy } },
    });
  }
}

/* ── HABIT ─────────────────────────────────────────────── */

async function getHabits(env) {
  const days = weekDays();
  const res  = await notionQuery(env, env.HABIT_DB_ID, {
    page_size: 100,
  });

  const checks = {};
  for (const page of res.results) {
    const date  = page.properties['날짜']?.title?.[0]?.plain_text;
    const habit = page.properties['습관']?.select?.name;
    const done  = page.properties['완료']?.checkbox;
    if (date && habit && days.includes(date) && done) {
      checks[`${date}__${habit}`] = true;
    }
  }
  return checks;
}

async function saveHabit(env, date, habit, checked) {
  // 날짜+습관 조합으로 기존 페이지 찾기
  const res = await notionQuery(env, env.HABIT_DB_ID, {
    filter: {
      and: [
        { property: '날짜',  title:  { equals: date  } },
        { property: '습관',  select: { equals: habit } },
      ]
    }
  });

  if (res.results.length > 0) {
    await notionUpdate(env, res.results[0].id, { '완료': { checkbox: checked } });
  } else if (checked) {
    await notionCreate(env, env.HABIT_DB_ID, {
      '날짜':  { title:  [{ text: { content: date  } }] },
      '습관':  { select: { name: habit } },
      '완료':  { checkbox: true },
    });
  }
}

/* ── Notion 헬퍼 ─────────────────────────────────────────── */

function nh(env) {
  return {
    'Authorization':  `Bearer ${env.NOTION_API_KEY}`,
    'Notion-Version': NV,
    'Content-Type':   'application/json',
  };
}

async function notionQuery(env, dbId, body) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST', headers: nh(env), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion query ${res.status}`);
  return res.json();
}

async function notionCreate(env, dbId, props) {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST', headers: nh(env),
    body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
  });
  if (!res.ok) throw new Error(`Notion create ${res.status}`);
  return res.json();
}

async function notionUpdate(env, pageId, props) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH', headers: nh(env),
    body: JSON.stringify({ properties: props }),
  });
  if (!res.ok) throw new Error(`Notion update ${res.status}`);
  return res.json();
}

async function findPage(env, dbId, prop, val) {
  const res = await notionQuery(env, dbId, {
    filter: { property: prop, title: { equals: val } }
  });
  return res.results[0]?.id || null;
}

/* ── 날짜 유틸 ──────────────────────────────────────────── */
function weekDays() {
  const n = new Date(), d = n.getDay();
  n.setDate(n.getDate() - (d === 0 ? 6 : d - 1));
  n.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(n); x.setDate(n.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}
