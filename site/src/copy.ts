// Every word on the page, in English and Korean. Names of rewards, ranks, items, tricks
// and bounties come from the mod itself (mod/hooks/i18n.ts, characters/index.ts).
import type { Language } from '../../mod/types'

export type Step = { key: string; label: string; line: string; look: string }
export type Card = { title: string; body: string }

export type Copy = {
  skip: string
  meta: { title: string; description: string }
  nav: { moods: string; work: string; play: string; rewards: string; trail: string; install: string; cta: string; lang: string; soundOn: string; soundOff: string; menu: string }
  hero: { kicker: string; title: string; lead: string; install: string; demo: string; hint: string; badges: string[]; pet: (name: string) => string }
  moods: { eyebrow: string; title: string; lead: string; steps: Step[]; pause: string; resume: string; who: string }
  // The work view: a request played out with its plan and deputies (subagents).
  work: {
    eyebrow: string; title: string; lead: string; points: Card[]
    request: string; plan: string[]; deputies: string[]; caption: string
  }
  play: {
    eyebrow: string; title: string; lead: string
    pet: string; trick: string; treat: string
    petHint: string; trickHint: string; treatHint: string
    wardrobe: string; wardrobeNote: string; itemMeta: (level: number, price: string) => string; wearing: string
    petToast: string; petMoreToast: string; treatToast: (name: string) => string; trickToast: (name: string, level: number) => string
  }
  rewards: {
    eyebrow: string; title: string; lead: string; none: string; noneItems: string[]
    head: { reward: string; when: string; rep: string; gold: string }
    when: Record<string, string>; commitNote: string; taper: string
  }
  gold: {
    eyebrow: string; title: string; lead: string; unit: string
    cards: { key: string; title: string; amount: string; body: string }[]
    today: string; todayNote: string; bonus: (gold: number) => string
  }
  trail: {
    eyebrow: string; title: string; lead: string; level: string; hours: (h: number) => string
    tricks: string; items: string; locked: (level: number) => string; isNew: string; median: string
  }
  demo: { eyebrow: string; title: string; lead: string; fallback: string }
  fair: { eyebrow: string; title: string; cards: Card[] }
  install: {
    eyebrow: string; title: string; lead: string; terminal: string; desktop: string
    terminalSteps: string[]; shell: string; desktopSteps: string[]; update: string; commands: string; copy: string; copied: string
  }
  cappl: { eyebrow: string; title: string; lead: string; appStore: string; googlePlay: string }
  footer: { code: string; art: string; unofficial: string; source: string }
}

