// Hotkeys typed with a Korean keyboard layout on. A Button's hotkey is a Latin letter
// or a digit, but with the Korean input method on, the same key arrives as a Hangul
// letter (p as ㅔ), or several keys as one syllable (t then p as 세). This turns what
// arrives back into the keys pressed on the standard two-set (두벌식) layout.

const JAMO: Readonly<Record<string, string>> = {
  ㅂ: 'q', ㅈ: 'w', ㄷ: 'e', ㄱ: 'r', ㅅ: 't', ㅛ: 'y', ㅕ: 'u', ㅑ: 'i', ㅐ: 'o', ㅔ: 'p',
  ㅁ: 'a', ㄴ: 's', ㅇ: 'd', ㄹ: 'f', ㅎ: 'g', ㅗ: 'h', ㅓ: 'j', ㅏ: 'k', ㅣ: 'l',
  ㅋ: 'z', ㅌ: 'x', ㅊ: 'c', ㅍ: 'v', ㅠ: 'b', ㅜ: 'n', ㅡ: 'm',
  // With shift held.
  ㅃ: 'q', ㅉ: 'w', ㄸ: 'e', ㄲ: 'r', ㅆ: 't', ㅒ: 'o', ㅖ: 'p',
  // Two letters the input method joined into one.
  ㄳ: 'rt', ㄵ: 'sw', ㄶ: 'sg', ㄺ: 'fr', ㄻ: 'fa', ㄼ: 'fq', ㄽ: 'ft', ㄾ: 'fx', ㄿ: 'fv', ㅀ: 'fg', ㅄ: 'qt',
  ㅘ: 'hk', ㅙ: 'ho', ㅚ: 'hl', ㅝ: 'nj', ㅞ: 'np', ㅟ: 'nl', ㅢ: 'ml',
}
const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const MEDIALS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const FINALS = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']

// The keys behind typed text, in order: Latin letters as lowercase, digits as they
// are, Hangul letters and syllables as the keys that make them; anything else dropped.
export function keysOf(text: string): string[] {
  const keys: string[] = []
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (/^[a-z0-9]$/i.test(char)) keys.push(char.toLowerCase())
    else if (JAMO[char] !== undefined) keys.push(...JAMO[char]!)
    else if (code >= 0xac00 && code <= 0xd7a3) {
      const index = code - 0xac00
      const parts = [INITIALS[Math.floor(index / 588)]!, MEDIALS[Math.floor((index % 588) / 28)]!, FINALS[index % 28]!]
      for (const part of parts) if (part !== '') keys.push(...(JAMO[part] ?? ''))
    }
  }

  return keys
}
