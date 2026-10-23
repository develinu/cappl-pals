import type { Language, ResultKind, RewardKind } from '../types'

// Every word the pane, the toasts and the commands show. Item names and character
// lines live with each character (characters/index.ts).

type Words = {
  ranks: readonly string[]
  rewards: Record<RewardKind, string>
  rep: string
  gold: string
  fans: (n: string) => string
  maxLevel: string
  recent: string
  noRewards: string
  shop: string
  wear: string
  takeOff: string
  next: (level: number, name: string) => string
  close: string
  switchCharacter: string
  scrollHint: string
  pickTitle: string
  pick: (name: string) => string
  current: string
  rewardLine: (label: string, gain: string) => string
  repGain: (n: number) => string
  levelUp: (level: number) => string
  newRank: (rank: string) => string
  levelToast: (level: number, label: string) => string
  rankToast: (level: number, rank: string) => string
  unlocked: (names: string) => string
  bigToast: (label: string, fame: number, dust: number) => string
  bought: (name: string) => string
  broke: string
  commands: { toggle: string; pick: string; status: string; rules: string; sound: string }
  opened: string
  closed: string
  waiting: string
  picked: (name: string) => string
  unknownCharacter: (names: string) => string
  status: (p: { name: string; level: number; rank: string; fame: number; progress: string; dust: number; fans: string; owned: number; total: number; tricks: number; allTricks: number }) => string
  pet: string
  trick: string
  treat: (name: string, price: number) => string
  noTreatGold: string
  noTricks: string
  nextTrick: (level: number, name: string) => string
  learned: (name: string) => string
  chestToast: (level: number, gold: number) => string
  luckyToast: (gold: number) => string
  bounties: string
  quests: Record<string, string>
  questLine: (label: string, have: number, target: number, gold: number, isDone: boolean) => string
  bonusLine: (gold: number, isDone: boolean) => string
  questToast: (label: string, gold: number) => string
  bonusToast: (gold: number) => string
  sound: Record<'normal' | 'quiet' | 'off', string>
  soundSet: (now: string, next: string) => string
  // How to drive the pane from the keyboard: before and after it takes the focus.
  hint: { idle: string; focused: string; scroll: string }
  bountyHeader: (done: number, total: number) => string
  menu: { rules: string; status: string; back: string }
  rules: {
    title: string
    intro: string
    earn: string
    when: Record<ResultKind, string>
    values: (fame: number, dust: number) => string
    today: (n: number) => string
    limit: { taper: (full: number) => string; cap: (n: number) => string }
    taper: string
    commitBonus: string
    bountyTitle: string
    bounty: readonly string[]
    bonusTitle: string
    bonus: readonly string[]
    noneTitle: string
    none: string
    fair: (hour: number, offset: string) => string
  }
  progress: {
    title: string
    toNext: (n: number, level: number) => string
    today: string
    nothingToday: string
    count: (label: string, n: number) => string
    tricks: (have: number, all: number) => string
    items: (have: number, all: number) => string
    allLearned: string
    allUnlocked: string
  }
}

