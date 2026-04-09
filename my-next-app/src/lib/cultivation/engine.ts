import { CultivationState, RealmStage, RealmTier } from './types';

export function calculateCultivation(totalPracticed: number, averageMastery: number): CultivationState {
  let realm: RealmTier = '凡人';
  let stage: RealmStage = '';
  let progressToNext = 0;
  let description = '';

  if (totalPracticed < 50) {
    realm = '凡人';
    stage = '';
    progressToNext = (totalPracticed / 50) * 100;
    description = '初窥门径，肉参凡胎。多加练习方能引气入体。';
  } else if (totalPracticed < 200) {
    realm = '炼气期';
    stage = getStage(totalPracticed, 50, 200);
    progressToNext = ((totalPracticed - 50) / (200 - 50)) * 100;
    description = '引气入体，经脉初启。你已能感受到知识的流动。';
  } else if (totalPracticed < 1000) {
    realm = '筑基期';
    stage = getStage(totalPracticed, 200, 1000);
    progressToNext = ((totalPracticed - 200) / (1000 - 200)) * 100;
    description = '筑基厚土，万丈高楼。此时根基最为关键。';
  } else if (totalPracticed < 3000) {
    realm = '金丹期';
    stage = getStage(totalPracticed, 1000, 3000);
    progressToNext = ((totalPracticed - 1000) / (3000 - 1000)) * 100;
    description = '丹成九转，一颗金丹吞入腹，始知我命不由天。';
  } else if (totalPracticed < 10000) {
    realm = '元婴期';
    stage = getStage(totalPracticed, 3000, 10000);
    progressToNext = ((totalPracticed - 3000) / (10000 - 3000)) * 100;
    description = '破丹成婴，神魂不灭。知识已内化为你的本源力量。';
  } else {
    realm = '化神期';
    stage = '大圆满';
    progressToNext = 100;
    description = '化神出窍，与道合真。你已是这一领域的宗师。';
  }

  // 如果掌握度过低，给予警告性的描述
  if (averageMastery < 60 && realm !== '凡人') {
    description = '根基虚浮，切莫贪快！虽然修为尚可，但掌握不牢，突破恐有走火入魔之虞。';
  }

  return {
    realm,
    stage,
    total修为: totalPracticed,
    mastery: averageMastery,
    progressToNext,
    description
  };
}

function getStage(current: number, min: number, max: number): RealmStage {
  const percent = (current - min) / (max - min);
  if (percent < 0.33) return '前期';
  if (percent < 0.66) return '中期';
  if (percent < 0.95) return '后期';
  return '大圆满';
}
