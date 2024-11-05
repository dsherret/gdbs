export function average(numbers: number[]): number {
  if (numbers.length === 0) {
    throw new Error("Cannot calculate average of empty array");
  }
  return numbers.reduce((acc, n) => acc + n, 0) / numbers.length;
}

export function range(numbers: number[]): [number, number] {
  if (numbers.length === 0) {
    throw new Error("Cannot calculate range of empty array");
  }
  let min = numbers[0];
  let max = numbers[0];
  for (let i = 1; i < numbers.length; i++) {
    const n = numbers[i];
    if (n < min) {
      min = n;
    }
    if (n > max) {
      max = n;
    }
  }
  return [min, max];
}
