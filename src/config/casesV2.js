import bearImage from '../imgs/bear.png'
import homelessImage from '../imgs/homeless.png'
import marchImage from '../imgs/march_8th.png'
import premiumImage from '../imgs/premium.png'
import springImage from '../imgs/spring.png'
import standardImage from '../imgs/standard.png'
import unusualImage from '../imgs/unusual.png'

export const caseTypes = {
  homeless: {
    titleKey: 'cases.types.homeless.title',
    shortKey: 'cases.types.homeless.short',
    textKey: 'cases.types.homeless.text',
    image: homelessImage,
    accent: 'amber',
    stars: 25,
  },
  standard: {
    titleKey: 'cases.types.standard.title',
    shortKey: 'cases.types.standard.short',
    textKey: 'cases.types.standard.text',
    image: standardImage,
    accent: 'cyan',
    stars: 65,
  },
  unusual: {
    titleKey: 'cases.types.unusual.title',
    shortKey: 'cases.types.unusual.short',
    textKey: 'cases.types.unusual.text',
    image: unusualImage,
    accent: 'violet',
    stars: 120,
  },
  premium: {
    titleKey: 'cases.types.premium.title',
    shortKey: 'cases.types.premium.short',
    textKey: 'cases.types.premium.text',
    image: premiumImage,
    accent: 'pink',
    stars: 240,
  },
  spring: {
    titleKey: 'cases.types.spring.title',
    shortKey: 'cases.types.spring.short',
    textKey: 'cases.types.spring.text',
    image: springImage,
    accent: 'green',
    stars: 95,
  },
  march_8th: {
    titleKey: 'cases.types.march_8th.title',
    shortKey: 'cases.types.march_8th.short',
    textKey: 'cases.types.march_8th.text',
    image: marchImage,
    accent: 'pink',
    stars: 110,
  },
}

export const giftTypes = {
  bear: {
    titleKey: 'cases.giftTypes.bear',
    image: bearImage,
  },
}

export const missionMilestones = [
  { xp: 500, caseType: 'homeless' },
  { xp: 1000, caseType: 'standard' },
]

export const rewardVisuals = {
  coins: { labelKey: 'cases.rewards.coins', icon: '🪙', tone: 'amber' },
  starcoins: { labelKey: 'cases.rewards.starcoins', icon: '🪐', tone: 'cyan' },
  shop_item: { labelKey: 'cases.rewards.shop_item', icon: '💎', tone: 'violet' },
  vip: { labelKey: 'cases.rewards.vip', icon: '⭐', tone: 'pink' },
  gift: { labelKey: 'cases.rewards.gift', icon: '🎁', tone: 'green' },
}
