# Island UI voice clips

Drop ElevenLabs MP3s here. The island serves them as static files (same as `garden.mp3`). Do not put the ElevenLabs key in the website or this folder.

Lines and filenames live in `chudiki/src/game/audio/cues.ts`.

Suggested voice: the same `ELEVENLABS_VOICE_ID` as creature-card narration, model `eleven_multilingual_v2`, Russian, warm and slow, no names.

Until a file exists, that cue is silent.

Placeholder WAV files named `.mp3` (macOS `say`) are not recordings. Do not play them.
`plaza_found.mp3` is still that placeholder; the find uses a soft chime until a real ElevenLabs clip is dropped.

`empty_quota.mp3` line: «В зоопарке больше нет мест. Позовём взрослого.»

`still_after_first.mp3` line: «Он ожил! Можно нарисовать ещё друзей — они появятся картинками. Оживить можно потом.»

`postcard_ready.mp3` line: «Вот открытка. Нажми Оживить — станет объёмным.»

`revive_need.mp3` line: «Позовём взрослого, чтобы оживить.»

`empty_still.mp3` line: «Картинки закончились. Можно оживить тех, кто уже есть, или купить ещё.» Still a placeholder until the ElevenLabs clip is dropped.

`plaza_need.mp3` line: «У тебя ещё нет зуфика для общего зоопарка. Нарисуй или сфотографируй его — тогда можно зайти.»

`plaza_draw.mp3` line: «Нарисуем дерево или штуку для этого зоопарка.»

`plaza_toy_wait.mp3` line: «Поставь картинку на поляну. Подожди чуть-чуть — и тут будет настоящая штука.» Replace the stub file with the ElevenLabs take; the plaque already shows this line.

Plaza batch (`plaza_*`): shared lawn. Same voice rules. Footsteps, hops, emoji and
stamps are synth in `plazaSfx.ts` — do not record those.
