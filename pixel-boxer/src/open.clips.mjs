/* The recorded comparisons of the open-questions catalogue (open.html, src/open.mjs): each a short video of one build of
   the game, recorded beside the others of its group over the same frames, the same crop and the same size, so that the
   page can stand them side by side at one width on one clock. tools/openclips.mjs records them into docs/ref/open/.
     GROUPS  { [group id]: { say (one line: what is compared), scene (what was run), fps, frames, w, h (pixels of every
               clip of the group), clips: [{ id, say (the build's name on the card), file (docs/ref/open/<id>.webm),
               poster (docs/ref/open/<id>.jpg), patch (docs/ref/open/patches/<name>.patch, or null: this checkout),
               measure (one line of what was measured on this build, or '') }] } }
   A group with no clips yet is shown as waiting. */
export const GROUPS = {
  arm: { say: '체육복의 오른 팔뚝: 지금 / A 자세를 고침 / B 그릴 때만 앞으로', scene: '게임(index.html?auto&seed=7&wear=training, 1280×720)의 1030~1228프레임: 가드를 내린 채 잽, 옆걸음, 잽, 옆걸음, 끝에 가드를 올림. 두 선수 둘레로 자름. A는 자세가 바뀌어 시합이 조금 달리 흐름(플레이어 자리 최대 22 cm, 카메라도 조금)', fps: 20, frames: 67, w: 360, h: 400, clips: [
      { id: 'arm-now', say: '지금', file: 'docs/ref/open/arm-now.webm', poster: 'docs/ref/open/arm-now.jpg', patch: null, measure: '팔뚝이 보이는 몫 평균 0.27, 최소 0.00' },
      { id: 'arm-a', say: 'A 자세를 고침', file: 'docs/ref/open/arm-a.webm', poster: 'docs/ref/open/arm-a.jpg', patch: 'docs/ref/open/patches/arm-a.patch', measure: '팔뚝이 보이는 몫 평균 0.50, 최소 0.40' },
      { id: 'arm-b', say: 'B 그릴 때만 앞으로', file: 'docs/ref/open/arm-b.webm', poster: 'docs/ref/open/arm-b.jpg', patch: 'docs/ref/open/patches/arm-b.patch', measure: '팔뚝이 보이는 몫 평균 0.52, 최소 0.17' }
    ] },
  lean: { say: '로프에 기댐: 지금(약 7°) / 크게', scene: '링(index.html?auto&spar&seed=3, 1280×720, 상대는 서 있기만): 1초부터 3.2초 동안 뒤로 걸어 로프에 기대어(약 2.2초 눌림) 놓음, 45~330프레임. 옆에서 보는 게임 카메라, 그의 둘레로 자름', fps: 20, frames: 96, w: 380, h: 400, clips: [
      { id: 'lean-now', say: '지금', file: 'docs/ref/open/lean-now.webm', poster: 'docs/ref/open/lean-now.jpg', patch: null, measure: '상체가 곧게 서는 데까지(가드에서 7.4° 뒤로), 로프 눌림 9.6 cm' },
      { id: 'lean-more', say: '크게', file: 'docs/ref/open/lean-more.webm', poster: 'docs/ref/open/lean-more.jpg', patch: 'docs/ref/open/patches/lean-more.patch', measure: '8.1° 뒤로 젖힘(가드에서 15.5°), 로프 눌림 12.4 cm' }
    ] },
  tempo: { say: '스파링의 동작 사이 회복: 지금 / 줄임', scene: '스파링(spar.html, 390×844) 대련 #7, 종이 울린 뒤 첫 6초; 시합 화면과 네 줄 타임라인으로 자름. 대본을 빌드마다 다시 짜므로 첫 공방 뒤로는 다른 라운드', fps: 20, frames: 120, w: 390, h: 620, clips: [
      { id: 'tempo-now', say: '지금', file: 'docs/ref/open/tempo-now.webm', poster: 'docs/ref/open/tempo-now.jpg', patch: null, measure: '초당 기술 빨강 2.28 · 파랑 2.03, 가장 긴 틈 0.67초, 56.6초에 KO' },
      { id: 'tempo-fast', say: '줄임', file: 'docs/ref/open/tempo-fast.webm', poster: 'docs/ref/open/tempo-fast.jpg', patch: 'docs/ref/open/patches/tempo-fast.patch', measure: '초당 기술 빨강 2.88 · 파랑 1.75, 가장 긴 틈 0.82초, 58.6초에 KO' }
    ] }
};