const EN: Words = {
  ranks: [
    'Greenhorn', 'Stable Hand', 'Trail Rider', 'Wrangler', 'Rodeo Rookie', 'Deputy',
    'Ranger', 'Sheriff', 'Marshal', 'Frontier Hero', 'Legend of the West',
  ],
  rewards: {
    verify: 'Bullseye',
    comeback: 'Showdown won',
    commit: 'Claim staked',
    merge: 'Gold strike',
    plan: 'Trail mapped',
    break: 'Campfire rest',
    daily: 'Saddled up',
    check: 'Clean shot',
    pr: 'Poster up',
    chest: 'Level chest',
    quest: 'Bounty',
    lucky: 'Lucky nugget',
  },
  rep: 'Rep',
  gold: 'Gold',
  fans: n => `${n} fans`,
  maxLevel: 'max level',
  recent: '▸ Recent rewards',
  noRewards: 'Pass a test or commit to earn rewards',
  shop: '▸ Shop',
  wear: 'put on',
  takeOff: 'take off',
  next: (level, name) => `Next: Lv${level} ${name}`,
  close: 'Close (/cappl)',
  switchCharacter: 'Switch character',
  scrollHint: '▾ More below ∙ Esc: leave',
  pickTitle: 'Pick your partner',
  pick: name => `Pick ${name}`,
  current: ' (riding now)',
  rewardLine: (label, gain) => `✦ ${label} ${gain}`,
  repGain: n => `+${n} rep`,
  levelUp: level => `✸ LEVEL UP! Lv${level}`,
  newRank: rank => `✸ New rank! ${rank}`,
  levelToast: (level, label) => `✦ Lv${level} reached: ${label}`,
  rankToast: (level, rank) => `✸ Lv${level}, new rank: ${rank}`,
  unlocked: names => `New in the shop: ${names}`,
  bigToast: (label, fame, dust) => `${label} +${fame} rep +$${dust}`,
  bought: name => `✦ ${name} on!`,
  broke: 'Not enough gold yet.',
  commands: {
    toggle: 'Open or close the CAPPL pals pane',
    pick: 'Pick your character (locki or cappl)',
    status: 'Level, rank, rep and gold in one line',
    rules: 'What earns rewards, and how many you got today',
    sound: 'Sound effects: normal → quiet → off',
  },
  opened: 'Opened the CAPPL pals pane. /cappl closes it.',
  closed: 'Closed the CAPPL pals pane. /cappl opens it again.',
  waiting: 'The pane is waiting for room (make the terminal wider).',
  picked: name => `${name} is riding with you now.`,
  unknownCharacter: names => `No such character. Pick one of: ${names}`,
  status: p =>
    `${p.name} Lv${p.level} ${p.rank} · Rep ${p.fame} (${p.progress}) · Gold $${p.dust} · ${p.fans} · Items ${p.owned}/${p.total} · Tricks ${p.tricks}/${p.allTricks}`,
  pet: 'Pet',
  trick: 'Trick',
  treat: (name, price) => `Treat: ${name} $${price}`,
  noTreatGold: 'Not enough gold for a treat yet.',
  noTricks: 'No tricks yet. The first one comes at Lv2.',
  nextTrick: (level, name) => `Next trick: Lv${level} ${name}`,
  learned: name => `New trick learned: ${name}!`,
  chestToast: (level, gold) => `Lv${level} chest: +$${gold}`,
  luckyToast: gold => `Lucky nugget! +$${gold}`,
  bounties: "▸ Today's bounties",
  // Bounties say what to do, in plain words (the reward names are flavour).
  quests: {
    bullseye3: 'Pass tests after edits ×3', commit2: 'Commit twice', check2: 'Clean check or build ×2',
    comeback1: 'Fix a failing test', merge1: 'Merge a pull request', pr1: 'Open a pull request',
    break1: 'Take a break, come back', plan1: 'Approve a plan first',
    pet3: 'Pet your pal ×3', treat1: 'Give a treat', trick2: 'Ask for 2 tricks',
  },
  questLine: (label, have, target, gold, isDone) => (isDone ? `✓ ${label} +$${gold}` : `▸ ${label} ${have}/${target} $${gold}`),
  bonusLine: (gold, isDone) => (isDone ? `✓ All three +$${gold}` : `  All three: +$${gold}`),
  questToast: (label, gold) => `Bounty done: ${label} +$${gold}`,
  bonusToast: gold => `All of today's bounties done! +$${gold}`,
  sound: { normal: 'normal', quiet: 'quiet', off: 'off' },
  soundSet: (now, next) => `Sound effects: ${now}. Run /cappl-sound again for ${next}.`,
  hint: { idle: 'Click, or ctrl+x Tab for the keyboard', focused: '⇅ move ∙ Enter select ∙ Esc leave', scroll: 'Tab move ∙ ⇅ scroll ∙ Enter select' },
  bountyHeader: (done, total) => `▸ Today's bounties ${done}/${total}`,
  menu: { rules: 'Rules and bounties', status: 'My progress', back: 'Back' },
  rules: {
    title: 'How rewards work',
    intro: 'Only results a person can check pay.',
    earn: '▸ Results (rep, gold)',
    when: {
      verify: 'The first passing test after you edit files',
      comeback: 'A failing test, fixed, then passing',
      check: 'A type check, lint or build with no errors after edits',
      commit: 'A commit (more if tested, or small)',
      pr: '`gh pr create` opens a pull request',
      merge: '`gh pr merge` merges one',
      plan: 'A plan approved before editing',
      break: 'Back from a 20-minute break after an hour of work',
      daily: 'Your first prompt of the day',
    },
    values: (fame, dust) => (fame > 0 ? `+${fame} rep ∙ $${dust}` : `$${dust}`),
    today: n => `today ${n}`,
    limit: { taper: full => `full value ${full} a day`, cap: n => `up to ${n} a day` },
    taper: 'Many of one kind in a day: each new one is worth half, then a fifth.',
    commitBonus: 'A tested commit earns +5 rep and $3 more; a small one (8 edits or fewer), +2 rep.',
    bountyTitle: '▸ Bounties',
    bounty: ['Three a day: one with your pal, two from your work.', 'Each pays once. All three pay $15 more.'],
    bonusTitle: '▸ Bonus gold',
    bonus: ['Level chest: $5 + the level, at every level', 'Lucky nugget: about 1 result in 16, $5-15', 'Treat: $6, a snack and extra tricks'],
    noneTitle: '▸ No reward',
    none: 'Prompts, tokens, tool calls, lines of code',
    fair: (hour, offset) => `No streaks, no penalties. A day starts at ${hour}:00 (UTC${offset}).`,
  },
  progress: {
    title: 'My progress',
    toNext: (n, level) => `${n} rep to Lv${level}`,
    today: '▸ Today',
    nothingToday: 'Nothing yet. Pass a test or commit.',
    count: (label, n) => `${label} ×${n}`,
    tricks: (have, all) => `▸ Tricks ${have}/${all}`,
    items: (have, all) => `▸ Wardrobe ${have}/${all}`,
    allLearned: 'Every trick learned',
    allUnlocked: 'Every item unlocked',
  },
}

