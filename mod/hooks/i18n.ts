import type { Language, RewardKind } from '../types'

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
  status: (p: { name: string; level: number; rank: string; fame: number; progress: string; dust: number; fans: string; owned: number; total: number }) => string
  sound: Record<'normal' | 'quiet' | 'off', string>
  soundSet: (now: string, next: string) => string
  rules: {
    intro: string
    line: (label: string, fame: number, dust: number, limit: string, today: number, rate: number) => string
    cap: (n: number) => string
    taper: (full: number) => string
    commitBonus: string
    verifyNote: string
    dayNote: (hour: number, offset: string) => string
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
  scrollHint: '▾ Shop below: click the pane and scroll',
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
    `${p.name} Lv${p.level} ${p.rank} · Rep ${p.fame} (${p.progress}) · Gold $${p.dust} · ${p.fans} · Items ${p.owned}/${p.total}`,
  sound: { normal: 'normal', quiet: 'quiet', off: 'off' },
  soundSet: (now, next) => `Sound effects: ${now}. Run /cappl-sound again for ${next}.`,
  rules: {
    intro: 'Rewards go to results a person can check. Prompts, tokens and tool calls earn nothing.',
    line: (label, fame, dust, limit, today, rate) => `- ${label}: rep ${fame}, gold $${dust} (${limit}) · today ${today}, now ×${rate}`,
    cap: n => `up to ${n} a day`,
    taper: full => `half after ${full} a day, a fifth after ${full * 2}`,
    commitBonus: '- Claim staked bonus: rep +5 and $3 when tests passed since the last commit, rep +2 for a small commit (8 edits or fewer)',
    verifyNote: '- Bullseye is the first passing test after edits; Showdown won is fail → fix → pass. Running the same test again earns nothing.',
    dayNote: (hour, offset) => `- A day starts at ${hour}:00 local time (UTC${offset}). There are no streaks; a day off costs nothing.`,
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
  scrollHint: '▾ 상점은 창을 누르고 아래로',
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
    `${p.name} Lv${p.level} ${p.rank} · 명성 ${p.fame} (${p.progress}) · 골드 $${p.dust} · ${p.fans} · 소품 ${p.owned}/${p.total}`,
  sound: { normal: '보통', quiet: '작게', off: '끔' },
  soundSet: (now, next) => `효과음: ${now}. /cappl-sound를 한 번 더 입력하면 ${next}`,
  rules: {
    intro: '보상은 사람이 확인한 결과에만 줘요. 프롬프트·토큰·도구 호출 수에는 주지 않아요.',
    line: (label, fame, dust, limit, today, rate) => `- ${label}: 명성 ${fame}, 골드 $${dust} (${limit}) · 오늘 ${today}번, 지금 ×${rate}`,
    cap: n => `하루 ${n}번까지`,
    taper: full => `하루 ${full}번 넘으면 ½, ${full * 2}번 넘으면 ⅕`,
    commitBonus: '- 말뚝 박기 덧보상: 직전 커밋 뒤 테스트로 확인했으면 명성 +5·$3, 파일 수정 8번 이하의 작은 커밋이면 명성 +2',
    verifyNote: '- 과녁 명중은 파일을 고친 뒤 처음 통과한 테스트, 결투 승리는 실패 → 수정 → 통과예요. 같은 테스트를 다시 돌리면 0이에요.',
    dayNote: (hour, offset) => `- 하루는 이 컴퓨터 시간 ${hour}시에 바뀌어요(UTC${offset}). 연속 출석 기록은 없고, 쉬어도 잃는 것은 없어요.`,
  },
}

export const WORDS: Readonly<Record<Language, Words>> = { en: EN, ko: KO }

// `auto` follows Claude Code's own `language` setting ("Korean", "한국어", "ko"...).
export function languageOf(option: unknown, setting: unknown): Language {
  if (option === 'en' || option === 'ko') return option
  const text = typeof setting === 'string' ? setting.trim().toLowerCase() : ''

  return /^(ko|kor)|korean|한국/.test(text) ? 'ko' : 'en'
}
