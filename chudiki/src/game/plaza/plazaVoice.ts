import { getIslandAudio } from '../audio/AudioBus';
import { PLACEHOLDER_CUES, type CueId } from '../audio/cues';
import { claimCueOnce } from '../audio/mix';
import { plazaEnterCues } from './plazaCues';

let chainSeq = 0;
let enterStarted = false;
const introListeners = new Set<(id: CueId | null) => void>();

let lastIntro: CueId | null = null;

function tellIntro(id: CueId | null) {
  lastIntro = id;
  introListeners.forEach((fn) => fn(id));
}

export function watchPlazaIntro(listener: (id: CueId | null) => void): () => void {
  introListeners.add(listener);
  listener(lastIntro);
  return () => introListeners.delete(listener);
}

export function stopPlazaVoice() {
  chainSeq += 1;
  const audio = getIslandAudio();
  audio.stopCue();
  audio.holdBed(false);
  tellIntro(null);
}

export function resetPlazaEnter() {
  enterStarted = false;
  stopPlazaVoice();
  getIslandAudio().holdBed(false);
}

export function speakPlaza(id: CueId) {
  if (PLACEHOLDER_CUES.has(id)) return;
  stopPlazaVoice();
  tellIntro(id);
  const audio = getIslandAudio();
  const pending = audio.playCue(id);
  audio.holdBed(false);
  void pending;
}

export function hintPlaza(id: CueId) {
  if (!claimCueOnce(id)) return;
  speakPlaza(id);
}

/**
 * First clip starts in this turn (same tap as unlock). Later lines wait for
 * `ended` so a suspended WebAudio graph cannot duck the garden and stay mute.
 */
export function speakPlazaChain(ids: CueId[]) {
  stopPlazaVoice();
  if (!ids.length) return;
  const my = ++chainSeq;
  const audio = getIslandAudio();
  tellIntro(ids[0]);
  void audio.unlock();
  const first = audio.playCue(ids[0]);
  void (async () => {
    let heard = false;
    let ok = await first;
    if (my !== chainSeq) return;
    if (ok) {
      heard = true;
      audio.holdBed(true);
      await audio.waitCueEnd();
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 3200));
    }
    for (let i = 1; i < ids.length; i++) {
      if (my !== chainSeq) return;
      tellIntro(ids[i]);
      ok = await audio.playCue(ids[i]);
      if (my !== chainSeq) return;
      if (ok) {
        heard = true;
        audio.holdBed(true);
        await audio.waitCueEnd();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 3200));
      }
    }
    if (my === chainSeq) {
      tellIntro(null);
      audio.holdBed(false);
      if (!heard) enterStarted = false;
    }
  })();
}

export function greetPlazaLawn() {
  if (enterStarted) return;
  enterStarted = true;
  speakPlazaChain(plazaEnterCues());
}