const EN: Copy = {
  skip: 'Skip to content',
  meta: {
    title: 'cappl-pals · Cowboy-hat pals for Claude Code',
    description:
      'RIKI, CARO and NUMO peek over your Claude Code prompt, react to every moment of your session, and grow with the results you ship. Free, open source and private.',
  },
  nav: {
    moods: 'Moods', work: 'Work', play: 'Play', rewards: 'Rewards', trail: 'The trail', install: 'Install', cta: 'Install',
    lang: '한국어', soundOn: 'Sound on', soundOff: 'Sound off', menu: 'Menu',
  },
  hero: {
    kicker: 'A Claude Code mod · free and open source',
    title: 'Cowboy-hat pals<br>for Claude Code',
    lead:
      'RIKI, CARO and NUMO peek over your prompt and follow everything your session does. When a test passes, a commit lands or a pull request merges, they cheer, level up and learn new tricks.',
    install: 'Install the mod',
    demo: 'Watch the demo',
    hint: 'Click a pal to pet it',
    badges: ['Terminal and desktop app', 'English and 한국어', 'No server, no tracking'],
    pet: name => `Pet ${name}`,
  },
  moods: {
    eyebrow: 'Moods',
    title: 'A new face for every moment',
    lead: 'The pal watches what your session is doing and shows it: a thought bubble while Claude thinks, a nervous sweat during tests, a little dance when the turn ends.',
    steps: [
      { key: 'prompt', label: 'You send a prompt', line: '❯ Fix the failing test, then commit', look: 'Ears up, a little “!”' },
      { key: 'thinking', label: 'Claude is thinking', line: '✻ Thinking…', look: 'Paw on chin, a “…” bubble' },
      { key: 'reading', label: 'Reading files', line: '● Read src/trail.js', look: 'Eyes scanning down the page' },
      { key: 'editing', label: 'Editing files', line: '● Update(src/trail.js)', look: 'Tongue out, paws tapping' },
      { key: 'testing', label: 'Running tests', line: '● Bash(npm test)', look: 'Wide eyes, a drop of sweat' },
      { key: 'fail', label: 'A test fails', line: '✖ 1 failing  pads the minutes', look: 'Dizzy, then a determined frown' },
      { key: 'pass', label: 'Tests pass', line: '✔ 3 passed  Showdown won +8', look: 'Star eyes and confetti' },
      { key: 'waiting', label: 'Needs your OK', line: '? Allow git push?', look: 'A “?” and a wave' },
      { key: 'done', label: 'Turn done', line: '✻ Baked for 16s', look: 'A little dance' },
      { key: 'sleep', label: 'Five quiet minutes', line: '· · ·', look: 'Fast asleep, z z z' },
    ],
    pause: 'Pause',
    resume: 'Play',
    who: 'Switch pal',
  },
  work: {
    eyebrow: 'Work',
    title: 'Watch the work, deputies and all',
    lead: 'When Claude sends off subagents, each one rides out as your pal’s deputy, in a bandana of its own colour and with its own number. The pane shows what each one is doing, how long the request has run, its tokens and what it cost.',
    points: [
      { title: 'A deputy for every subagent', body: 'Deputies arrive with sparkles, then read, tap away and sweat as their sheriff does. They cheer when they finish, look dizzy when they fail and doze off when stopped. Every one is drawn, in number order, however narrow the pane.' },
      { title: 'The request at a glance', body: 'A chip says what the pal is doing, beside the time since you asked. When Claude keeps a task list, a bar counts the steps, and each deputy gets a line of its own.' },
      { title: 'What it costs', body: 'The request’s tokens and API value, the session’s total and your 5-hour limit. It is shown, never paid: more deputies earn no rep or gold.' },
    ],
    request: 'Fix the login test and tidy the auth docs',
    plan: ['Find why the test fails', 'Fix the token refresh', 'Run the tests', 'Tidy the auth docs'],
    deputies: ['Find the failing test', 'Read the auth docs', 'Check the API client', 'Fix the token refresh'],
    caption: 'A request played out with the mod’s own drawing. The numbers are made up.',
  },
  play: {
    eyebrow: 'Play',
    title: 'Pet it. Ask for a trick. Buy it a treat.',
    lead: 'Three buttons in the pane, to click or to reach from the keyboard. Try them here: it is the same art and the same moves as the mod.',
    pet: 'Pet',
    trick: 'Trick',
    treat: 'Treat',
    petHint: 'Heart eyes. Three quick pets for a happy wiggle.',
    trickHint: 'Ten tricks to learn, the newest first.',
    treatHint: 'A star cookie, a maple biscuit or a dew drop, then a blush.',
    wardrobe: 'Try on the wardrobe',
    wardrobeNote: 'Free to try on here. In the mod, each item costs game gold you earn from results.',
    itemMeta: (level, price) => `Lv${level} · ${price} gold`,
    wearing: 'Wearing',
    petToast: '♥',
    petMoreToast: '♥ ♥ ♥',
    treatToast: name => `Yum! ${name}`,
    trickToast: (name, level) => `${name} · learned at Lv${level}`,
  },
  rewards: {
    eyebrow: 'Rewards',
    title: 'Rewards for results, not tokens',
    lead: 'Only results a person can check pay. Prompts, turns, tool calls, tokens and lines of code earn nothing, so there is no reason to burn through your usage.',
    none: 'No reward',
    noneItems: ['Prompts', 'Tokens', 'Tool calls', 'Lines of code'],
    head: { reward: 'Reward', when: 'When', rep: 'Rep', gold: 'Gold' },
    when: {
      verify: 'The first passing test after you edit files',
      comeback: 'A test fails, you fix it, it passes',
      check: 'A type check, lint or build with no errors after edits',
      commit: 'A commit lands',
      pr: '<code>gh pr create</code> opens a pull request',
      merge: '<code>gh pr merge</code> succeeds',
      plan: 'A plan approved before editing',
      break: 'Back from a break after an hour of work',
      daily: 'Your first prompt of the day',
    },
    commitNote: 'A tested commit earns 5 rep and 3 gold more; a small one, 2 rep more.',
    taper: 'Many of one kind in a day? Each new one is worth half, then a fifth. There are no streaks and no penalties, and a day off costs nothing.',
  },
  gold: {
    eyebrow: 'Gold',
    title: 'Gold, all day long',
    lead: 'Rep sets your rank and the tricks you learn. Gold arrives every few results and buys treats and gear. It is game gold: earned from your work, never bought with money.',
    unit: 'gold',
    cards: [
      { key: 'chest', title: 'Level chest', amount: '5 + Lv', body: 'Every level you reach opens one.' },
      { key: 'bounty', title: 'Bounties', amount: '5–15', body: 'Three a day, and 15 more for all three.' },
      { key: 'lucky', title: 'Lucky nugget', amount: '5–15', body: 'Turns up on about one result in sixteen.' },
      { key: 'treat', title: 'Treats', amount: '6', body: 'A snack, a blush and extra tricks.' },
    ],
    today: 'Today’s bounties',
    todayNote: 'Every pane shows the same three today.',
    bonus: gold => `All three: +${gold} gold`,
  },
  trail: {
    eyebrow: 'The trail',
    title: 'From Greenhorn to Legend of the West',
    lead: 'Fifty levels and eleven ranks. Each pal learns ten tricks and has ten items to unlock. At a steady pace, Lv50 takes about 830 active hours.',
    level: 'Level',
    hours: h => `≈ ${h.toLocaleString('en-US')} active hours`,
    tricks: 'Tricks learned',
    items: 'Wardrobe unlocked',
    locked: level => `Lv${level}`,
    isNew: 'New',
    median: 'Hours at the median pace of 28 days of real Claude Code history.',
  },
  demo: {
    eyebrow: 'Demo',
    title: 'See it in a real session',
    lead: 'A real Claude Code session in a terminal, then the deputies at work, with sound. About a minute and forty seconds.',
    fallback: 'Your browser cannot play this video.',
  },
  fair: {
    eyebrow: 'Fair play',
    title: 'Built to be fair',
    cards: [
      { title: 'Results only', body: 'Tests, checks, commits and pull requests pay. Busywork earns nothing.' },
      { title: 'No streaks, no guilt', body: 'No penalties. A day off costs nothing, and a break even earns a little.' },
      { title: 'Game gold only', body: 'No real money, no loot boxes and no trading.' },
      { title: 'Private by design', body: 'No server and no network calls. Progress stays on your computer.' },
      { title: 'Every session in sync', body: 'Run several sessions at once. Rep and gold add up within seconds.' },
      { title: 'Terminal and desktop', body: 'Runs in the terminal and in the desktop app’s Code tab.' },
    ],
  },
  install: {
    eyebrow: 'Install',
    title: 'Saddle up in one command',
    lead: 'Needs Claude Code 2.1.287 or later.',
    terminal: 'Terminal',
    desktop: 'Desktop app',
    terminalSteps: [
      'Run this in Claude Code:',
      'Answer <kbd>y</kbd> to add the marketplace and keep the user scope.',
      'In sessions that were already open, run <code>/reload-plugins</code>.',
    ],
    shell: 'From a shell instead:',
    desktopSteps: [
      'Click <strong>+</strong> next to the prompt and choose to add plugins.',
      'Press <strong>+</strong>, add a marketplace and pick adding it from a repository.',
      'Enter <code>develinu/cappl-pals</code> and sync.',
      'Add cappl-pals from the list that appears.',
    ],
    update:
      'Recommended: turn on auto-update once. In Claude Code, open <code>/plugin</code> → Marketplaces → cappl-pals → Enable auto-update.',
    commands: '<code>/cappl</code> opens or closes the pane · <code>/cappl-pick</code> picks a pal · <code>/cappl-rules</code> shows the rules',
    copy: 'Copy',
    copied: 'Copied',
  },
  cappl: {
    eyebrow: 'The Sundust world',
    title: 'Where RIKI, CARO and NUMO come from',
    lead:
      'RIKI, CARO and NUMO are the sheriffs of Sundust, a small oasis town where the wind redraws the roads by day. They don’t chase anyone; they bring lost things and days gone astray back where they belong. Sundust is shared by three apps. CARO is the face of CAPPL, a planning app; RIKI of LOCKI, a screen lock app; and NUMO of TUSMO, an app still on its way. cappl-pals cheers for the work you finish; CAPPL helps you plan it and look back on it.',
    appStore: 'CAPPL · App Store',
    googlePlay: 'CAPPL · Google Play',
  },
  footer: {
    code: 'Code under the MIT license.',
    art: 'RIKI, CARO and NUMO are Sundust characters from the CAPPL, LOCKI and TUSMO apps, used with permission, in this project and its forks only.',
    unofficial: 'An unofficial community mod for Claude Code.',
    source: 'Source on GitHub',
  },
}

