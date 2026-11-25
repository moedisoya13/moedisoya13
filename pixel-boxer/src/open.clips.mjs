/* The recorded comparisons of the open-questions catalogue (open.html, src/open.mjs): each a short video of one build of
   the game, recorded beside the others of its group over the same frames, the same crop and the same size, so that the
   page can stand them side by side at one width on one clock. tools/openclips.mjs records them into docs/ref/open/.
     GROUPS  { [group id]: { say (one line: what is compared), scene (what was run), fps, frames, w, h (pixels of every
               clip of the group), clips: [{ id, say (the build's name on the card), file (docs/ref/open/<id>.webm),
               poster (docs/ref/open/<id>.jpg), patch (docs/ref/open/patches/<name>.patch, or null: this checkout),
               measure (one line of what was measured on this build, or '') }] } }
   A group with no clips yet is shown as waiting. */
export const GROUPS = {
  arm: { say: '체육복의 오른 팔뚝: 지금 / A 자세를 고침 / B 그릴 때만 앞으로', scene: '', fps: 20, frames: 0, w: 0, h: 0, clips: [] },
  lean: { say: '로프에 기댐: 지금(약 7°) / 크게', scene: '', fps: 20, frames: 0, w: 0, h: 0, clips: [] },
  tempo: { say: '스파링의 동작 사이 회복: 지금 / 줄임', scene: '', fps: 20, frames: 0, w: 0, h: 0, clips: [] }
};
