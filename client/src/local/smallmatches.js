// Phones get smaller matches (4v4 / 6-player FFA): fewer bots to simulate and draw.
import { MODES } from '../../../shared/config.js';
export function useSmallMatches() {
  MODES.tdm.maxPlayers = 8;
  MODES.ffa.maxPlayers = 6;
}
