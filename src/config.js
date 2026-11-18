// Réglages centraux du jeu. Modifier ici plutôt que dans le code.
export const CONFIG = {
  // Fichier de carte généré par tools/extract.html (voir data/README.md)
  DATA_URL: new URL('../data/kinshasa.json', import.meta.url).href,

  // Point de départ proposé par l'extracteur (Gombe, centre-ville de Kinshasa)
  DEFAULT_CENTER: { name: 'Gombe', lat: -4.30306, lon: 15.30333 },
  DEFAULT_RADIUS: 700,            // mètres autour du centre

  PEDESTRIANS: 40,
  CARS: 20,
  PED_SPEED: 1.6,                 // m/s
  CAR_SPEED: 9,                   // m/s
  SPAWN_MIN: 50, SPAWN_MAX: 180,  // les agents (re)naissent entre ces distances du joueur
  DESPAWN: 220,                   // au-delà, un agent est replacé près du joueur

  PLAYER_SPEED: 6,                // m/s
  DAY_SECONDS: 240,               // une journée = 4 minutes réelles
  START_TIME: 0.3                 // 0.25 = 06:00, 0.5 = midi
};