const KO: Copy = {
  skip: '본문으로 건너뛰기',
  meta: {
    title: 'cappl-pals · Claude Code와 함께하는 카우보이모자 단짝',
    description:
      'RIKI, CARO, NUMO가 Claude Code 프롬프트 위로 고개를 내밀고, 세션의 순간마다 표정을 바꾸며, 작업 결과와 함께 자라요. 무료 오픈소스이고, 개인정보를 모으지 않아요.',
  },
  nav: {
    moods: '표정', work: '작업', play: '놀이', rewards: '보상', trail: '여정', install: '설치', cta: '설치하기',
    lang: 'English', soundOn: '소리 켜짐', soundOff: '소리 꺼짐', menu: '메뉴',
  },
  hero: {
    kicker: 'Claude Code mod · 무료 오픈소스',
    title: 'Claude Code의<br>카우보이모자 단짝',
    lead:
      'RIKI, CARO, NUMO가 프롬프트 위로 고개를 내밀고 세션이 하는 일을 따라 표정을 바꿔요. 테스트가 통과하고, 커밋이 들어가고, PR이 병합되면 함께 기뻐하고 레벨이 오르며 새 재주를 배워요.',
    install: '설치하기',
    demo: '데모 보기',
    hint: '친구를 눌러 쓰다듬어 보세요',
    badges: ['터미널과 데스크톱 앱', 'English와 한국어', '서버 없음, 추적 없음'],
    pet: name => `${name} 쓰다듬기`,
  },
  moods: {
    eyebrow: '표정',
    title: '순간마다 다른 얼굴',
    lead: '친구는 세션이 지금 하는 일을 보고 그대로 표정에 옮겨요. Claude가 생각하면 말풍선을 띄우고, 테스트 중엔 식은땀을 흘리고, 턴이 끝나면 짧게 춤을 춰요.',
    steps: [
      { key: 'prompt', label: '프롬프트를 보냄', line: '❯ 실패하는 테스트 고치고 커밋해 줘', look: '귀를 쫑긋, 작은 “!”' },
      { key: 'thinking', label: 'Claude가 생각하는 중', line: '✻ Thinking…', look: '턱을 괴고 “…” 말풍선' },
      { key: 'reading', label: '파일 읽기', line: '● Read src/trail.js', look: '눈으로 페이지를 훑어 내려감' },
      { key: 'editing', label: '파일 수정', line: '● Update(src/trail.js)', look: '혀를 내밀고 앞발을 톡톡' },
      { key: 'testing', label: '테스트 실행', line: '● Bash(npm test)', look: '눈이 동그래지고 식은땀 한 방울' },
      { key: 'fail', label: '테스트 실패', line: '✖ 1 failing  pads the minutes', look: '어질어질, 곧 다시 힘을 냄' },
      { key: 'pass', label: '테스트 통과', line: '✔ 3 passed  결투 승리 +8', look: '별 눈과 색종이' },
      { key: 'waiting', label: '권한 확인 대기', line: '? git push를 허용할까요?', look: '“?”를 띄우고 손을 흔듦' },
      { key: 'done', label: '턴 끝', line: '✻ Baked for 16s', look: '짧은 춤' },
      { key: 'sleep', label: '5분 동안 조용', line: '· · ·', look: '새근새근 낮잠, z z z' },
    ],
    pause: '멈춤',
    resume: '재생',
    who: '친구 바꾸기',
  },
  work: {
    eyebrow: '작업',
    title: '부보안관과 함께 보는 작업',
    lead: 'Claude가 하위 에이전트를 띄우면 하나하나가 친구의 부보안관이 되어 출동해요. 자기 색 반다나를 두르고 번호를 달아요. 창에는 부보안관마다 지금 하는 일과 요청이 걸린 시간, 토큰과 비용이 나와요.',
    points: [
      { title: '하위 에이전트마다 부보안관', body: '반짝이며 도착해서 보안관처럼 읽고, 두드리고, 땀을 흘려요. 일을 마치면 기뻐하고, 실패하면 어지러워하고, 멈추면 잠들어요. 창이 좁아도 번호 순서대로 모두 그려요.' },
      { title: '요청을 한눈에', body: '친구가 지금 하는 일을 표시로, 그 옆에 요청한 뒤 지난 시간을 보여 줘요. Claude가 할 일 목록을 쓰면 끝낸 단계를 막대로 세고, 부보안관마다 한 줄씩 나와요.' },
      { title: '얼마나 드는지', body: '요청의 토큰과 API 환산 비용, 세션 합계, 5시간 한도를 보여 줘요. 보여 주기만 하고 보상은 없어요. 부보안관을 많이 띄운다고 명성이나 골드를 더 받지 않아요.' },
    ],
    request: '로그인 테스트 고치고 인증 문서 정리해 줘',
    plan: ['테스트가 실패하는 이유 찾기', '토큰 갱신 고치기', '테스트 돌리기', '인증 문서 정리하기'],
    deputies: ['실패하는 테스트 찾기', '인증 문서 읽기', 'API 클라이언트 확인', '토큰 갱신 고치기'],
    caption: '모드가 그리는 그림 그대로 요청 하나를 재생해요. 숫자는 예시예요.',
  },
  play: {
    eyebrow: '놀이',
    title: '쓰다듬고, 재주를 부탁하고, 간식을 사 주세요',
    lead: '창에 있는 버튼 세 개, 마우스로도 키보드로도 누를 수 있어요. 여기서 직접 눌러 보세요. mod와 같은 그림, 같은 동작이에요.',
    pet: '쓰다듬기',
    trick: '재주',
    treat: '간식',
    petHint: '하트 눈. 빠르게 세 번 쓰다듬으면 몸을 흔들며 좋아해요.',
    trickHint: '배울 수 있는 재주 열 가지, 가장 최근 것부터.',
    treatHint: '별 쿠키, 메이플 비스킷, 또는 이슬 한 방울을 먹고 볼이 발그레해져요.',
    wardrobe: '옷장 입어 보기',
    wardrobeNote: '여기서는 마음껏 입어 볼 수 있어요. mod에서는 작업 결과로 모은 게임 골드로 사요.',
    itemMeta: (level, price) => `Lv${level} · ${price} 골드`,
    wearing: '착용 중',
    petToast: '♥',
    petMoreToast: '♥ ♥ ♥',
    treatToast: name => `냠! ${name}`,
    trickToast: (name, level) => `${name} · Lv${level}에 배움`,
  },
  rewards: {
    eyebrow: '보상',
    title: '토큰이 아니라, 결과에 보상해요',
    lead: '사람이 확인할 수 있는 결과에만 보상해요. 프롬프트·턴·도구 호출·토큰·코드 줄 수에는 보상이 없어서, 사용량을 태울 이유가 없어요.',
    none: '보상 없음',
    noneItems: ['프롬프트 수', '토큰 사용량', '도구 호출 수', '코드 줄 수'],
    head: { reward: '보상', when: '언제', rep: '명성', gold: '골드' },
    when: {
      verify: '파일을 고친 뒤 처음 통과한 테스트',
      comeback: '테스트 실패 → 수정 → 통과',
      check: '고친 뒤 오류 없이 끝난 타입 검사·린트·빌드',
      commit: '커밋',
      pr: '<code>gh pr create</code>로 PR을 엶',
      merge: '<code>gh pr merge</code> 성공',
      plan: '고치기 전에 계획 승인',
      break: '한 시간 넘게 일하고 쉬었다 돌아옴',
      daily: '그날 첫 프롬프트',
    },
    commitNote: '테스트로 확인한 커밋은 명성 5·골드 3을, 작은 커밋은 명성 2를 더 받아요.',
    taper: '같은 날 같은 보상을 많이 받으면 값이 절반, 다시 5분의 1로 줄어들어요. 연속 출석 기록이나 벌칙은 없고, 하루 쉬어도 잃는 것이 없어요.',
  },
  gold: {
    eyebrow: '골드',
    title: '골드는 하루 종일',
    lead: '명성은 계급과 배우는 재주를 정해요. 골드는 결과 몇 번마다 들어오고, 그 골드로 간식과 소품을 사요. 작업으로 모으는 게임 골드라서 돈으로는 살 수 없어요.',
    unit: '골드',
    cards: [
      { key: 'chest', title: '레벨 상자', amount: '5 + Lv', body: '레벨이 오를 때마다 하나씩 열려요.' },
      { key: 'bounty', title: '현상금', amount: '5–15', body: '하루 세 개, 다 끝내면 15 골드를 더 받아요.' },
      { key: 'lucky', title: '행운의 사금', amount: '5–15', body: '결과 열여섯 번에 한 번꼴로 나와요.' },
      { key: 'treat', title: '간식', amount: '6', body: '간식 하나에 발그레한 볼, 재주는 두 배.' },
    ],
    today: '오늘의 현상금',
    todayNote: '오늘은 모든 창에 같은 세 개가 떠요.',
    bonus: gold => `셋 다 끝내면: +${gold} 골드`,
  },
  trail: {
    eyebrow: '여정',
    title: '새내기에서 서부의 전설까지',
    lead: '레벨 50개, 계급 11개. 친구마다 재주 열 가지와 소품 열 개가 기다려요. 꾸준히 쓰면 Lv50까지 활동 시간으로 약 830시간이 걸려요.',
    level: '레벨',
    hours: h => `활동 ≈ ${h.toLocaleString('ko-KR')}시간`,
    tricks: '배운 재주',
    items: '열린 옷장',
    locked: level => `Lv${level}`,
    isNew: '새로',
    median: '실제 Claude Code 기록 28일치의 중간 속도로 잰 시간이에요.',
  },
  demo: {
    eyebrow: '데모',
    title: '실제 세션에서 보기',
    lead: '터미널에서 실제로 돌린 Claude Code 세션과 일하는 부보안관을 소리와 함께 담았어요. 1분 40초 정도예요.',
    fallback: '이 브라우저에서는 영상을 재생할 수 없어요.',
  },
  fair: {
    eyebrow: '공정함',
    title: '처음부터 공정하게',
    cards: [
      { title: '결과에만 보상', body: '테스트·검사·커밋·PR에만 보상해요. 활동량에는 주지 않아요.' },
      { title: '부담 없음', body: '벌칙이 없어요. 하루 쉬어도 잃는 것이 없고, 쉬고 오면 오히려 조금 받아요.' },
      { title: '게임 골드만', body: '현금 결제도, 뽑기도, 거래도 없어요.' },
      { title: '내 컴퓨터에만', body: '서버도 네트워크 호출도 없어요. 진행 기록은 내 컴퓨터에만 남아요.' },
      { title: '여러 세션 즉시 합산', body: '세션을 여러 개 열어도 명성과 골드가 몇 초 안에 합쳐져요.' },
      { title: '터미널과 데스크톱', body: '터미널과 데스크톱 앱의 Code 탭에서 모두 돌아가요.' },
    ],
  },
  install: {
    eyebrow: '설치',
    title: '명령 하나로 안장 얹기',
    lead: 'Claude Code 2.1.287 이상이 필요해요.',
    terminal: '터미널',
    desktop: '데스크톱 앱',
    terminalSteps: [
      'Claude Code에서 입력하세요.',
      '마켓플레이스를 추가할지 물으면 <kbd>y</kbd>를 누르고, 범위는 user 그대로 두세요.',
      '이미 열려 있던 세션에서는 <code>/reload-plugins</code>를 입력하세요.',
    ],
    shell: '셸에서 설치하려면:',
    desktopSteps: [
      '프롬프트 옆 <strong>+</strong> → <strong>플러그인 추가</strong>를 고르세요.',
      '<strong>+ 추가</strong> → <strong>마켓플레이스 추가</strong> → <strong>저장소에서 추가</strong>를 고르세요.',
      '<code>develinu/cappl-pals</code>를 넣고 <strong>동기화</strong>를 누르세요.',
      '목록에 나오는 cappl-pals를 추가하세요.',
    ],
    update: '자동 업데이트를 한 번 켜 두면 새 버전이 알아서 들어와요. Claude Code에서 <code>/plugin</code> → Marketplaces → cappl-pals → Enable auto-update를 고르세요.',
    commands: '<code>/cappl</code> 창 열기·닫기 · <code>/cappl-pick</code> 친구 고르기 · <code>/cappl-rules</code> 규칙 보기',
    copy: '복사',
    copied: '복사됨',
  },
  cappl: {
    eyebrow: 'Sundust 세계관',
    title: 'RIKI, CARO, NUMO가 사는 곳',
    lead:
      'RIKI, CARO, NUMO는 낮에는 모래바람이 길을 바꾸는 오아시스 마을 선더스트의 보안관이에요. 누군가를 쫓기보다 잃어버린 물건과 어긋난 하루를 제자리로 돌려놓죠. 선더스트는 세 앱이 함께 쓰는 세계관이에요. CARO는 계획·회고 앱 CAPPL, RIKI는 화면 잠금 앱 LOCKI, NUMO는 곧 나올 앱 TUSMO의 얼굴이에요. cappl-pals가 끝낸 일을 함께 기뻐해 준다면, CAPPL은 그 일을 계획하고 돌아보게 도와줘요.',
    appStore: 'CAPPL · App Store',
    googlePlay: 'CAPPL · Google Play',
  },
  footer: {
    code: '코드는 MIT 라이선스예요.',
    art: 'RIKI, CARO, NUMO는 CAPPL·LOCKI·TUSMO 앱의 Sundust 캐릭터로, 허가를 받아 이 프로젝트와 포크 안에서만 사용해요.',
    unofficial: 'Claude Code용 비공식 커뮤니티 mod예요.',
    source: 'GitHub에서 소스 보기',
  },
}

export const COPY: Readonly<Record<Language, Copy>> = { en: EN, ko: KO }
