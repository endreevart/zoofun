import { useEffect, useRef, useState } from 'react';
import { trackAction } from '../analytics';
import { assetUrl } from '../assetUrl';
import type { ChudikSpec } from '../game/creatures/ChudikSpec';
import { displayStillUrl, portraitUrlOf } from '../game/drawing/portrait';
import { PlazaGlb, type PlazaBurst } from '../game/plaza/PlazaGlb';
import {
  beatPlaza,
  digPlaza,
  emotePlaza,
  enterPlaza,
  fetchPlazaReady,
  fetchPlazaToys,
  leavePlaza,
  type PlazaMound,
  type PlazaPeer,
  type PlazaTicket,
  type PlazaToy,
} from '../game/plaza/plazaApi';
import type { PlazaStudio } from '../game/plaza/plazaStudio';
import {
  PLAZA_EMOTES,
  plazaPickMode,
  soloPlazaRoom,
  type PlazaEmoteId,
} from '../game/plaza/plazaCopy';
import { loadCreatures } from '../game/persistence/zooStore';
import { getIslandAudio } from '../game/audio/AudioBus';
import { PLAZA_CUE_IDS, PLAZA_TOY_WAIT_MS, plazaHidesHome, plazaIntroSpec } from '../game/plaza/plazaCues';
import type { CueId } from '../game/audio/cues';
import { greetPlazaLawn, hintPlaza, resetPlazaEnter, speakPlaza, stopPlazaVoice, watchPlazaIntro } from '../game/plaza/plazaVoice';
import { moundsFromRoom, ticketsFromRoom, PLAZA_FIND_MS } from '../game/plaza/plazaDig';
import {
  absorbPlazaToys,
  clearPlazaHold,
  isPlazaToyPreparing,
  peekPlazaHold,
  upsertPlazaToy,
  type PlazaLawnToy,
} from '../game/plaza/plazaToy';
import { FirstDrawPrompt } from './FirstDrawPrompt';
import { PlazaHud } from './PlazaHud';
import { PlazaPick } from './PlazaPick';
import { PlazaIntro } from './PlazaIntro';
import { WalkPad } from './WalkPad';

type Props = {
  onLeave(): void;
  onError(message: string): void;
  onCredit(remaining: number): void;
  onDraw(): void;
  onPhoto(): void;
  onDrawToy(): void;
  holdRev?: number;
  hideHome?: boolean;
};

