# 사이트 자료 조사: 화면에서 읽기 vs Supabase 공개 읽기

이슈 #5. 출처는 상위 폴더 `my-homepage/` 코드(읽기 전용)와 배포 사이트 https://my-homepage-jh-f22e.vercel.app 입니다.

## 1. 화면 구조와 칸

- 라우터가 없습니다. `src/App.jsx`의 `view` 상태(`'home' | 'papers' | 'assignments'`)로 섹션을 갈아 끼웁니다(App.jsx 32행, `go()` 40~50행). Works는 `home` 안의 `section#work`이고, Papers와 Assignments는 `section.snap--solo` 하나로 그려집니다(134~161행). 주소가 바뀌지 않으므로 URL로 화면을 직접 열 수는 없고, 메뉴 클릭(=`setView`)이 유일한 이동 수단입니다.
- 조회 칸(`src/lib/use*.js`의 `COLUMNS`):
  - projects: `id, title, description, image_url, video_url, link_url, pinned, created_at`
  - papers: `id, title, authors, venue, year, doi, link, pdf_url, abstract, summary, takeaways, keywords, citations, created_at`
  - assignments: `id, title, course, week, prompt, note, result_url, image_url, attachments, created_at`
  - 세 가지 모두 `created_at` 내림차순입니다.
- `src/lib/toPost.js`가 세 자료를 공통 '게시물' 모양(`title, lead, chips, body, bullets, images, files, links, facts, cover, video, prompt`)으로 바꾸고, `src/components/Article.jsx` 하나가 읽는 화면을 그립니다.

## 2. 배포 사이트 DOM에서 읽기

- 받아 온 HTML은 `<div id="root"></div>`만 들어 있는 빈 껍데기입니다(curl로 확인). 내용은 JS가 Supabase에서 받아 와 그리므로, 화면에서 읽으려면 브라우저 실행(헤드리스 등)이 필요합니다.
- `data-*` 속성이나 `id`가 붙은 항목은 없습니다(components에서 `data-` 검색 결과 0건). 안정적인 후크라고 할 만한 것은 BEM 클래스뿐입니다: `article.article`, `.article__title`, `.article__lead`, `.article__chips .chip`, `.article__text`, `.article__list`, `.article__facts`(dl), `.filelist .filecard`, `.prompt__body`, 그리고 섹션의 `#work`, `#contact`.
- 상세 화면은 목록에서 클릭해야 열리고, `.snap`은 IntersectionObserver로 드러나야(`is-in`) 보입니다. 따라서 자동으로 읽으려면 클릭과 스크롤을 흉내 내야 합니다.

## 3. Supabase 공개 읽기(RLS)

- `.env.local`에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`(공개용 키)가 있습니다. 값은 여기 옮기지 않았습니다. `src/lib/supabase.js`는 secret 키나 service_role 키가 들어오면 연결을 거부합니다.
- 세 표 모두 RLS가 켜져 있고, `for select to anon, authenticated using (true)` 정책과 `grant select ... to anon`이 있습니다.
  - projects: `supabase/admin-policies.sql` 31·42·51~56행
  - papers: `supabase/papers-setup.sql` 53·61·67~72행
  - assignments: `supabase/assignments-setup.sql` 47·55·61~66행
- 즉 공개 키만 있으면 누구나 세 표를 전부 읽을 수 있습니다. 쓰기는 관리자 UID만 할 수 있습니다. 이 키는 배포된 JS 번들에도 이미 들어 있으므로, 아바타 쪽에서 써도 새로 노출되는 것은 없습니다.
- 주의할 점: 위 내용은 SQL 파일 기준입니다. 실제 DB에 이 SQL이 적용됐는지는 이번 조사에서 직접 질의하지 않았습니다. 다만 배포 사이트가 같은 키로 목록을 띄우고 있으므로 적용된 것으로 봅니다.

## 4. 장단점

| | 화면(DOM)에서 읽기 | Supabase 공개 읽기 |
|---|---|---|
| 장점 | 방문자가 실제로 보는 문구(toPost 변환 후)와 같습니다 | 구조화된 칸을 그대로 받습니다. 빠르고, 브라우저가 필요 없습니다. RLS로 이미 열려 있습니다 |
| 단점 | 빈 SPA라 헤드리스 브라우저와 클릭 흉내가 필요합니다. data 속성이 없어 클래스 이름이 바뀌면 깨집니다 | 화면에 보이는 모양과 다를 수 있습니다(toPost 변환을 다시 구현하거나 가져와야 함). 표 스키마가 바뀌면 깨집니다. 정적 자료(`src/data/portfolio.js`)는 빠집니다 |

판단에 쓸 사실: 대본의 사실 근거로는 Supabase 공개 읽기 + `toPost.js` 규칙 재사용이 더 단순하고 튼튼합니다. 다만 정적 자료가 필요하면 `src/data/portfolio.js`를 따로 다뤄야 합니다.
