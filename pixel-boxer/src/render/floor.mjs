/* The square of canvas a catalogue's bout stands on (the motion catalogue, the effect study, the review sheet with fx=1):
   plain, in the canvas's colour as the ring's is lit (24 of its ramp, 22 to 25: world/ring.mjs; the user, 2026-11-25: "바닥은
   단색으로 무늬가 없습니다"). Flat at the canvas's height, with no bones: a ring through the canvas (renderer.mjs: a layer's
   ground) lifts them where they are, and lights them a step.
     floor(half, centre) -> { rows, count }: a splat every 8.5 cm over the square `half` metres either side of centre [x, z] */
export function floor(half, centre) {
  const gap = 0.085,
    n = Math.round((half * 2) / gap),
    rows = new Float32Array(n * n * 12),
    s = 0.042 ** 2;
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = centre[0] - half + (i + 0.5) * gap,
        z = centre[1] - half + (j + 0.5) * gap;
      rows.set([x, 0, z, s, 0, 0, 1e-6, 0, s, 24, 0, 3], k);
      k += 12;
    }
  return { rows, count: n * n };
}
