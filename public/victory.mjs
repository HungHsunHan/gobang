const imageCount = 7;

export function selectVictoryImage(opponent, result, random = Math.random) {
  if (opponent !== 'computer' || result?.winner !== 0) return null;
  const imageNumber = Math.floor(random() * imageCount) + 1;
  return `./victory/celebration-${imageNumber}.webp`;
}