const KO: Words = {
  ranks: [
    '새내기', '마구간지기', '길잡이 기수', '카우보이', '로데오 신인', '보안관 보좌관',
    '레인저', '보안관', '연방 보안관', '개척지 영웅', '서부의 전설',
  ],
  rewards: {
    verify: '과녁 명중',
    comeback: '결투 승리',
    commit: '말뚝 박기',
    merge: '금맥 발견',
    plan: '지도 펼치기',
    break: '모닥불 휴식',
    daily: '안장 얹기',
    check: '깔끔한 사격',
    pr: '전단 붙이기',
    chest: '레벨 상자',
    quest: '현상금',
    lucky: '행운의 사금',
  },
  rep: '명성',
  gold: '골드',
  fans: n => `팬 ${n}명`,
  maxLevel: '최고 레벨',
  recent: '▸ 최근 보상',
  noRewards: '테스트를 통과시키거나 커밋하면 보상이 쌓여요',
  shop: '▸ 상점',
  wear: '쓰기',
  takeOff: '벗기',
  next: (level, name) => `다음 소품: Lv${level} ${name}`,
  close: '창 닫기 (/cappl)',
  switchCharacter: '캐릭터 바꾸기',
  scrollHint: '▾ 아래에 더 있어요 ∙ Esc 나가기',
  pickTitle: '함께할 친구를 고르세요',
  pick: name => `${name} 고르기`,
  current: ' (지금 함께하는 중)',
  rewardLine: (label, gain) => `✦ ${label} ${gain}`,
  repGain: n => `+${n} 명성`,
  levelUp: level => `✸ LEVEL UP! Lv${level}`,
  newRank: rank => `✸ 새 계급! ${rank}`,
  levelToast: (level, label) => `✦ Lv${level} 달성: ${label}`,
  rankToast: (level, rank) => `✸ Lv${level}, 새 계급: ${rank}`,
  unlocked: names => `상점에 새 소품: ${names}`,
  bigToast: (label, fame, dust) => `${label} +${fame} 명성 +$${dust}`,
  bought: name => `✦ ${name} 착용!`,
  broke: '골드가 아직 모자라요.',
  commands: {
    toggle: 'CAPPL 창 열기·닫기',
    pick: '캐릭터 고르기(locki 또는 cappl)',
    status: '레벨·계급·명성·골드 한 줄 요약',
    rules: '보상표와 오늘 받은 횟수',
    sound: '효과음 크기: 보통 → 작게 → 끔',
  },
  opened: 'CAPPL 창을 열었어요. 닫으려면 /cappl',
  closed: 'CAPPL 창을 닫았어요. 다시 열려면 /cappl',
  waiting: '창이 열릴 자리를 기다려요(터미널을 넓혀 주세요).',
  picked: name => `이제 함께하는 친구: ${name}`,
  unknownCharacter: names => `그런 캐릭터는 없어요. 고를 수 있는 이름: ${names}`,
  status: p =>
    `${p.name} Lv${p.level} ${p.rank} · 명성 ${p.fame} (${p.progress}) · 골드 $${p.dust} · ${p.fans} · 소품 ${p.owned}/${p.total} · 재주 ${p.tricks}/${p.allTricks}`,
  pet: '쓰다듬기',
  trick: '재주',
  treat: (name, price) => `간식: ${name} $${price}`,
  noTreatGold: '간식 살 골드가 아직 모자라요.',
  noTricks: '아직 배운 재주가 없어요. 첫 재주는 Lv2에 배워요.',
  nextTrick: (level, name) => `다음 재주: Lv${level} ${name}`,
  learned: name => `새 재주를 배웠어요: ${name}!`,
  chestToast: (level, gold) => `Lv${level} 상자: +$${gold}`,
  luckyToast: gold => `행운의 사금! +$${gold}`,
  bounties: '▸ 오늘의 현상금',
  quests: {
    bullseye3: '고친 뒤 테스트 통과 3번', commit2: '커밋 2번', check2: '오류 없는 검사/빌드 2번',
    comeback1: '실패한 테스트 고치기', merge1: 'PR 병합하기', pr1: 'PR 열기',
    break1: '쉬었다 돌아오기', plan1: '고치기 전에 계획 승인',
    pet3: '쓰다듬기 3번', treat1: '간식 주기', trick2: '재주 2번 보기',
  },
  questLine: (label, have, target, gold, isDone) => (isDone ? `✓ ${label} +$${gold}` : `▸ ${label} ${have}/${target} $${gold}`),
  bonusLine: (gold, isDone) => (isDone ? `✓ 셋 다 완료 +$${gold}` : `  셋 다 하면 +$${gold}`),
  questToast: (label, gold) => `현상금 완료: ${label} +$${gold}`,
  bonusToast: gold => `오늘 현상금을 모두 마쳤어요! +$${gold}`,
  sound: { normal: '보통', quiet: '작게', off: '끔' },
  soundSet: (now, next) => `효과음: ${now}. /cappl-sound를 한 번 더 입력하면 ${next}`,
  hint: { idle: '클릭하거나 ctrl+x Tab으로 조작', focused: '⇅ 이동 ∙ Enter 선택 ∙ Esc 나가기', scroll: 'Tab 이동 ∙ ⇅ 스크롤 ∙ Enter 선택' },
  bountyHeader: (done, total) => `▸ 오늘의 현상금 ${done}/${total}`,
  menu: { rules: '규칙과 현상금', status: '내 현황', back: '돌아가기' },
  rules: {
    title: '보상 규칙',
    intro: '사람이 확인할 수 있는 결과에만 보상해요.',
    earn: '▸ 결과 보상 (명성, 골드)',
    when: {
      verify: '파일을 고친 뒤 처음 통과한 테스트',
      comeback: '실패한 테스트를 고쳐서 통과',
      check: '고친 뒤 오류 없이 끝난 타입 검사, 린트, 빌드',
      commit: '커밋 (테스트로 확인했거나 작으면 더 받아요)',
      pr: '`gh pr create`로 PR을 열었을 때',
      merge: '`gh pr merge`로 병합했을 때',
      plan: '고치기 전에 계획을 승인했을 때',
      break: '한 시간 넘게 일하고 20분 넘게 쉬었다 돌아옴',
      daily: '그날 첫 프롬프트',
    },
    values: (fame, dust) => (fame > 0 ? `명성 +${fame} ∙ $${dust}` : `$${dust}`),
    today: n => `오늘 ${n}번`,
    limit: { taper: full => `하루 ${full}번까지 제값`, cap: n => `하루 ${n}번까지` },
    taper: '같은 보상을 하루에 많이 받으면 값이 절반, 다시 5분의 1로 줄어요.',
    commitBonus: '테스트로 확인한 커밋은 명성 +5와 $3을, 파일 수정 8번 이하의 작은 커밋은 명성 +2를 더 받아요.',
    bountyTitle: '▸ 현상금',
    bounty: ['하루 세 개: 친구와 하는 일 하나, 작업 결과 둘.', '하나는 한 번만 받고, 셋 다 하면 $15를 더 받아요.'],
    bonusTitle: '▸ 보너스 골드',
    bonus: ['레벨 상자: 레벨이 오를 때마다 $5 + 레벨', '행운의 사금: 결과 16번에 한 번꼴로 $5-15', '간식: $6, 먹으면 재주를 더 자주 부려요'],
    noneTitle: '▸ 보상 없음',
    none: '프롬프트, 토큰, 도구 호출, 코드 줄 수',
    fair: (hour, offset) => `연속 출석 기록도 벌칙도 없어요. 하루는 ${hour}시에 바뀌어요(UTC${offset}).`,
  },
  progress: {
    title: '내 현황',
    toNext: (n, level) => `Lv${level}까지 명성 ${n}`,
    today: '▸ 오늘',
    nothingToday: '아직 없어요. 테스트를 통과하거나 커밋해 보세요.',
    count: (label, n) => `${label} ${n}번`,
    tricks: (have, all) => `▸ 재주 ${have}/${all}`,
    items: (have, all) => `▸ 옷장 ${have}/${all}`,
    allLearned: '재주를 모두 배웠어요',
    allUnlocked: '소품이 모두 열렸어요',
  },
}

export const WORDS: Readonly<Record<Language, Words>> = { en: EN, ko: KO }

// `auto` follows Claude Code's own `language` setting ("Korean", "한국어", "ko"...).
export function languageOf(option: unknown, setting: unknown): Language {
  if (option === 'en' || option === 'ko') return option
  const text = typeof setting === 'string' ? setting.trim().toLowerCase() : ''

  return /^(ko|kor)|korean|한국/.test(text) ? 'ko' : 'en'
}
