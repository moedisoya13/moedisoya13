/* Generated motion (tools/kimodo_import.py) as poses. The clip is dense, thirty frames a second; what makes it hit is what is
   then left out, so the ways of sampling it are the point:
     motionPose(m, frame)        one frame as a pose
     sampleMotion(m, t)          smooth: the generated motion as it came
     onDrawings(m, t, fps)       held drawings, `fps` a second (12 is animation on twos and a half: the pixel-art cadence)
     cut(m, keys)                a clip of chosen frames only: keys [{ t, frame, in }] in the same form as clips.mjs, so the
                                 decisive frames of a generated attack become its wind-up, contact and follow-through */
import * as Q from './quat.mjs';
import { NAMES } from '../rig/skeleton.mjs';
import { blend } from './pose.mjs';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function motionPose(m, frame) {
  const f = Math.max(0, Math.min(m.frames - 1, Math.round(frame))),
    rot = {};
  for (const name of NAMES) rot[name] = IDENTITY;
  m.joints.forEach((name, j) => (rot[name] = Q.toM3(m.rot[f][j])));
  return { root: m.root[f], rot, stretch: 1 };
}
export function sampleMotion(m, t) {
  const x = Math.max(0, Math.min(m.frames - 1, t * m.fps)),
    f = Math.floor(x);
  return blend(motionPose(m, f), motionPose(m, f + 1), x - f);
}
export const onDrawings = (m, t, fps) => motionPose(m, (Math.floor(t * fps + 1e-6) / fps) * m.fps);

const smooth = x => x * x * (3 - 2 * x);
export function cut(m, keys) {
  const poses = keys.map(k => motionPose(m, k.frame));
  return {
    dur: keys[keys.length - 1].t,
    sample(t, from) {
      let i = 0;
      while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
      const lead = keys[i].in || 0;
      if (lead <= 0 || t - keys[i].t >= lead) return poses[i];
      return blend(i > 0 ? poses[i - 1] : from || poses[i], poses[i], smooth((t - keys[i].t) / lead));
    }
  };
}