export function PlazaYard({ onLeave, onError, onCredit, onDraw, onPhoto, onDrawToy, holdRev = 0, hideHome = false }: Props) {
  const [toys, setToys] = useState<PlazaToy[]>([]);
  const [peers, setPeers] = useState<PlazaPeer[]>([]);
  const [self, setSelf] = useState<ChudikSpec | null>(null);
  const [portrait, setPortrait] = useState('');
  const [phase, setPhase] = useState<'boot' | 'need' | 'pick' | 'lawn'>('boot');
  const [burst, setBurst] = useState<PlazaBurst | null>(null);
  const [studio, setStudio] = useState<PlazaStudio | null>(null);
  const [building, setBuilding] = useState(false);
  const [emotesOpen, setEmotesOpen] = useState(false);
  const [mounds, setMounds] = useState<PlazaMound[]>([]);
  const [tickets, setTickets] = useState<PlazaTicket[]>([]);
  const [nearMound, setNearMound] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  const [finding, setFinding] = useState(false);
  const [intro, setIntro] = useState<CueId | null>(null);
  const [nudgeEmote, setNudgeEmote] = useState(false);
  const [lawnToys, setLawnToys] = useState<PlazaLawnToy[]>([]);
  const [mineRev, setMineRev] = useState(0);
  const leaving = useRef(false);
  const digging = useRef(false);
  const localOnly = useRef(false);
  const burstId = useRef(0);
  const findTimer = useRef(0);
  const walk = useRef({ forward: 0, right: 0 });
  const jump = useRef(false);
  const studioRef = useRef<PlazaStudio | null>(null);
  studioRef.current = studio;

  const goHome = () => {
    if (leaving.current) return;
    leaving.current = true;
    resetPlazaEnter();
    speakPlaza('plaza_home');
    void leavePlaza().finally(onLeave);
  };

  const rememberSelf = async (specId: string, roster: PlazaToy[]) => {
    const records = await loadCreatures();
    const record = records.find((row) => row.spec.id === specId);
    setSelf(record?.spec ?? null);
    const pic =
      portraitUrlOf(record?.spec.drawing) ?? roster.find((item) => item.spec_id === specId)?.portrait ?? '';
    setPortrait(displayStillUrl(pic) ?? pic);
  };

  const applyRoom = (room: { peers?: PlazaPeer[]; stamps_rev?: number; mounds?: PlazaMound[]; tickets?: PlazaTicket[] } | null) => {
    if (!room) {
      onError('Связь с поляной пропала.');
      goHome();
      return;
    }
    setPeers(Array.isArray(room.peers) ? room.peers : []);
    setMounds(moundsFromRoom(room.mounds));
    setTickets(ticketsFromRoom(room.tickets));
    studioRef.current?.syncRev(room.stamps_rev);
    setPhase('lawn');
  };

  const join = async (specId: string, roster: PlazaToy[]) => {
    void getIslandAudio().unlock();
    trackAction('plaza.enter');
    await rememberSelf(specId, roster);
    const room = await enterPlaza(specId);
    if (room) {
      localOnly.current = false;
      applyRoom(room);
      return;
    }
    const toy = roster.find((item) => item.spec_id === specId);
    if (!toy) {
      applyRoom(null);
      return;
    }
    localOnly.current = true;
    applyRoom(soloPlazaRoom(toy));
  };

  useEffect(() => {
    let dead = false;
    void (async () => {
      const ready = await fetchPlazaReady();
      if (dead) return;
      const mode = plazaPickMode(ready.length);
      if (mode === 'none') {
        setPhase('need');
        return;
      }
      setToys(ready);
      if (mode === 'one') {
        await join(ready[0].spec_id, ready);
        return;
      }
      setPhase('pick');
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'lawn') return;
    if (localOnly.current) return;
    let dead = false;
    const tick = window.setInterval(() => {
      void beatPlaza().then((room) => {
        if (dead || leaving.current) return;
        if (!room) {
          onError('Связь с поляной пропала.');
          goHome();
          return;
        }
        setPeers(room.peers);
        setMounds(moundsFromRoom(room.mounds));
        setTickets(ticketsFromRoom(room.tickets));
        studioRef.current?.syncRev(room.stamps_rev);
        void fetchPlazaToys().then((body) => {
          if (!dead && !leaving.current && body) {
            setLawnToys((list) => {
              const next = absorbPlazaToys(body.toys, list);
              const hold = peekPlazaHold();
              if (hold && next.some((toy) => toy.model === hold.model && toy.placed)) {
                clearPlazaHold();
              }
              return next;
            });
          }
        });
      });
    }, 2500);
    const onHide = () => {
      void leavePlaza();
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      dead = true;
      window.clearInterval(tick);
      window.removeEventListener('pagehide', onHide);
      if (!leaving.current) void leavePlaza();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (building) setEmotesOpen(false);
  }, [building]);

  useEffect(() => {
    if (phase !== 'lawn') return;
    let dead = false;
    void fetchPlazaToys().then((body) => {
      if (!dead && body) {
        setLawnToys((list) => {
          const next = absorbPlazaToys(body.toys, list);
          const hold = peekPlazaHold();
          if (hold && next.some((toy) => toy.model === hold.model && toy.placed)) {
            clearPlazaHold();
          }
          return next;
        });
      }
    });
    return () => {
      dead = true;
    };
  }, [phase, building]);

  useEffect(() => {
    studio?.noteToys(lawnToys);
  }, [studio, lawnToys]);

  const waitingMesh = lawnToys.some((toy) => isPlazaToyPreparing(toy));
  const pictureOnLawn = lawnToys.some((toy) => toy.placed && isPlazaToyPreparing(toy));
  const hadWaitingMesh = useRef(false);
  const toyWaitDismissed = useRef(false);
  const skipToyWait = () => {
    toyWaitDismissed.current = true;
    stopPlazaVoice();
    setIntro((cur) => (cur === 'plaza_toy_wait' ? null : cur));
  };
  useEffect(() => {
    if (phase !== 'lawn' || !waitingMesh) return;
    let dead = false;
    const tick = window.setInterval(() => {
      void fetchPlazaToys().then((body) => {
        if (dead || !body) return;
        setLawnToys((list) => absorbPlazaToys(body.toys, list));
      });
    }, 1500);
    return () => {
      dead = true;
      window.clearInterval(tick);
    };
  }, [phase, waitingMesh]);

  useEffect(() => {
    if (!waitingMesh) toyWaitDismissed.current = false;
  }, [waitingMesh]);

  useEffect(() => {
    if (phase !== 'lawn' || !waitingMesh || toyWaitDismissed.current || pictureOnLawn) return;
    setIntro('plaza_toy_wait');
    hintPlaza('plaza_toy_wait');
  }, [phase, waitingMesh, pictureOnLawn]);

  useEffect(() => {
    if (intro !== 'plaza_toy_wait') return;
    const timer = window.setTimeout(skipToyWait, PLAZA_TOY_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [intro]);

  useEffect(() => {
    if (intro !== 'plaza_toy_wait' || !pictureOnLawn) return;
    skipToyWait();
  }, [intro, pictureOnLawn]);

  useEffect(() => {
    if (waitingMesh) hadWaitingMesh.current = true;
    if (intro !== 'plaza_toy_wait' || waitingMesh || !hadWaitingMesh.current) return;
    hadWaitingMesh.current = false;
    stopPlazaVoice();
    setIntro(null);
  }, [intro, waitingMesh]);

  useEffect(() => {
    if (!studio || phase !== 'lawn') return;
    const hold = peekPlazaHold();
    if (!hold) return;
    studio.holdToy(hold.model, hold.still_url, hold.height, hold.model_url);
    setLawnToys((list) => upsertPlazaToy(list, { ...hold, placed: false }));
    setBuilding(true);
    setMineRev((n) => n + 1);
    if (isPlazaToyPreparing(hold) && !toyWaitDismissed.current) {
      setIntro('plaza_toy_wait');
      hintPlaza('plaza_toy_wait');
    }
    let dead = false;
    void fetchPlazaToys().then((body) => {
      if (dead || !body) return;
      setLawnToys((list) => {
        const next = absorbPlazaToys(body.toys, list);
        if (next.some((toy) => toy.model === hold.model && toy.placed)) clearPlazaHold();
        return next;
      });
    });
    return () => {
      dead = true;
    };
  }, [studio, phase, holdRev]);

  useEffect(() => {
    void getIslandAudio().preloadCues(PLAZA_CUE_IDS);
    getIslandAudio().preloadGarden();
  }, []);

  useEffect(() => {
    return () => resetPlazaEnter();
  }, []);

  useEffect(() => watchPlazaIntro((id) => {
    setIntro(id && plazaIntroSpec(id) ? id : null);
  }), []);

  useEffect(() => {
    if (intro === 'plaza_friends') setNudgeEmote(true);
  }, [intro]);

  useEffect(() => {
    if (emotesOpen) setNudgeEmote(false);
  }, [emotesOpen]);

  useEffect(() => {
    if (phase !== 'need') return;
    void getIslandAudio().unlock();
    speakPlaza('plaza_need');
  }, [phase]);

  useEffect(() => {
    if (phase !== 'pick') return;
    const onPointer = () => {
      document.removeEventListener('pointerdown', onPointer, true);
      void getIslandAudio().unlock();
      hintPlaza('plaza_pick');
    };
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'lawn') return;
    const onInput = () => {
      document.removeEventListener('pointerdown', onInput, true);
      window.removeEventListener('keydown', onInput, true);
      greetPlazaLawn();
    };
    document.addEventListener('pointerdown', onInput, { capture: true });
    window.addEventListener('keydown', onInput, true);
    return () => {
      document.removeEventListener('pointerdown', onInput, true);
      window.removeEventListener('keydown', onInput, true);
      window.clearTimeout(findTimer.current);
    };
  }, [phase]);

  const smashMound = () => {
    const id = nearMound;
    if (!id || digging.current || found || finding || building) return;
    const hit = mounds.find((item) => item.id === id);
    digging.current = true;
    getIslandAudio().playSfx('smash');
    const celebrate = (next: PlazaTicket[], remaining?: number) => {
      setTickets(next);
      speakPlaza('plaza_found');
      if (remaining != null) onCredit(remaining);
      setFinding(true);
      window.clearTimeout(findTimer.current);
      findTimer.current = window.setTimeout(() => {
        setFinding(false);
        setFound(true);
      }, PLAZA_FIND_MS);
    };
    void (async () => {
      if (localOnly.current) {
        setMounds((list) => list.filter((item) => item.id !== id));
        setNearMound(null);
        digging.current = false;
        if (hit) {
          const ticket = { id: `local-${Date.now()}`, x: hit.x, z: hit.z };
          celebrate([ticket]);
          window.setTimeout(() => {
            setTickets((list) => list.filter((item) => item.id !== ticket.id));
          }, 4500);
        }
        return;
      }
      const body = await digPlaza(id);
      digging.current = false;
      if (!body) {
        setMounds((list) => list.filter((item) => item.id !== id));
        setNearMound(null);
        return;
      }
      setMounds(body.mounds);
      setNearMound(null);
      setTickets(body.tickets);
      if (!body.found) return;
      celebrate(body.tickets, body.remaining);
    })();
  };

  const leaveToCreate = (kind: 'draw' | 'photo') => {
    if (leaving.current) return;
    leaving.current = true;
    resetPlazaEnter();
    void leavePlaza().finally(() => {
      if (kind === 'draw') onDraw();
      else onPhoto();
    });
  };

  const sendEmote = (kind: PlazaEmoteId) => {
    trackAction('plaza.emote', { kind });
    getIslandAudio().playSfx(kind);
    burstId.current += 1;
    setBurst({ id: burstId.current, kind });
    if (!localOnly.current) {
      void emotePlaza(kind).then((room) => {
        if (room) {
          setPeers(room.peers);
          studioRef.current?.syncRev(room.stamps_rev);
        }
      });
    }
  };

  if (phase === 'need') {
    return (
      <div className="plaza-sheet" role="dialog" aria-label="Нужен зуфик">
        <div className="plaza-pick plaza-need">
          <FirstDrawPrompt plaza onDraw={onDraw} onPhoto={onPhoto} onClose={onLeave} />
        </div>
      </div>
    );
  }

  if (phase === 'pick') {
    return (
      <PlazaPick
        toys={toys}
        onJoin={(specId) => void join(specId, toys)}
        onClose={goHome}
      />
    );
  }

  if (phase !== 'lawn') {
    return (
      <div className="plaza-sheet" role="status">
        <div className="plaza-boot">Собираем поляну…</div>
      </div>
    );
  }

  return (
    <div className="plaza-sheet plaza-lawn" role="application" aria-label="Общий зоопарк">
      <PlazaGlb
        className="plaza-glb"
        spec={self}
        portrait={portrait}
        others={peers}
        burst={burst}
        walk={walk}
        building={building}
        jump={jump}
        mounds={mounds}
        tickets={tickets}
        onNearMound={(id) => {
          setNearMound(id);
          if (id && !building && !found && !finding) hintPlaza('plaza_dig');
        }}
        onStudio={(next) => {
          next?.setNetworked(!localOnly.current);
          setStudio(next);
        }}
      />
      {hideHome || plazaHidesHome(intro) ? null : (
        <button className="plaza-home" type="button" onClick={goHome}>
          Домой
        </button>
      )}
      {studio ? (
        <PlazaHud
          studio={studio}
          building={building}
          toys={lawnToys}
          wantMine={mineRev}
          onSetBuild={setBuilding}
          onSpeak={speakPlaza}
          onDrawToy={onDrawToy}
        />
      ) : null}
      {intro && plazaIntroSpec(intro) ? (
        <PlazaIntro
          cue={intro}
          onSkip={() => {
            if (intro === 'plaza_toy_wait') {
              skipToyWait();
              return;
            }
            stopPlazaVoice();
            setIntro(null);
          }}
        />
      ) : null}
      {nearMound && !building && !found && !finding ? (
        <button className="plaza-dig" type="button" aria-label="Ломать" onClick={smashMound}>
          🔨
        </button>
      ) : null}
      {found ? (
        <FirstDrawPrompt again onDraw={() => leaveToCreate('draw')} onPhoto={() => leaveToCreate('photo')} onClose={() => setFound(false)} />
      ) : null}
      <WalkPad
        className={intro === 'plaza_walk' ? 'is-pulse' : undefined}
        onWalk={(forward, right) => {
          walk.current = { forward, right };
        }}
      />
      <div
        className="plaza-dock"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className={`plaza-emote-tray${emotesOpen ? ' is-open' : ''}`}>
          <button
            className={`plaza-emote-toggle${emotesOpen ? ' is-on' : ''}${nudgeEmote && !emotesOpen ? ' is-pulse' : ''}`}
            type="button"
            aria-label="Эмоции"
            aria-expanded={emotesOpen}
            onClick={() => {
              setEmotesOpen((open) => {
                if (!open) hintPlaza('plaza_emote');
                return !open;
              });
            }}
          >
            <img src={assetUrl(PLAZA_EMOTES[0].src)} alt="" />
          </button>
          <div className="plaza-emotes" role="group" aria-hidden={!emotesOpen}>
            {PLAZA_EMOTES.map((item) => (
              <button
                key={item.id}
                className="plaza-emote"
                type="button"
                tabIndex={emotesOpen ? 0 : -1}
                aria-label={item.label}
                onClick={() => sendEmote(item.id)}
              >
                <img src={assetUrl(item.src)} alt="" />
              </button>
            ))}
          </div>
        </div>
        <button
          className="plaza-jump"
          type="button"
          aria-label="Прыгнуть"
          onPointerDown={(event) => {
            event.preventDefault();
            jump.current = true;
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
