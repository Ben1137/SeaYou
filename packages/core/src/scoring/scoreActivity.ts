import { ActivityPersona, HourlyConditions, ActivityScore } from '../types/scoring';
import { scoreWaveSurfer, scoreWindSurfer, scoreKiteSurfer, scoreBoogieBoarder, scoreSailor, scoreDiver, scoreBeachgoer } from './personas';

const scorers: Record<ActivityPersona, (c: HourlyConditions) => ActivityScore> = {
  [ActivityPersona.WAVE_SURFER]:    scoreWaveSurfer,
  [ActivityPersona.WIND_SURFER]:    scoreWindSurfer,
  [ActivityPersona.KITE_SURFER]:    scoreKiteSurfer,
  [ActivityPersona.BOOGIE_BOARDER]: scoreBoogieBoarder,
  [ActivityPersona.SAILOR]:         scoreSailor,
  [ActivityPersona.DIVER]:          scoreDiver,
  [ActivityPersona.BEACHGOER]:      scoreBeachgoer,
};

export function scoreActivity(persona: ActivityPersona, conditions: HourlyConditions): ActivityScore {
  return scorers[persona](conditions);
}
